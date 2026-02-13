import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Multer in-memory upload
const upload = multer({ storage: multer.memoryStorage() });

// pdfjs-dist standard fonts path (prevents noisy warnings about standardFontDataUrl)
const require = createRequire(import.meta.url);
const pdfjsDistDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = pathToFileURL(path.join(pdfjsDistDir, "standard_fonts") + path.sep).toString();

// Gemini (OpenAI-compatible)
// Docs: https://ai.google.dev/gemini-api/docs/openai
const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// Allow overriding the model via .env, otherwise use a sensible default.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

function stripCodeFences(s) {
  if (!s) return s;
  let t = String(s).trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "");
    t = t.replace(/```$/, "");
    t = t.trim();
  }
  return t;
}

// ✅ Extract the first JSON object from text (Groq may wrap text around it)
function extractJsonObject(text) {
  const t = String(text || "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return t.slice(first, last + 1);
}

// Optional: catch unexpected crashes and show error
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

async function extractPdfText(buffer, maxChars = 8000) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl,
    // Reduce pdfjs verbosity (keeps console clean in dev)
    verbosity: pdfjsLib.VerbosityLevel.ERRORS,
  });
  const pdf = await loadingTask.promise;

  let out = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => it.str);
    out += strings.join(" ") + "\n";
    if (out.length >= maxChars) break;
  }

  return out.slice(0, maxChars);
}

app.post("/api/gaps/generate", upload.single("evidence"), async (req, res) => {
  try {
    const { standard, control, questions, response } = req.body;

    if (!standard || !control || !questions || !response) {
      return res.status(400).json({
        error: "Missing required fields: standard, control, questions, response",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Missing GEMINI_API_KEY in backend .env",
      });
    }

    let evidenceText = "";

    if (req.file) {
      if (req.file.mimetype !== "application/pdf") {
        return res
          .status(400)
          .json({ error: "Only PDF evidence supported for now." });
      }
      evidenceText = await extractPdfText(req.file.buffer, 8000);
    }

    const prompt = `
You are acting as an ISO/ISMS auditor and must produce an audit-grade gap analysis.

Context:
- Standard: ${standard}
- Control/Clause: ${control}

Audit Questions (what we asked the business):
${questions}

Business Response (what the business claims):
${response}

Evidence Extract (text extracted from uploaded evidence; may be incomplete if scanned):
${evidenceText}

NON-NEGOTIABLE RULES:
1) Do NOT hallucinate. If something is not explicitly present in the Evidence Extract or Business Response, mark it as "Not found".
2) You must evaluate BOTH:
   a) Whether the Business Response meets the control intent.
   b) Whether the Evidence supports/verifies the Business Response.
3) Treat the Evidence Extract as the only evidence you have. If it’s incomplete, say so in assumptions and reduce evidence_quality.
4) References are mandatory for each gap:
   - Use "Evidence: <quote or section hint>" if found in evidence text
   - Use "Response: <quote>" if found in response
   - If missing, use "Evidence: Not found" or "Response: Not stated"
5) Output MUST be valid JSON ONLY. No markdown. No code fences. No extra commentary.

AUDITOR MICRO-CHECKLIST (apply where relevant even if not mentioned):
For policies/procedures/evidence, check for:
- Document metadata: title, scope, applicability, owner, approver, approval date, effective date
- Version control: version number, revision history/change log, last reviewed date, next review cadence/frequency, distribution/access control
- Required sections depending on type: objectives, definitions, responsibilities, enforcement/discipline, exceptions handling, references to standards/laws
- Evidence strength: is it specific, current, signed/approved, and does it match the claim?
- Completeness: does evidence cover all parts of the response and the control intent?
- Traceability: does it allow an auditor to trace who approved, when, and what changed?
- Consistency: any contradictions between response and evidence?

SEVERITY GUIDANCE:
- High: Missing mandatory element, no evidence, or major contradiction / high risk.
- Medium: Partial evidence, outdated evidence, missing ownership/versioning/review, weak implementation proof.
- Low: Minor clarity issues, formatting, small missing details.

Now produce this exact JSON schema (JSON ONLY):

{
  "control": "<standard + control/clause>",
  "overall_summary": "<2-4 lines summary: compliance posture + evidence strength + main issues>",
  "gaps": [
    {
      "gap_title": "<short title>",
      "gap_description": "<what is missing/weak and why it matters>",
      "severity": "High|Medium|Low",
      "recommended_action": "<very specific remediation step(s)>",
      "evidence_needed": ["<list of evidence artifacts needed>"],
      "references": ["Evidence: ...", "Response: ..."]
    }
  ],
  "assumptions": ["<assumptions/limitations, especially about evidence extraction>"],
  "confidence": {
    "evidence_quality": 0.0,
    "response_clarity": 0.0,
    "overall": 0.0
  }
}
`;

    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    // Debug: log Gemini raw response to console
    const choice0 = completion?.choices?.[0];
    console.log("\n===== GEMINI RAW RESPONSE (debug) =====");
    console.log("model:", DEFAULT_MODEL);
    console.log("finish_reason:", choice0?.finish_reason);
    console.log("usage:", completion?.usage);
    console.log("content:\n", choice0?.message?.content);
    console.log("===== END GEMINI RAW RESPONSE =====\n");

    let content = completion.choices?.[0]?.message?.content || "";
    content = stripCodeFences(content);

    const jsonCandidate = extractJsonObject(content) || content;

    try {
      const obj = JSON.parse(jsonCandidate);
      return res.json(obj);
    } catch {
      // Return raw to debug model output format
      return res.json({ raw: content });
    }
  } catch (err) {
    console.error("AI processing failed:", err);
    return res.status(500).json({
      error: "AI processing failed",
      details: err?.message || String(err),
      provider: "gemini",
    });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
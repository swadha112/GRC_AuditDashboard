import express from "express";
import OpenAI from "openai";
import { ISO27001_CONTROLS } from "../constants/iso27001Controls.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const SOA_LITE_CONTROLS = ISO27001_CONTROLS.filter((c) =>
  ["A.5.1", "A.5.2", "A.5.15", "A.5.18", "A.5.23", "A.5.24", "A.8.13", "A.8.15"].includes(c.control)
);

const APPLICABILITY = ["Yes", "No", "Conditional", "Clarification Needed"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeActionables(actionables) {
  return Array.isArray(actionables)
    ? actionables
        .map((a) => {
          if (typeof a === "string") {
            return {
              text: a.trim(),
              type: "evidence_note",
              upload_required: false,
              uploadedFileName: "",
            };
          }
          return {
            text: String(a?.text || "").trim(),
            type: a?.type === "document" ? "document" : "evidence_note",
            upload_required: Boolean(a?.upload_required),
            uploadedFileName: "",
          };
        })
        .filter((a) => a.text)
    : [];
}

function normalizeRow(ctrl, found = {}) {
  return {
    standard: ctrl.standard,
    domain: ctrl.domain,
    clause: ctrl.clause,
    control: ctrl.control,
    title: ctrl.title,
    applicability: APPLICABILITY.includes(found.applicability)
      ? found.applicability
      : "Clarification Needed",
    justification: String(found.justification || "").trim(),
    clarification_question: String(found.clarification_question || "").trim(),
    actionables: normalizeActionables(found.actionables),
  };
}

function getGenerationPrompt(businessText, controlsBatch) {
  return `
Generate ISO 27001:2022 SoA rows for the given controls.

Use only the Business Function text. Do not invent facts.

Rules:
- applicability must be one of: Yes, No, Conditional, Clarification Needed
- keep results balanced; do not mark almost everything Yes
- use Clarification Needed rarely, only when truly necessary
- if Clarification Needed, add a short clarification_question, else keep it empty
- keep justification to 1 short sentence
- return exactly one row per control
- keep provided standard/domain/clause/control/title unchanged
- give at most 1 short actionable per control
- actionable format: { text, type, upload_required }
- use "document"/true only for a real uploadable artifact; otherwise use "evidence_note"/false

Return only valid JSON with:
{ "rows": [ { "standard": "", "domain": "", "clause": "", "control": "", "title": "", "applicability": "", "justification": "", "clarification_question": "", "actionables": [] } ] }

Business Function:
${businessText}

Controls:
${JSON.stringify(controlsBatch)}
`;
}

function buildSafeErrorMessage(error) {
  const status = error?.status || error?.response?.status;
  const apiMessage =
    error?.error?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.details ||
    error?.message;

  if (status && apiMessage) return `${status}: ${apiMessage}`;
  if (status) return `Request failed with status ${status}`;
  return apiMessage || "Unknown batch generation error";
}

async function createCompletionWithRetry(payload, options = {}) {
  const {
    maxRetries = 1,
    initialDelayMs = 5000,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.chat.completions.create(payload);
    } catch (error) {
      lastError = error;

      const status = error?.status || error?.response?.status;
      const retriable = status === 429 || status === 500 || status === 503 || status === 504;

      if (!retriable || attempt === maxRetries) {
        throw error;
      }

      const waitMs = initialDelayMs * Math.pow(2, attempt);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

async function generateSoABatch(businessText, controlsBatch) {
  const prompt = getGenerationPrompt(businessText, controlsBatch);

  const completion = await createCompletionWithRetry(
    {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
    {
      maxRetries: 1,
      initialDelayMs: 5000,
    }
  );

  const raw = completion?.choices?.[0]?.message?.content || "{}";

  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

  return controlsBatch.map((ctrl) => {
    const found = rows.find((r) => String(r.control) === ctrl.control) || {};
    return normalizeRow(ctrl, found);
  });
}

// ---------- Generate default ----------
router.post("/generate", async (req, res) => {
  try {
    const { businessText, mode = "lite" } = req.body || {};

    if (!businessText || !String(businessText).trim()) {
      return res.status(400).json({ error: "businessText is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in backend .env" });
    }

    const selectedControls = mode === "full" ? ISO27001_CONTROLS : SOA_LITE_CONTROLS;
    const rows = await generateSoABatch(String(businessText).trim(), selectedControls);

    return res.json({ rows, mode });
  } catch (e) {
    console.error("SoA generation failed:", e);
    return res.status(500).json({
      error: "SoA generation failed",
      details: buildSafeErrorMessage(e),
    });
  }
});

// ---------- Generate one batch ----------
router.post("/generate-batch", async (req, res) => {
  try {
    const { businessText, controlsBatch } = req.body || {};

    if (!businessText || !String(businessText).trim()) {
      return res.status(400).json({ error: "businessText is required" });
    }

    if (!Array.isArray(controlsBatch) || controlsBatch.length === 0) {
      return res.status(400).json({ error: "controlsBatch is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in backend .env" });
    }

    const safeControls = controlsBatch.map((c) => ({
      standard: String(c.standard || "ISO 27001:2022"),
      domain: String(c.domain || ""),
      clause: String(c.clause || "Annex A"),
      control: String(c.control || ""),
      title: String(c.title || ""),
    }));

    const rows = await generateSoABatch(String(businessText).trim(), safeControls);

    return res.json({ rows });
  } catch (e) {
    console.error("SoA batch generation failed:", e);
    return res.status(500).json({
      error: "SoA batch generation failed",
      details: buildSafeErrorMessage(e),
    });
  }
});

// ---------- Re-evaluate one row ----------
router.post("/re-evaluate-row", async (req, res) => {
  try {
    const { businessText, row, clarification } = req.body || {};

    if (!businessText || !String(businessText).trim()) {
      return res.status(400).json({ error: "businessText is required" });
    }
    if (!row || !row.control) {
      return res.status(400).json({ error: "row is required" });
    }
    if (!clarification || !String(clarification).trim()) {
      return res.status(400).json({ error: "clarification is required" });
    }

    const controlPayload = {
      standard: row.standard || "ISO 27001:2022",
      domain: row.domain || "Unknown",
      clause: row.clause || "Annex A",
      control: row.control,
      title: row.title || "",
    };

    const prompt = `
You are re-evaluating one Statement of Applicability row for ISO 27001:2022.

Task:
Use the original Business Function plus the user clarification to evaluate ONLY this single control.

Rules:
- Use only the provided information.
- Applicability must be one of: Yes | No | Conditional | Clarification Needed
- If applicability = Clarification Needed, provide a short clarification_question.
- Keep justification short, audit-style, and tied to the provided information.
- "Actionables" must be practical and easy to understand.
- Each actionable must be an object with:
  - text
  - type
  - upload_required
- Keep justification very short, ideally 1 sentence.
- Provide at most 1 actionable per control unless absolutely necessary.

Actionable rules:
- document => upload_required true
- evidence_note => upload_required false
- Do not mark an actionable as uploadable if it is only a rationale, SoA note, scope note, or internal justification.
- Mark those as evidence_note with upload_required = false.
- Only use document/upload_required = true when there is a distinct artifact that could realistically exist as a separate file, such as a policy, procedure, register, review record, architecture diagram, or approved report.

Return ONLY valid JSON:
{
  "row": {
    "standard": "ISO 27001:2022",
    "domain": "...",
    "clause": "Annex A",
    "control": "${controlPayload.control}",
    "title": "${controlPayload.title}",
    "applicability": "Yes|No|Conditional|Clarification Needed",
    "justification": "...",
    "clarification_question": "...",
    "actionables": [
      {
        "text": "...",
        "type": "document|evidence_note",
        "upload_required": true
      }
    ]
  }
}

Original Business Function:
${businessText}

Control to re-evaluate:
${JSON.stringify(controlPayload, null, 2)}

User clarification for this control:
${clarification}
`;

    const completion = await createCompletionWithRetry(
      {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      },
      {
        maxRetries: 1,
        initialDelayMs: 5000,
      }
    );

    const raw = completion?.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const evaluated = parsed?.row || {};
    const normalized = normalizeRow(controlPayload, evaluated);

    return res.json({ row: normalized });
  } catch (e) {
    console.error("Row re-evaluation failed:", e);
    return res.status(500).json({
      error: "Row re-evaluation failed",
      details: buildSafeErrorMessage(e),
    });
  }
});

export default router;
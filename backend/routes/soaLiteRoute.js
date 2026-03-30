import express from "express";
import OpenAI from "openai";

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const SOA_LITE_CONTROLS = [
  {
    standard: "ISO 27001:2022",
    domain: "Organizational",
    clause: "Annex A",
    control: "A.5.1",
    title: "Policies for information security",
  },
  {
    standard: "ISO 27001:2022",
    domain: "Organizational",
    clause: "Annex A",
    control: "A.5.2",
    title: "Information security roles and responsibilities",
  },
  {
    standard: "ISO 27001:2022",
    domain: "Organizational",
    clause: "Annex A",
    control: "A.5.15",
    title: "Access control",
  },
  {
    standard: "ISO 27001:2022",
    domain: "Organizational",
    clause: "Annex A",
    control: "A.5.18",
    title: "Access rights",
  },
  {
    standard: "ISO 27001:2022",
    domain: "Organizational",
    clause: "Annex A",
    control: "A.5.23",
    title: "Information security for use of cloud services",
  },
  {
    standard: "ISO 27001:2022",
    domain: "Organizational",
    clause: "Annex A",
    control: "A.5.24",
    title: "Information security incident management planning and preparation",
  },
  {
    standard: "ISO 27001:2022",
    domain: "Technological",
    clause: "Annex A",
    control: "A.8.13",
    title: "Information backup",
  },
  {
    standard: "ISO 27001:2022",
    domain: "Technological",
    clause: "Annex A",
    control: "A.8.15",
    title: "Logging",
  },
];

const APPLICABILITY = ["Yes", "No", "Conditional", "Clarification Needed"];

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

// ---------- Generate all rows ----------
router.post("/generate", async (req, res) => {
  try {
    const { businessText } = req.body || {};

    if (!businessText || !String(businessText).trim()) {
      return res.status(400).json({ error: "businessText is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in backend .env" });
    }

    const prompt = `
You are generating a lightweight Statement of Applicability for ISO 27001:2022.

Task:
For the given Business Function, evaluate ONLY the controls provided below.

Rules:
- Use only the Business Function text. Do not invent facts.
- Applicability must be one of: Yes | No | Conditional | Clarification Needed
- Make the output realistic: some controls may be Yes, some No, some Conditional, and some Clarification Needed.
- Use Clarification Needed only when the Business Function does not provide enough information to reasonably decide.
- If applicability = Clarification Needed, also provide a short clarification_question for that control.
- Keep justification short, audit-style, and tied to the business function.
- Return exactly one row for each control provided.
- Keep standard/domain/clause/control/title aligned with the provided control list.
- "Actionables" must be practical and easy to understand.
- Each actionable must be an object with:
  - text
  - type
  - upload_required

Actionable rules:
- If the control would normally require a document/policy/procedure/record that can be uploaded, set:
  - type = "document"
  - upload_required = true
- If the actionable is more of an operational expectation, activity, or evidence note that is not a single uploadable file for now, set:
  - type = "evidence_note"
  - upload_required = false
- Keep actionables short and concrete.
-Do not mark an actionable as uploadable if it is only a rationale, SoA note, scope note, or internal justification. Mark those as evidence_note with upload_required = false. Only use document/upload_required = true when there is a distinct artifact that could realistically exist as a separate file, such as a policy, procedure, register, review record, architecture diagram, or approved report.
Return ONLY valid JSON in this format:
{
  "rows": [
    {
      "standard": "ISO 27001:2022",
      "domain": "...",
      "clause": "Annex A",
      "control": "A.5.1",
      "title": "...",
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
  ]
}

Business Function:
${businessText}

Controls to evaluate:
${JSON.stringify(SOA_LITE_CONTROLS, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const raw = completion?.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const normalized = SOA_LITE_CONTROLS.map((ctrl) => {
      const found = rows.find((r) => String(r.control) === ctrl.control) || {};
      return normalizeRow(ctrl, found);
    });

    return res.json({ rows: normalized });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "SoA generation failed",
      details: e?.message || String(e),
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

Actionable rules:
- document => upload_required true
- evidence_note => upload_required false
-Do not mark an actionable as uploadable if it is only a rationale, SoA note, scope note, or internal justification. Mark those as evidence_note with upload_required = false. Only use document/upload_required = true when there is a distinct artifact that could realistically exist as a separate file, such as a policy, procedure, register, review record, architecture diagram, or approved report.
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

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

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
    console.error(e);
    return res.status(500).json({
      error: "Row re-evaluation failed",
      details: e?.message || String(e),
    });
  }
});

export default router;
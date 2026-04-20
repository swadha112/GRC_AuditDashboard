import express from "express";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import * as pdfParse from "pdf-parse";
import ExcelJS from "exceljs";
import { q } from "../db.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "soa-evidence");

function buildSafeErrorMessage(error) {
  const status = error?.status || error?.response?.status;
  const apiMessage =
    error?.error?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.details ||
    error?.message;

  if (status && apiMessage) return `${status}: ${apiMessage}`;
  if (status) return `Request failed with status ${status}`;
  return apiMessage || "Unknown evidence assessment error";
}

function safeHashKey(fileHash, storedName) {
  return String(fileHash || storedName || "");
}

function groupFilesByHash(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = safeHashKey(row.file_hash, row.stored_name);
    if (!key) continue;

    if (!grouped.has(key)) {
      grouped.set(key, {
        file_hash: row.file_hash,
        display_name: row.original_name,
        mime_type: row.mime_type,
        size_bytes: Number(row.size_bytes || 0),
        files: [],
        linked_controls: [],
        assessment_id: row.assessment_id || null,
        assessment_status: row.assessment_status || null,
        assessment_updated_at: row.assessment_updated_at || null,
      });
    }

    const entry = grouped.get(key);

    if (!entry.assessment_id && row.assessment_id) {
      entry.assessment_id = row.assessment_id;
      entry.assessment_status = row.assessment_status;
      entry.assessment_updated_at = row.assessment_updated_at;
    }

    entry.files.push({
      file_id: row.file_id,
      soa_actionable_id: row.soa_actionable_id,
      original_name: row.original_name,
      stored_name: row.stored_name,
      mime_type: row.mime_type,
      size_bytes: Number(row.size_bytes || 0),
      created_at: row.file_created_at,
    });

    const controlKey = `${row.control}__${row.row_id}`;
    const alreadyLinked = entry.linked_controls.some(
      (c) => `${c.control}__${c.row_id}` === controlKey
    );

    if (!alreadyLinked) {
      entry.linked_controls.push({
        row_id: row.row_id,
        standard: row.standard,
        domain: row.domain,
        clause: row.clause,
        control: row.control,
        title: row.title,
        applicability: row.applicability,
        justification: row.justification,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  );
}
async function getBusinessFiles(soaRecordId) {
  const out = await q(
    `SELECT
        r.id AS row_id,
        r.standard,
        r.domain,
        r.clause,
        r.control,
        r.title,
        r.applicability,
        r.justification,
        a.id AS soa_actionable_id,
        f.id AS file_id,
        f.original_name,
        f.stored_name,
        f.mime_type,
        f.size_bytes,
        f.file_hash,
        f.created_at AS file_created_at,
        ea.id AS assessment_id,
        ea.status AS assessment_status,
        ea.updated_at AS assessment_updated_at
     FROM soa_rows r
     JOIN soa_actionables a ON a.soa_row_id = r.id
     JOIN soa_actionable_files f ON f.soa_actionable_id = a.id
     LEFT JOIN LATERAL (
       SELECT id, status, updated_at
       FROM soa_evidence_assessments
       WHERE soa_record_id = r.soa_record_id
         AND file_hash = f.file_hash
       ORDER BY updated_at DESC
       LIMIT 1
     ) ea ON TRUE
     WHERE r.soa_record_id = $1
     ORDER BY f.original_name, r.control`,
    [soaRecordId]
  );

  return groupFilesByHash(out.rows);
}

async function extractTextFromPdf(filePath) {
  const buf = await fs.readFile(filePath);
  const parsed = await pdfParse.default(buf);
  return String(parsed?.text || "").trim();
}

async function extractTextFromTxt(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return String(text || "").trim();
}

async function extractTextFromXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const parts = [];

  workbook.worksheets.forEach((sheet) => {
    parts.push(`Sheet: ${sheet.name}`);
    sheet.eachRow((row) => {
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      const line = vals.map((v) => String(v ?? "")).join(" | ").trim();
      if (line) parts.push(line);
    });
  });

  return parts.join("\n").trim();
}

async function extractFileText(file) {
  const filePath = path.join(UPLOAD_DIR, file.stored_name);
  const mime = String(file.mime_type || "").toLowerCase();
  const name = String(file.original_name || "").toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    return extractTextFromPdf(filePath);
  }

  if (mime.includes("text/plain") || name.endsWith(".txt")) {
    return extractTextFromTxt(filePath);
  }

  if (
    mime.includes("spreadsheetml") ||
    name.endsWith(".xlsx")
  ) {
    return extractTextFromXlsx(filePath);
  }

  return "";
}

async function getOrCreateFileText(fileGroup) {
  const fileHash = fileGroup.file_hash;
  const primaryFile = fileGroup.files?.[0];

  if (!primaryFile) return "";

  if (fileHash) {
    const cached = await q(
      `SELECT extracted_text
       FROM soa_evidence_file_text_cache
       WHERE file_hash = $1
       LIMIT 1`,
      [fileHash]
    );

    if (cached.rows[0]?.extracted_text) {
      return cached.rows[0].extracted_text;
    }
  }

  let extractedText = "";
  let extractionStatus = "done";
  let extractionNotes = null;

  try {
    extractedText = await extractFileText(primaryFile);
  } catch (e) {
    extractionStatus = "failed";
    extractionNotes = e?.message || String(e);
    extractedText = "";
  }

  if (fileHash) {
    await q(
      `INSERT INTO soa_evidence_file_text_cache
        (file_hash, extracted_text, extraction_status, extraction_notes)
       VALUES
        ($1, $2, $3, $4)
       ON CONFLICT (file_hash)
       DO UPDATE SET
         extracted_text = EXCLUDED.extracted_text,
         extraction_status = EXCLUDED.extraction_status,
         extraction_notes = EXCLUDED.extraction_notes,
         updated_at = NOW()`,
      [fileHash, extractedText, extractionStatus, extractionNotes]
    );
  }

  return extractedText;
}

function buildAssessmentPrompt({ businessName, businessText, fileGroup, extractedText }) {
  return `
You are assessing whether one uploaded evidence file is appropriate for the linked ISO 27001:2022 controls.

Business Name:
${businessName}

Business Function:
${businessText}

File Name:
${fileGroup.display_name}

Linked Controls:
${JSON.stringify(fileGroup.linked_controls, null, 2)}

Extracted File Content:
${extractedText || "[No extractable text found]"}

Task:
For each linked control, decide whether this file is good evidence for that control.

Do NOT only check topic relevance.
Also check whether the document appears audit-usable and properly governed.

Check for:
- relevance to the control
- whether the content is specific enough
- version number / revision number
- version history / revision history
- effective date
- review date / next review date
- owner / author
- reviewer
- approver / approval indication / sign-off
- whether it appears current or outdated
- whether scope/purpose is clear

Important:
A file is not strong evidence just because it mentions the topic.
If content is relevant but governance/document-quality metadata is weak, mark it as "Partially Adequate", not "Adequate".

Allowed assessment_status values:
- Adequate
- Partially Adequate
- Inadequate
- Not Relevant

Keep findings short and audit-style.
Keep recommendations practical.

Return ONLY valid JSON in this format:
{
  "overall_summary": "...",
  "control_assessments": [
    {
      "control": "A.5.15",
      "title": "Access control",
      "standard": "ISO 27001:2022",
      "domain": "Organizational",
      "clause": "Annex A",
      "assessment_status": "Adequate|Partially Adequate|Inadequate|Not Relevant",
      "findings": "...",
      "document_quality_findings": "...",
      "missing_elements": ["..."],
      "recommendations": ["..."],
      "confidence": "Low|Medium|High"
    }
  ]
}
`;
}

async function runAssessmentLLM(payload) {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: payload }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = completion?.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function upsertAssessment({
  soaRecordId,
  fileGroup,
  overallSummary,
  controlAssessments,
  markSaved = false,
}) {
  const displayName = fileGroup.display_name || "Evidence File";
  const mimeType = fileGroup.mime_type || null;
  const sizeBytes = Number(fileGroup.size_bytes || 0);
  const fileHash = fileGroup.file_hash || fileGroup.files?.[0]?.stored_name;

  const assessmentRes = await q(
    `INSERT INTO soa_evidence_assessments
      (soa_record_id, file_hash, display_name, mime_type, size_bytes, overall_summary, assessor_type, status)
     VALUES
      ($1,$2,$3,$4,$5,$6,'hybrid',$7)
     ON CONFLICT (soa_record_id, file_hash)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       mime_type = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes,
       overall_summary = EXCLUDED.overall_summary,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [
      soaRecordId,
      fileHash,
      displayName,
      mimeType,
      sizeBytes,
      String(overallSummary || ""),
      markSaved ? "saved" : "draft",
    ]
  );

  const assessment = assessmentRes.rows[0];

  for (const ctrl of fileGroup.linked_controls || []) {
    const found =
      (controlAssessments || []).find((x) => String(x.control) === String(ctrl.control)) || {};

    await q(
      `INSERT INTO soa_evidence_assessment_controls
        (assessment_id, standard, domain, clause, control, title, assessment_status,
         findings, document_quality_findings, missing_elements, recommendations, confidence)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (assessment_id, control)
       DO UPDATE SET
         standard = EXCLUDED.standard,
         domain = EXCLUDED.domain,
         clause = EXCLUDED.clause,
         title = EXCLUDED.title,
         assessment_status = EXCLUDED.assessment_status,
         findings = EXCLUDED.findings,
         document_quality_findings = EXCLUDED.document_quality_findings,
         missing_elements = EXCLUDED.missing_elements,
         recommendations = EXCLUDED.recommendations,
         confidence = EXCLUDED.confidence,
         updated_at = NOW()`,
      [
        assessment.id,
        String(found.standard || ctrl.standard || "ISO 27001:2022"),
        String(found.domain || ctrl.domain || ""),
        String(found.clause || ctrl.clause || ""),
        String(ctrl.control || ""),
        String(found.title || ctrl.title || ""),
        String(found.assessment_status || "Partially Adequate"),
        String(found.findings || ""),
        String(found.document_quality_findings || ""),
        Array.isArray(found.missing_elements) ? found.missing_elements.map(String) : [],
        Array.isArray(found.recommendations) ? found.recommendations.map(String) : [],
        String(found.confidence || "Medium"),
      ]
    );
  }

  for (const f of fileGroup.files || []) {
    await q(
      `INSERT INTO soa_evidence_assessment_file_links
        (assessment_id, soa_actionable_file_id)
       VALUES
        ($1,$2)
       ON CONFLICT (assessment_id, soa_actionable_file_id)
       DO NOTHING`,
      [assessment.id, f.file_id]
    );
  }

  return assessment.id;
}

async function buildFullAssessment(assessmentId) {
  const assessmentRes = await q(
    `SELECT * FROM soa_evidence_assessments WHERE id = $1`,
    [assessmentId]
  );
  const assessment = assessmentRes.rows[0];
  if (!assessment) return null;

  const controlsRes = await q(
    `SELECT *
     FROM soa_evidence_assessment_controls
     WHERE assessment_id = $1
     ORDER BY control`,
    [assessmentId]
  );

  const filesRes = await q(
    `SELECT
        l.id,
        l.soa_actionable_file_id,
        f.original_name,
        f.stored_name,
        f.mime_type,
        f.size_bytes,
        f.file_hash,
        f.created_at
     FROM soa_evidence_assessment_file_links l
     JOIN soa_actionable_files f ON f.id = l.soa_actionable_file_id
     WHERE l.assessment_id = $1
     ORDER BY f.original_name`,
    [assessmentId]
  );

  return {
    ...assessment,
    controls: controlsRes.rows,
    files: filesRes.rows,
  };
}

// --------------------------------------------------
// GET businesses for dropdown
// --------------------------------------------------
router.get("/businesses", async (req, res) => {
  try {
    const out = await q(
      `SELECT id, business_name, created_at, updated_at
       FROM soa_records
       ORDER BY updated_at DESC`
    );
    return res.json({ businesses: out.rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to load businesses",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// GET unique files for one saved business
// --------------------------------------------------
router.get("/business/:soaRecordId/files", async (req, res) => {
  try {
    const soaRecordId = Number(req.params.soaRecordId);
    if (!Number.isFinite(soaRecordId)) {
      return res.status(400).json({ error: "Invalid soaRecordId" });
    }

    const files = await getBusinessFiles(soaRecordId);
    return res.json({ files });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to load business files",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// POST run assessment for one unique file hash
// body: { soaRecordId, fileHash }
// --------------------------------------------------
router.post("/run", async (req, res) => {
  try {
    const { soaRecordId, fileHash } = req.body || {};

    if (!Number.isFinite(Number(soaRecordId))) {
      return res.status(400).json({ error: "soaRecordId is required" });
    }
    if (!fileHash || !String(fileHash).trim()) {
      return res.status(400).json({ error: "fileHash is required" });
    }

    const businessRes = await q(
      `SELECT * FROM soa_records WHERE id = $1 LIMIT 1`,
      [Number(soaRecordId)]
    );
    const business = businessRes.rows[0];
    if (!business) {
      return res.status(404).json({ error: "Saved business not found" });
    }

    const files = await getBusinessFiles(Number(soaRecordId));
    const fileGroup = files.find((f) => String(f.file_hash || f.files?.[0]?.stored_name) === String(fileHash));
    if (!fileGroup) {
      return res.status(404).json({ error: "Grouped file not found for this business" });
    }

    const extractedText = await getOrCreateFileText(fileGroup);

    const prompt = buildAssessmentPrompt({
      businessName: business.business_name,
      businessText: business.business_text,
      fileGroup,
      extractedText,
    });

    const parsed = await runAssessmentLLM(prompt);

    const assessmentId = await upsertAssessment({
      soaRecordId: Number(soaRecordId),
      fileGroup,
      overallSummary: parsed?.overall_summary || "",
      controlAssessments: parsed?.control_assessments || [],
      markSaved: false,
    });

    const full = await buildFullAssessment(assessmentId);
    return res.json(full);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to run evidence assessment",
      details: buildSafeErrorMessage(e),
    });
  }
});

// --------------------------------------------------
// GET one saved assessment
// --------------------------------------------------
router.get("/:assessmentId", async (req, res) => {
  try {
    const assessmentId = Number(req.params.assessmentId);
    if (!Number.isFinite(assessmentId)) {
      return res.status(400).json({ error: "Invalid assessmentId" });
    }

    const full = await buildFullAssessment(assessmentId);
    if (!full) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    return res.json(full);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to load assessment",
      details: e?.message || String(e),
    });
  }
});
// --------------------------------------------------
// GET all saved assessments for one business
// --------------------------------------------------
router.get("/business/:soaRecordId/assessments/list", async (req, res) => {
  try {
    const soaRecordId = Number(req.params.soaRecordId);
    if (!Number.isFinite(soaRecordId)) {
      return res.status(400).json({ error: "Invalid soaRecordId" });
    }

    const out = await q(
      `SELECT *
       FROM soa_evidence_assessments
       WHERE soa_record_id = $1
       ORDER BY updated_at DESC`,
      [soaRecordId]
    );

    return res.json({ assessments: out.rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to list assessments",
      details: e?.message || String(e),
    });
  }
});
// --------------------------------------------------
// PATCH overall assessment summary / status
// --------------------------------------------------
router.patch("/:assessmentId", async (req, res) => {
  try {
    const assessmentId = Number(req.params.assessmentId);
    if (!Number.isFinite(assessmentId)) {
      return res.status(400).json({ error: "Invalid assessmentId" });
    }

    const { overall_summary, status } = req.body || {};

    const out = await q(
      `UPDATE soa_evidence_assessments
       SET overall_summary = COALESCE($1, overall_summary),
           status = COALESCE($2, status),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [overall_summary ?? null, status ?? null, assessmentId]
    );

    if (!out.rows[0]) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    return res.json(out.rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to update assessment",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// PATCH one control result (HITL edit)
// --------------------------------------------------
router.patch("/controls/:controlAssessmentId", async (req, res) => {
  try {
    const controlAssessmentId = Number(req.params.controlAssessmentId);
    if (!Number.isFinite(controlAssessmentId)) {
      return res.status(400).json({ error: "Invalid controlAssessmentId" });
    }

    const {
      assessment_status,
      findings,
      document_quality_findings,
      missing_elements,
      recommendations,
      confidence,
      edited_after_save = true,
    } = req.body || {};

    const out = await q(
      `UPDATE soa_evidence_assessment_controls
       SET assessment_status = COALESCE($1, assessment_status),
           findings = COALESCE($2, findings),
           document_quality_findings = COALESCE($3, document_quality_findings),
           missing_elements = COALESCE($4, missing_elements),
           recommendations = COALESCE($5, recommendations),
           confidence = COALESCE($6, confidence),
           edited_after_save = COALESCE($7, edited_after_save),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        assessment_status ?? null,
        findings ?? null,
        document_quality_findings ?? null,
        Array.isArray(missing_elements) ? missing_elements.map(String) : null,
        Array.isArray(recommendations) ? recommendations.map(String) : null,
        confidence ?? null,
        edited_after_save,
        controlAssessmentId,
      ]
    );

    if (!out.rows[0]) {
      return res.status(404).json({ error: "Control assessment not found" });
    }

    return res.json(out.rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to update control assessment",
      details: e?.message || String(e),
    });
  }
});



export default router;
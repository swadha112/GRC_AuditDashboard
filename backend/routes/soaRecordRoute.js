import express from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { q } from "../db.js";
import crypto from "crypto";
const router = express.Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "soa-evidence");

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}
async function computeFileHash(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}
function nowSafeName(name) {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}_${String(name).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function safeFileName(name) {
  return String(name || "soa").replace(/[^a-zA-Z0-9._-]/g, "_");
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureUploadDir();
      cb(null, UPLOAD_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    cb(null, nowSafeName(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// -----------------------------
// Helpers
// -----------------------------
async function buildFullSoARecord(recordId) {
  const recordRes = await q(
    `SELECT * FROM soa_records WHERE id = $1`,
    [recordId]
  );
  const record = recordRes.rows[0];
  if (!record) return null;

  const rowsRes = await q(
    `SELECT * FROM soa_rows WHERE soa_record_id = $1 ORDER BY control`,
    [recordId]
  );
  const rows = rowsRes.rows;

  const rowIds = rows.map((r) => r.id);
  let actionables = [];
  let files = [];

  if (rowIds.length) {
    const actionablesRes = await q(
      `SELECT * FROM soa_actionables WHERE soa_row_id = ANY($1::bigint[]) ORDER BY id`,
      [rowIds]
    );
    actionables = actionablesRes.rows;

    const actionableIds = actionables.map((a) => a.id);
    if (actionableIds.length) {
      const filesRes = await q(
        `SELECT * FROM soa_actionable_files WHERE soa_actionable_id = ANY($1::bigint[]) ORDER BY created_at DESC`,
        [actionableIds]
      );
      files = filesRes.rows;
    }
  }

  const actionablesByRow = {};
  for (const a of actionables) {
    if (!actionablesByRow[a.soa_row_id]) actionablesByRow[a.soa_row_id] = [];
    actionablesByRow[a.soa_row_id].push({
      id: a.id,
      text: a.text,
      type: a.type,
      upload_required: a.upload_required,
      files: files
        .filter((f) => f.soa_actionable_id === a.id)
        .map((f) => ({
          id: f.id,
          original_name: f.original_name,
          stored_name: f.stored_name,
          mime_type: f.mime_type,
          size_bytes: Number(f.size_bytes || 0),
          created_at: f.created_at,
        })),
    });
  }

  return {
    id: record.id,
    business_name: record.business_name,
    business_text: record.business_text,
    created_at: record.created_at,
    updated_at: record.updated_at,
    rows: rows.map((r) => ({
      id: r.id,
      standard: r.standard,
      domain: r.domain,
      clause: r.clause,
      control: r.control,
      title: r.title,
      applicability: r.applicability,
      justification: r.justification,
      clarification_question: r.clarification_question,
      actionables: actionablesByRow[r.id] || [],
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  };
}

function flattenSoAForExport(full) {
    const rows = [];
  
    for (const row of full.rows || []) {
      const actionables = Array.isArray(row.actionables) ? row.actionables : [];
  
      const rowMissingEvidence = actionables.some(
        (a) => a.upload_required && (!a.files || a.files.length === 0)
      );
  
      const actionableTextCombined = actionables
        .map((a, idx) => {
          const files = (a.files || []).map((f) => f.original_name).join(", ");
          const missingThisActionable =
            a.upload_required && (!a.files || a.files.length === 0);
  
          return [
            `${idx + 1}. ${a.text || ""}`,
            `Type: ${a.type || ""}`,
            `Upload Required: ${a.upload_required ? "Yes" : "No"}`,
            `Evidence Status: ${missingThisActionable ? "Missing Evidence" : "Complete"}`,
            files ? `Files: ${files}` : "",
          ]
            .filter(Boolean)
            .join(" | ");
        })
        .join("\n\n");
  
      rows.push({
        business_name: full.business_name,
        standard: row.standard,
        domain: row.domain,
        clause: row.clause,
        control: row.control,
        title: row.title,
        applicability: row.applicability,
        justification: row.justification,
        clarification_question: row.clarification_question,
        actionable_text: actionableTextCombined,
        evidence_status: rowMissingEvidence ? "Missing Evidence" : "Complete",
      });
    }
  
    return rows;
  }
  async function touchSoARecordByRowId(rowId) {
    const out = await q(
      `SELECT soa_record_id FROM soa_rows WHERE id = $1 LIMIT 1`,
      [rowId]
    );
    const soaRecordId = out.rows[0]?.soa_record_id;
    if (!soaRecordId) return;
    await q(`UPDATE soa_records SET updated_at = NOW() WHERE id = $1`, [soaRecordId]);
  }
  
  async function touchSoARecordByActionableId(actionableId) {
    const out = await q(
      `SELECT r.soa_record_id
       FROM soa_actionables a
       JOIN soa_rows r ON r.id = a.soa_row_id
       WHERE a.id = $1
       LIMIT 1`,
      [actionableId]
    );
    const soaRecordId = out.rows[0]?.soa_record_id;
    if (!soaRecordId) return;
    await q(`UPDATE soa_records SET updated_at = NOW() WHERE id = $1`, [soaRecordId]);
  }
  
  async function touchSoARecordByFileId(fileId) {
    const out = await q(
      `SELECT r.soa_record_id
       FROM soa_actionable_files f
       JOIN soa_actionables a ON a.id = f.soa_actionable_id
       JOIN soa_rows r ON r.id = a.soa_row_id
       WHERE f.id = $1
       LIMIT 1`,
      [fileId]
    );
    const soaRecordId = out.rows[0]?.soa_record_id;
    if (!soaRecordId) return;
    await q(`UPDATE soa_records SET updated_at = NOW() WHERE id = $1`, [soaRecordId]);
  }
  
  function dedupeRowsByControl(rows) {
    const out = [];
    const seen = new Set();
  
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = String(row?.control || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  
    return out;
  }
// -----------------------------
// Save new SoA
// POST /api/soa-records
// -----------------------------
router.post("/", async (req, res) => {
  try {
    const { businessName, businessText, rows, overwrite = false } = req.body || {};

    if (!businessName || !String(businessName).trim()) {
      return res.status(400).json({ error: "businessName is required" });
    }
    if (!businessText || !String(businessText).trim()) {
      return res.status(400).json({ error: "businessText is required" });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows[] is required" });
    }

    const cleanBusinessName = String(businessName).trim();
    const cleanBusinessText = String(businessText).trim();
    const dedupedRows = dedupeRowsByControl(rows);

    if (!dedupedRows.length) {
      return res.status(400).json({ error: "No valid unique rows to save" });
    }

    const existing = await q(
      `SELECT id FROM soa_records WHERE business_name = $1 LIMIT 1`,
      [cleanBusinessName]
    );

    let soaRecordId;

    if (existing.rows[0] && !overwrite) {
      return res.status(409).json({
        error: "Business name already exists",
        details: "Use a different business name or overwrite the existing SoA.",
      });
    }

    if (existing.rows[0] && overwrite) {
      soaRecordId = existing.rows[0].id;

      const existingRowsRes = await q(
        `SELECT id FROM soa_rows WHERE soa_record_id = $1`,
        [soaRecordId]
      );
      const existingRowIds = existingRowsRes.rows.map((r) => r.id);

      if (existingRowIds.length) {
        const existingActionablesRes = await q(
          `SELECT id FROM soa_actionables WHERE soa_row_id = ANY($1::bigint[])`,
          [existingRowIds]
        );
        const existingActionableIds = existingActionablesRes.rows.map((a) => a.id);

        if (existingActionableIds.length) {
          const existingFilesRes = await q(
            `SELECT id, stored_name FROM soa_actionable_files WHERE soa_actionable_id = ANY($1::bigint[])`,
            [existingActionableIds]
          );

          for (const f of existingFilesRes.rows) {
            try {
              await fs.unlink(path.join(UPLOAD_DIR, f.stored_name));
            } catch {
              // ignore missing physical file
            }
          }

          await q(
            `DELETE FROM soa_actionable_files WHERE soa_actionable_id = ANY($1::bigint[])`,
            [existingActionableIds]
          );
        }

        await q(`DELETE FROM soa_actionables WHERE soa_row_id = ANY($1::bigint[])`, [existingRowIds]);
        await q(`DELETE FROM soa_rows WHERE soa_record_id = $1`, [soaRecordId]);
      }

      await q(
        `UPDATE soa_records
         SET business_text = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [cleanBusinessText, soaRecordId]
      );
    } else {
      const recRes = await q(
        `INSERT INTO soa_records (business_name, business_text)
         VALUES ($1, $2)
         RETURNING id`,
        [cleanBusinessName, cleanBusinessText]
      );
      soaRecordId = recRes.rows[0].id;
    }

    for (const row of dedupedRows) {
      const rowRes = await q(
        `INSERT INTO soa_rows
          (soa_record_id, standard, domain, clause, control, title, applicability, justification, clarification_question)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          soaRecordId,
          String(row.standard || "ISO 27001:2022"),
          String(row.domain || ""),
          String(row.clause || ""),
          String(row.control || ""),
          String(row.title || ""),
          String(row.applicability || "Clarification Needed"),
          String(row.justification || ""),
          String(row.clarification_question || ""),
        ]
      );

      const soaRowId = rowRes.rows[0].id;

      const actionables = Array.isArray(row.actionables) ? row.actionables : [];
      for (const a of actionables) {
        await q(
          `INSERT INTO soa_actionables
            (soa_row_id, text, type, upload_required)
           VALUES
            ($1,$2,$3,$4)`,
          [
            soaRowId,
            String(a.text || ""),
            a.type === "document" ? "document" : "evidence_note",
            Boolean(a.upload_required),
          ]
        );
      }
    }

    await q(`UPDATE soa_records SET updated_at = NOW() WHERE id = $1`, [soaRecordId]);

    const full = await buildFullSoARecord(soaRecordId);
    return res.json({
      ...full,
      saved_row_count: full?.rows?.length || 0,
      overwrite_used: Boolean(overwrite),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to save SoA",
      details: e?.message || String(e),
    });
  }
});
// -----------------------------
// List saved SoAs
// GET /api/soa-records
// -----------------------------
router.get("/", async (req, res) => {
  try {
    const out = await q(
      `SELECT id, business_name, created_at, updated_at
       FROM soa_records
       ORDER BY updated_at DESC`
    );
    return res.json({ records: out.rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to list SoA records",
      details: e?.message || String(e),
    });
  }
});

// -----------------------------
// Get full SoA by record id
// GET /api/soa-records/:id
// -----------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const full = await buildFullSoARecord(id);
    if (!full) return res.status(404).json({ error: "SoA record not found" });

    return res.json(full);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to fetch SoA record",
      details: e?.message || String(e),
    });
  }
});

// -----------------------------
// Update a saved SoA row
// PATCH /api/soa-records/rows/:rowId
// -----------------------------
router.patch("/rows/:rowId", async (req, res) => {
  try {
    const rowId = Number(req.params.rowId);
    if (!Number.isFinite(rowId)) {
      return res.status(400).json({ error: "Invalid rowId" });
    }

    const { applicability, justification, clarification_question } = req.body || {};

    const updated = await q(
      `UPDATE soa_rows
       SET applicability = COALESCE($1, applicability),
           justification = COALESCE($2, justification),
           clarification_question = COALESCE($3, clarification_question),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [applicability ?? null, justification ?? null, clarification_question ?? null, rowId]
    );

    if (!updated.rows[0]) {
      return res.status(404).json({ error: "SoA row not found" });
    }
    await touchSoARecordByRowId(rowId);
    return res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to update row",
      details: e?.message || String(e),
    });
  }
});

// -----------------------------
// Replace actionables for a row
// PATCH /api/soa-records/rows/:rowId/actionables
// -----------------------------
router.patch("/rows/:rowId/actionables", async (req, res) => {
  try {
    const rowId = Number(req.params.rowId);
    if (!Number.isFinite(rowId)) {
      return res.status(400).json({ error: "Invalid rowId" });
    }

    const { actionables } = req.body || {};
    if (!Array.isArray(actionables)) {
      return res.status(400).json({ error: "actionables[] is required" });
    }

    const old = await q(
      `SELECT id FROM soa_actionables WHERE soa_row_id = $1`,
      [rowId]
    );
    const oldIds = old.rows.map((r) => r.id);

    if (oldIds.length) {
      await q(
        `DELETE FROM soa_actionable_files WHERE soa_actionable_id = ANY($1::bigint[])`,
        [oldIds]
      );
    }

    await q(`DELETE FROM soa_actionables WHERE soa_row_id = $1`, [rowId]);

    for (const a of actionables) {
      await q(
        `INSERT INTO soa_actionables
          (soa_row_id, text, type, upload_required)
         VALUES
          ($1,$2,$3,$4)`,
        [
          rowId,
          String(a.text || ""),
          a.type === "document" ? "document" : "evidence_note",
          Boolean(a.upload_required),
        ]
      );
    }
    await touchSoARecordByRowId(rowId);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to update actionables",
      details: e?.message || String(e),
    });
  }
});

// -----------------------------
// Upload multiple files for one actionable
// POST /api/soa-records/actionables/:actionableId/files
// -----------------------------
router.post(
  "/actionables/:actionableId/files",
  upload.array("files", 10),
  async (req, res) => {
    try {
      const actionableId = Number(req.params.actionableId);
      if (!Number.isFinite(actionableId)) {
        return res.status(400).json({ error: "Invalid actionableId" });
      }

      const exists = await q(
        `SELECT id FROM soa_actionables WHERE id = $1 LIMIT 1`,
        [actionableId]
      );
      if (!exists.rows[0]) {
        return res.status(404).json({ error: "Actionable not found" });
      }

      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const inserted = [];
      for (const f of files) {
        const filePath = path.join(UPLOAD_DIR, f.filename);
        const fileHash = await computeFileHash(filePath);

        const out = await q(
          `INSERT INTO soa_actionable_files
            (soa_actionable_id, original_name, stored_name, mime_type, size_bytes, file_hash)
          VALUES
            ($1,$2,$3,$4,$5,$6)
          RETURNING *`,
          [
            actionableId,
            f.originalname,
            f.filename,
            f.mimetype || "application/octet-stream",
            f.size || 0,
            fileHash,
          ]
        );

  inserted.push(out.rows[0]);
}
      await touchSoARecordByActionableId(actionableId);
      return res.json({ files: inserted });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        error: "Failed to upload files",
        details: e?.message || String(e),
      });
    }
  }
);

// -----------------------------
// View file inline
// GET /api/soa-records/files/:fileId/view
// -----------------------------
router.get("/files/:fileId/view", async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    if (!Number.isFinite(fileId)) {
      return res.status(400).json({ error: "Invalid fileId" });
    }

    const out = await q(
      `SELECT * FROM soa_actionable_files WHERE id = $1 LIMIT 1`,
      [fileId]
    );
    const file = out.rows[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${file.original_name}"`);
    return res.sendFile(filePath);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to view file",
      details: e?.message || String(e),
    });
  }
});

// -----------------------------
// Download file
// GET /api/soa-records/files/:fileId/download
// -----------------------------
router.get("/files/:fileId/download", async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    if (!Number.isFinite(fileId)) {
      return res.status(400).json({ error: "Invalid fileId" });
    }

    const out = await q(
      `SELECT * FROM soa_actionable_files WHERE id = $1 LIMIT 1`,
      [fileId]
    );
    const file = out.rows[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    return res.download(filePath, file.original_name);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to download file",
      details: e?.message || String(e),
    });
  }
});

// -----------------------------
// Delete file
// DELETE /api/soa-records/files/:fileId
// -----------------------------
router.delete("/files/:fileId", async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    if (!Number.isFinite(fileId)) {
      return res.status(400).json({ error: "Invalid fileId" });
    }

    const out = await q(
      `SELECT * FROM soa_actionable_files WHERE id = $1 LIMIT 1`,
      [fileId]
    );
    const file = out.rows[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    await touchSoARecordByFileId(fileId);
    await q(`DELETE FROM soa_actionable_files WHERE id = $1`, [fileId]);

    try {
      await fs.unlink(filePath);
    } catch {
        // ignore if already missing
      }
      
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to delete file",
      details: e?.message || String(e),
    });
  }
});

// -----------------------------
// Export PDF  (professional layout)
// GET /api/soa-records/:id/export/pdf
// -----------------------------
router.get("/:id/export/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const full = await buildFullSoARecord(id);
    if (!full) return res.status(404).json({ error: "SoA record not found" });

    const filename = `${safeFileName(full.business_name)}_soa.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // ── Palette ──────────────────────────────────────────
    const C = {
      brand:  "#4318FF",
      navy:   "#1B254B",
      gray:   "#A3AED0",
      light:  "#F4F7FE",
      border: "#E2E8F0",
      green:  "#01B574",
      red:    "#EE5D50",
      yellow: "#FFB547",
      cyan:   "#6AD2FF",
      white:  "#FFFFFF",
    };

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M      = 40;           // margin
    const CW     = PAGE_W - M * 2; // content width

    const rows     = full.rows || [];
    const missing  = rows.filter(r => (r.actionables||[]).some(a => a.upload_required && (!a.files||a.files.length===0))).length;
    const complete = rows.length - missing;
    const pct      = rows.length ? Math.round((complete / rows.length) * 100) : 0;

    const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
    doc.pipe(res);

    // ── Helper: draw a filled rounded-ish rect (PDFKit uses rect for simplicity) ──
    function fillRect(x, y, w, h, color) {
      doc.save().rect(x, y, w, h).fill(color).restore();
    }

    // ── Helper: draw table cell border ──
    function cellBorder(x, y, w, h) {
      doc.save().rect(x, y, w, h).stroke(C.border).lineWidth(0.5).restore();
    }

    // ── Helper: safe text (avoid PDFKit errors from null) ──
    function t(v) { return String(v == null ? "" : v); }

    // ── Helper: applicability color ──
    function appColor(v) {
      const s = (v||"").toLowerCase();
      if (s === "yes")                 return C.green;
      if (s === "no")                  return C.red;
      if (s === "conditional")         return C.yellow;
      if (s === "clarification needed") return C.cyan;
      return C.gray;
    }

    // ══════════════════════════════════════════════════════
    // PAGE 1 — COVER
    // ══════════════════════════════════════════════════════

    // Top brand band
    fillRect(0, 0, PAGE_W, 180, C.brand);

    // Accent stripe
    fillRect(0, 180, PAGE_W, 6, "#3311DB");

    // Title
    doc.font("Helvetica-Bold").fontSize(24).fillColor(C.white)
       .text("Statement of Applicability", M, 52, { width: CW });
    doc.font("Helvetica").fontSize(11).fillColor("rgba(255,255,255,0.75)")
       .text("ISO 27001:2022  —  Information Security Management", M, 86, { width: CW });

    // Business name bar
    fillRect(0, 186, PAGE_W, 64, C.navy);
    doc.font("Helvetica-Bold").fontSize(17).fillColor(C.white)
       .text(t(full.business_name), M, 204, { width: CW });

    // Metadata row
    const metaY = 278;
    const metaCols = [
      { label: "GENERATED",     value: new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) },
      { label: "LAST UPDATED",  value: new Date(full.updated_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) },
      { label: "PREPARED BY",   value: "GRC Audit Dashboard" },
      { label: "STANDARD",      value: "ISO/IEC 27001:2022" },
    ];
    metaCols.forEach((col, i) => {
      const x = M + i * 130;
      doc.font("Helvetica-Bold").fontSize(7).fillColor(C.gray).text(col.label, x, metaY);
      doc.font("Helvetica").fontSize(9).fillColor(C.navy).text(col.value, x, metaY + 13);
    });

    // Divider
    fillRect(M, metaY + 38, CW, 1, C.border);

    // Stats cards
    const statsY = metaY + 52;
    const statItems = [
      { label: "TOTAL CONTROLS",   value: String(rows.length), color: C.brand  },
      { label: "COMPLETE",          value: String(complete),    color: C.green  },
      { label: "MISSING EVIDENCE",  value: String(missing),     color: C.red    },
      { label: "COMPLETION RATE",   value: `${pct}%`,           color: pct >= 80 ? C.green : pct >= 50 ? C.yellow : C.red },
    ];
    const statW = Math.floor(CW / 4) - 4;
    statItems.forEach((s, i) => {
      const x = M + i * (statW + 5);
      fillRect(x, statsY, statW, 64, C.light);
      // Left accent bar
      fillRect(x, statsY, 3, 64, s.color);
      doc.font("Helvetica-Bold").fontSize(22).fillColor(s.color)
         .text(s.value, x + 10, statsY + 10, { width: statW - 14, align: "center" });
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.gray)
         .text(s.label, x + 10, statsY + 42, { width: statW - 14, align: "center" });
    });

    // Business function section
    if (full.business_text) {
      const bfY = statsY + 86;
      fillRect(M, bfY, CW, 22, C.navy);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white)
         .text("BUSINESS FUNCTION", M + 10, bfY + 7);

      const bfBodyY = bfY + 28;
      doc.font("Helvetica").fontSize(9).fillColor(C.navy)
         .text(t(full.business_text), M, bfBodyY, { width: CW, lineGap: 2 });
    }

    // Footer note
    doc.font("Helvetica").fontSize(8).fillColor(C.gray)
       .text("CONFIDENTIAL — For internal audit use only", M, PAGE_H - 36, { width: CW, align: "center" });

    // ══════════════════════════════════════════════════════
    // PAGE 2+ — CONTROLS TABLE
    // ══════════════════════════════════════════════════════

    // Column definitions (total = CW = 515.28)
    const cols = [
      { key: "control",         header: "Control",       w: 52,  bold: true  },
      { key: "domain",          header: "Domain",        w: 78,  bold: false },
      { key: "clause",          header: "Clause",        w: 44,  bold: false },
      { key: "title",           header: "Title",         w: 128, bold: false },
      { key: "applicability",   header: "Applicability", w: 72,  bold: false },
      { key: "justification",   header: "Justification", w: 141, bold: false },
    ];
    // Total = 52+78+44+128+72+141 = 515 ✓

    const TABLE_X  = M;
    const HDR_H    = 28;
    const CELL_PAD = 5;
    const PAGE_BOT = PAGE_H - 44;  // bottom boundary before footer

    let curY = 0;
    let pageNum = 1;

    function addTablePage() {
      doc.addPage({ margin: 0, size: "A4" });
      pageNum++;

      // Page header band
      fillRect(0, 0, PAGE_W, 28, C.navy);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.white)
         .text(t(full.business_name) + "  —  Statement of Applicability  (ISO 27001:2022)", M, 10, { width: CW - 60 });
      doc.font("Helvetica").fontSize(7).fillColor("rgba(255,255,255,0.55)")
         .text(`Page ${pageNum}`, PAGE_W - M - 40, 10, { width: 40, align: "right" });

      curY = 36;
      drawTableHeader();
    }

    function drawTableHeader() {
      fillRect(TABLE_X, curY, CW, HDR_H, C.brand);
      let cx = TABLE_X;
      cols.forEach(col => {
        doc.font("Helvetica-Bold").fontSize(7).fillColor(C.white)
           .text(col.header.toUpperCase(), cx + CELL_PAD, curY + 10, { width: col.w - CELL_PAD * 2, lineBreak: false });
        cx += col.w;
      });
      curY += HDR_H;
    }

    // Start first table page
    addTablePage();

    rows.forEach((row, idx) => {
      const isMissing = (row.actionables||[]).some(a => a.upload_required && (!a.files||a.files.length===0));

      const cellValues = {
        control:       t(row.control),
        domain:        t(row.domain),
        clause:        t(row.clause),
        title:         t(row.title),
        applicability: t(row.applicability),
        justification: t(row.justification) || "—",
      };

      // Calculate row height
      let rowH = 22;
      cols.forEach(col => {
        const h = doc.heightOfString(cellValues[col.key], { width: col.w - CELL_PAD * 2 - 1, fontSize: 8 }) + CELL_PAD * 2;
        if (h > rowH) rowH = h;
      });
      rowH = Math.max(rowH, 22);

      // Page break
      if (curY + rowH > PAGE_BOT) addTablePage();

      // Row background (alternating)
      const rowBg = idx % 2 === 0 ? C.white : C.light;
      fillRect(TABLE_X, curY, CW, rowH, rowBg);

      // Missing-evidence left accent
      if (isMissing) fillRect(TABLE_X, curY, 3, rowH, C.red);

      // Draw cells
      let cx = TABLE_X;
      cols.forEach(col => {
        cellBorder(cx, curY, col.w, rowH);

        let textColor = C.navy;
        let font = col.bold ? "Helvetica-Bold" : "Helvetica";

        if (col.key === "applicability") {
          // Draw colored dot + bold colored text
          const badgeColor = appColor(cellValues[col.key]);
          fillRect(cx + CELL_PAD, curY + CELL_PAD + 3, 4, 4, badgeColor);
          doc.font("Helvetica-Bold").fontSize(8).fillColor(badgeColor)
             .text(cellValues[col.key], cx + CELL_PAD + 8, curY + CELL_PAD, { width: col.w - CELL_PAD * 2 - 8, lineBreak: true });
        } else {
          if (col.key === "control") textColor = C.brand;
          doc.font(font).fontSize(8).fillColor(textColor)
             .text(cellValues[col.key], cx + CELL_PAD, curY + CELL_PAD, { width: col.w - CELL_PAD * 2, lineBreak: true });
        }

        cx += col.w;
      });

      // Evidence status column (draw after cells loop to avoid overlap)
      // We already drew all cols. Show missing/complete in justification cell bottom if needed
      curY += rowH;
    });

    // ══════════════════════════════════════════════════════
    // EVIDENCE APPENDIX — one section per control that has actionables
    // ══════════════════════════════════════════════════════
    const withActions = rows.filter(r => (r.actionables||[]).length > 0);

    if (withActions.length > 0) {
      doc.addPage({ margin: 0, size: "A4" });
      pageNum++;

      fillRect(0, 0, PAGE_W, 28, C.navy);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.white)
         .text("Evidence & Actionables  —  " + t(full.business_name), M, 10, { width: CW - 60 });
      doc.font("Helvetica").fontSize(7).fillColor("rgba(255,255,255,0.55)")
         .text(`Page ${pageNum}`, PAGE_W - M - 40, 10, { width: 40, align: "right" });

      // Section title
      curY = 44;
      doc.font("Helvetica-Bold").fontSize(13).fillColor(C.navy)
         .text("Evidence & Actionables", M, curY);
      doc.font("Helvetica").fontSize(9).fillColor(C.gray)
         .text("Required actions and uploaded evidence for each control", M, curY + 17);
      curY += 38;

      for (const row of withActions) {
        const rowMissing = (row.actionables||[]).some(a => a.upload_required && (!a.files||a.files.length===0));
        const statusColor = rowMissing ? C.red : C.green;

        // Estimate header + content height for page-break check
        if (curY + 50 > PAGE_BOT) {
          doc.addPage({ margin: 0, size: "A4" });
          pageNum++;
          fillRect(0, 0, PAGE_W, 28, C.navy);
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.white)
             .text("Evidence & Actionables  —  " + t(full.business_name), M, 10, { width: CW - 60 });
          doc.font("Helvetica").fontSize(7).fillColor("rgba(255,255,255,0.55)")
             .text(`Page ${pageNum}`, PAGE_W - M - 40, 10, { width: 40, align: "right" });
          curY = 44;
        }

        // Control header band
        const headerBg = rowMissing ? "#FFF5F5" : "#F0FFF8";
        fillRect(M, curY, CW, 24, headerBg);
        fillRect(M, curY, 4, 24, statusColor);

        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.navy)
           .text(`${t(row.control)}  —  ${t(row.title)}`, M + 10, curY + 7, { width: CW - 90, lineBreak: false });

        // Status badge on right
        const badgeLabel = rowMissing ? "Missing Evidence" : "Complete";
        const badgeW = 90;
        fillRect(M + CW - badgeW, curY + 5, badgeW, 14, rowMissing ? "#FFEEEE" : "#E6FAF2");
        doc.font("Helvetica-Bold").fontSize(7).fillColor(statusColor)
           .text(badgeLabel, M + CW - badgeW, curY + 8, { width: badgeW, align: "center" });

        curY += 30;

        for (const a of row.actionables) {
          const aMissing = a.upload_required && (!a.files||a.files.length===0);

          const aTextH = doc.heightOfString(t(a.text), { width: CW - 30, fontSize: 8.5 });
          const aBlockH = aTextH + (a.upload_required ? 16 : 0) + ((a.files||[]).length * 14) + 18;

          if (curY + aBlockH > PAGE_BOT) {
            doc.addPage({ margin: 0, size: "A4" });
            pageNum++;
            fillRect(0, 0, PAGE_W, 28, C.navy);
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.white)
               .text("Evidence & Actionables  —  " + t(full.business_name), M, 10, { width: CW - 60 });
            doc.font("Helvetica").fontSize(7).fillColor("rgba(255,255,255,0.55)")
               .text(`Page ${pageNum}`, PAGE_W - M - 40, 10, { width: 40, align: "right" });
            curY = 44;
          }

          // Actionable row
          fillRect(M, curY, 1, aTextH + 8, aMissing ? C.red : C.green);
          doc.font("Helvetica").fontSize(8.5).fillColor(C.navy)
             .text(t(a.text), M + 10, curY, { width: CW - 20, lineGap: 1 });
          curY += aTextH + 6;

          // Type + upload tags
          const typeLabel = a.type === "document" ? "Document" : "Evidence Note";
          doc.font("Helvetica-Bold").fontSize(7).fillColor(C.gray)
             .text(typeLabel.toUpperCase(), M + 10, curY);

          if (a.upload_required) {
            const uploadLabel = aMissing ? "UPLOAD REQUIRED — MISSING" : "UPLOAD REQUIRED — RECEIVED";
            doc.font("Helvetica-Bold").fontSize(7).fillColor(aMissing ? C.red : C.green)
               .text(uploadLabel, M + 10 + 80, curY);
          }
          curY += 13;

          // File list
          for (const f of (a.files||[])) {
            doc.font("Helvetica").fontSize(7.5).fillColor(C.brand)
               .text("  " + t(f.original_name), M + 14, curY);
            curY += 13;
          }

          curY += 4;
        }

        // Bottom separator
        fillRect(M, curY, CW, 1, C.border);
        curY += 14;
      }
    }

    // ── Page numbers on all buffered pages ──
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font("Helvetica").fontSize(7).fillColor(C.gray)
         .text(
           `${t(full.business_name)}  |  ISO 27001:2022 SoA  |  Page ${i + 1} of ${range.count}`,
           M, PAGE_H - 20, { width: CW, align: "center" }
         );
    }

    doc.end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to export PDF", details: e?.message || String(e) });
  }
});
// -----------------------------
// Export XLSX
// GET /api/soa-records/:id/export/xlsx
// -----------------------------
router.get("/:id/export/xlsx", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "Invalid id" });
      }
  
      const full = await buildFullSoARecord(id);
      if (!full) return res.status(404).json({ error: "SoA record not found" });
  
      const filename = `${safeFileName(full.business_name)}_soa.xlsx`;
  
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("SoA");
  
      const columns = [
        { header: "Business Name", key: "business_name", width: 24 },
        { header: "Standard", key: "standard", width: 20 },
        { header: "Domain", key: "domain", width: 18 },
        { header: "Clause", key: "clause", width: 14 },
        { header: "Control", key: "control", width: 14 },
        { header: "Title", key: "title", width: 34 },
        { header: "Applicability", key: "applicability", width: 18 },
        { header: "Justification", key: "justification", width: 40 },
        { header: "Clarification Question", key: "clarification_question", width: 32 },
        { header: "Actionables / Evidence", key: "actionable_text", width: 60 },
        { header: "Evidence Status", key: "evidence_status", width: 18 },
      ];
  
      sheet.columns = columns;
  
      const flatRows = flattenSoAForExport(full);
      flatRows.forEach((r) => sheet.addRow(r));
  
      // Header styling
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      
      const evidenceStatusColumnIndex =
        columns.findIndex((c) => c.key === "evidence_status") + 1;
      
      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.alignment = {
            wrapText: true,
            vertical: "top",
          };
        });
      
        if (rowNumber === 1) return;
      
        const evidenceCell = row.getCell(evidenceStatusColumnIndex);
      
        if (evidenceCell.value === "Missing Evidence") {
          evidenceCell.font = { color: { argb: "FFB00020" }, bold: true };
        } else if (evidenceCell.value === "Complete") {
          evidenceCell.font = { color: { argb: "FF008A2E" }, bold: true };
        }
      });
  
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  
      await workbook.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        error: "Failed to export XLSX",
        details: e?.message || String(e),
      });
    }
  });
export default router;
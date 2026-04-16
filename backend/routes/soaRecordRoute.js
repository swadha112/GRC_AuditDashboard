import express from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { q } from "../db.js";

const router = express.Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "soa-evidence");

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
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
        const out = await q(
          `INSERT INTO soa_actionable_files
            (soa_actionable_id, original_name, stored_name, mime_type, size_bytes)
           VALUES
            ($1,$2,$3,$4,$5)
           RETURNING *`,
          [
            actionableId,
            f.originalname,
            f.filename,
            f.mimetype || "application/octet-stream",
            f.size || 0,
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
// Export PDF
// GET /api/soa-records/:id/export/pdf
// -----------------------------
router.get("/:id/export/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const full = await buildFullSoARecord(id);
    if (!full) return res.status(404).json({ error: "SoA record not found" });

    const filename = `${safeFileName(full.business_name)}_soa.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      bufferPages: true,
    });

    doc.pipe(res);

    doc.fontSize(18).text("Statement of Applicability", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("black").text(`Business Name: ${full.business_name}`);
    doc.fontSize(10).text(`Created: ${new Date(full.created_at).toLocaleString()}`);
    doc.fontSize(10).text(`Updated: ${new Date(full.updated_at).toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(12).text("Business Function", { underline: true });
    doc.fontSize(10).text(full.business_text || "");
    doc.moveDown();

    for (const row of full.rows || []) {
      const rowMissingEvidence = (row.actionables || []).some(
        (a) => a.upload_required && (!a.files || a.files.length === 0)
      );

      doc
        .fontSize(11)
        .fillColor("black")
        .text(`${row.control} — ${row.title}`, { underline: true });

      doc.fontSize(10).fillColor("black").text(`Standard: ${row.standard}`);
      doc.fontSize(10).text(`Domain: ${row.domain}`);
      doc.fontSize(10).text(`Clause: ${row.clause}`);
      doc.fontSize(10).text(`Applicability: ${row.applicability}`);
      doc.fontSize(10).text(`Justification: ${row.justification || "-"}`);

      doc
        .fontSize(10)
        .fillColor(rowMissingEvidence ? "red" : "green")
        .text(`Evidence Status: ${rowMissingEvidence ? "Missing Evidence" : "Complete"}`);
      doc.fillColor("black");

      if (row.clarification_question) {
        doc.fontSize(10).text(`Clarification Question: ${row.clarification_question}`);
      }

      doc.moveDown(0.3);
      doc.fontSize(10).text("Actionables / Evidence:", { underline: true });

      if (!row.actionables || row.actionables.length === 0) {
        doc.fontSize(10).text("- None");
      } else {
        for (const a of row.actionables) {
          const missingThisActionable =
            a.upload_required && (!a.files || a.files.length === 0);

          doc.fontSize(10).fillColor("black").text(`- ${a.text}`);
          doc.fontSize(9).text(`  Type: ${a.type === "document" ? "Document" : "Evidence / activity note"}`);
          doc.fontSize(9).text(`  Upload Required: ${a.upload_required ? "Yes" : "No"}`);
          doc
            .fontSize(9)
            .fillColor(missingThisActionable ? "red" : "green")
            .text(`  Evidence Status: ${missingThisActionable ? "Missing Evidence" : "Complete"}`);
          doc.fillColor("black");

          const files = a.files || [];
          if (files.length) {
            doc.fontSize(9).text(`  Files: ${files.map((f) => f.original_name).join(", ")}`);
          }
        }
      }

      doc.moveDown();

      if (doc.y > 700) {
        doc.addPage();
      }
    }

    doc.end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to export PDF",
      details: e?.message || String(e),
    });
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
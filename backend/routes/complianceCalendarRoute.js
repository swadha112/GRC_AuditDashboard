import express from "express";
import { q } from "../db.js";

const router = express.Router();

function normalizeStatus(status, nextDueDate) {
  if (status === "completed") return "completed";
  if (!nextDueDate) return status || "upcoming";

  const today = new Date();
  const due = new Date(nextDueDate);

  if (Number.isNaN(due.getTime())) return status || "upcoming";
  if (due < new Date(today.toDateString()) && status !== "completed") return "overdue";

  return status || "upcoming";
}

function addFrequency(dateStr, frequency) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;

  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (frequency === "half_yearly") d.setMonth(d.getMonth() + 6);
  else if (frequency === "annually") d.setFullYear(d.getFullYear() + 1);
  else return null;

  return d.toISOString().slice(0, 10);
}

async function buildCalendarItem(itemId) {
  const itemRes = await q(
    `SELECT c.*, s.business_name
     FROM compliance_calendar_items c
     LEFT JOIN soa_records s ON s.id = c.soa_record_id
     WHERE c.id = $1
     LIMIT 1`,
    [itemId]
  );

  const item = itemRes.rows[0];
  if (!item) return null;

  const runsRes = await q(
    `SELECT *
     FROM compliance_calendar_runs
     WHERE calendar_item_id = $1
     ORDER BY due_date DESC, id DESC`,
    [itemId]
  );

  return {
    ...item,
    runs: runsRes.rows,
  };
}

// --------------------------------------------------
// GET all calendar items
// query params:
// scope_type, soa_record_id, status, owner_name, month, year
// --------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { scope_type, soa_record_id, status, owner_name, month, year } = req.query;

    const where = [];
    const params = [];

    if (scope_type) {
      params.push(scope_type);
      where.push(`c.scope_type = $${params.length}`);
    }

    if (soa_record_id) {
      params.push(Number(soa_record_id));
      where.push(`c.soa_record_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }

    if (owner_name) {
      params.push(`%${owner_name}%`);
      where.push(`c.owner_name ILIKE $${params.length}`);
    }

    if (month && year) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(Number(year), Number(month), 0);
      const end = endDate.toISOString().slice(0, 10);

      params.push(start);
      where.push(`c.next_due_date >= $${params.length}`);
      params.push(end);
      where.push(`c.next_due_date <= $${params.length}`);
    }

    const query = `
      SELECT c.*, s.business_name
      FROM compliance_calendar_items c
      LEFT JOIN soa_records s ON s.id = c.soa_record_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.next_due_date ASC, c.id DESC
    `;

    const out = await q(query, params);

    const items = out.rows.map((row) => ({
      ...row,
      status: normalizeStatus(row.status, row.next_due_date),
    }));

    return res.json({ items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to load compliance calendar items",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// GET one calendar item with run history
// --------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ error: "Invalid calendar item id" });
    }

    const full = await buildCalendarItem(itemId);
    if (!full) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    full.status = normalizeStatus(full.status, full.next_due_date);
    return res.json(full);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to load calendar item",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// POST create calendar item
// --------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      scope_type,
      soa_record_id,
      standard,
      clause,
      control,
      frequency,
      owner_name,
      owner_email,
      start_date,
      next_due_date,
      status = "upcoming",
      evidence_required = false,
      remarks,
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    if (!scope_type || !["enterprise", "business"].includes(scope_type)) {
      return res.status(400).json({ error: "scope_type must be enterprise or business" });
    }
    if (scope_type === "business" && !Number.isFinite(Number(soa_record_id))) {
      return res.status(400).json({ error: "soa_record_id is required for business scope" });
    }
    if (!frequency) {
      return res.status(400).json({ error: "frequency is required" });
    }
    if (!owner_name || !String(owner_name).trim()) {
      return res.status(400).json({ error: "owner_name is required" });
    }
    if (!start_date) {
      return res.status(400).json({ error: "start_date is required" });
    }
    if (!next_due_date) {
      return res.status(400).json({ error: "next_due_date is required" });
    }

    const out = await q(
      `INSERT INTO compliance_calendar_items
        (title, description, scope_type, soa_record_id, standard, clause, control,
         frequency, owner_name, owner_email, start_date, next_due_date, status,
         evidence_required, remarks)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        String(title).trim(),
        description || null,
        scope_type,
        scope_type === "business" ? Number(soa_record_id) : null,
        standard || null,
        clause || null,
        control || null,
        frequency,
        String(owner_name).trim(),
        owner_email || null,
        start_date,
        next_due_date,
        normalizeStatus(status, next_due_date),
        Boolean(evidence_required),
        remarks || null,
      ]
    );

    const full = await buildCalendarItem(out.rows[0].id);
    return res.status(201).json(full);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to create calendar item",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// PATCH update calendar item
// --------------------------------------------------
router.patch("/:id", async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ error: "Invalid calendar item id" });
    }

    const existing = await q(
      `SELECT * FROM compliance_calendar_items WHERE id = $1 LIMIT 1`,
      [itemId]
    );

    const current = existing.rows[0];
    if (!current) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    const next = {
      ...current,
      ...req.body,
    };

    if (next.scope_type === "business" && !Number.isFinite(Number(next.soa_record_id))) {
      return res.status(400).json({ error: "soa_record_id is required for business scope" });
    }

    const updated = await q(
      `UPDATE compliance_calendar_items
       SET title = $1,
           description = $2,
           scope_type = $3,
           soa_record_id = $4,
           standard = $5,
           clause = $6,
           control = $7,
           frequency = $8,
           owner_name = $9,
           owner_email = $10,
           start_date = $11,
           next_due_date = $12,
           status = $13,
           evidence_required = $14,
           remarks = $15,
           updated_at = NOW()
       WHERE id = $16
       RETURNING *`,
      [
        next.title,
        next.description || null,
        next.scope_type,
        next.scope_type === "business" ? Number(next.soa_record_id) : null,
        next.standard || null,
        next.clause || null,
        next.control || null,
        next.frequency,
        next.owner_name,
        next.owner_email || null,
        next.start_date,
        next.next_due_date,
        normalizeStatus(next.status, next.next_due_date),
        Boolean(next.evidence_required),
        next.remarks || null,
        itemId,
      ]
    );

    const full = await buildCalendarItem(updated.rows[0].id);
    return res.json(full);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to update calendar item",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// DELETE calendar item
// --------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ error: "Invalid calendar item id" });
    }

    const out = await q(
      `DELETE FROM compliance_calendar_items WHERE id = $1 RETURNING id`,
      [itemId]
    );

    if (!out.rows[0]) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    return res.json({ success: true, deleted_id: itemId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to delete calendar item",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// POST mark one calendar item complete
// creates run history entry and advances next_due_date
// --------------------------------------------------
router.post("/:id/complete", async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ error: "Invalid calendar item id" });
    }

    const { period_label, completed_on, evidence_note, remarks } = req.body || {};

    const itemRes = await q(
      `SELECT * FROM compliance_calendar_items WHERE id = $1 LIMIT 1`,
      [itemId]
    );
    const item = itemRes.rows[0];

    if (!item) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    const doneDate = completed_on || new Date().toISOString().slice(0, 10);

    await q(
      `INSERT INTO compliance_calendar_runs
        (calendar_item_id, period_label, due_date, completed_on, status, evidence_note, remarks)
       VALUES
        ($1,$2,$3,$4,'completed',$5,$6)`,
      [
        itemId,
        period_label || item.frequency,
        item.next_due_date,
        doneDate,
        evidence_note || null,
        remarks || null,
      ]
    );

    const nextDue = addFrequency(item.next_due_date, item.frequency);

    await q(
      `UPDATE compliance_calendar_items
       SET status = $1,
           next_due_date = COALESCE($2, next_due_date),
           updated_at = NOW()
       WHERE id = $3`,
      [
        nextDue ? "upcoming" : "completed",
        nextDue,
        itemId,
      ]
    );

    const full = await buildCalendarItem(itemId);
    return res.json(full);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to complete calendar item",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// POST add manual run entry
// --------------------------------------------------
router.post("/:id/runs", async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ error: "Invalid calendar item id" });
    }

    const { period_label, due_date, completed_on, status = "upcoming", evidence_note, remarks } = req.body || {};

    if (!period_label || !String(period_label).trim()) {
      return res.status(400).json({ error: "period_label is required" });
    }
    if (!due_date) {
      return res.status(400).json({ error: "due_date is required" });
    }

    const itemRes = await q(
      `SELECT id FROM compliance_calendar_items WHERE id = $1 LIMIT 1`,
      [itemId]
    );
    if (!itemRes.rows[0]) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    const out = await q(
      `INSERT INTO compliance_calendar_runs
        (calendar_item_id, period_label, due_date, completed_on, status, evidence_note, remarks)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        itemId,
        String(period_label).trim(),
        due_date,
        completed_on || null,
        status,
        evidence_note || null,
        remarks || null,
      ]
    );

    return res.status(201).json(out.rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to create calendar run",
      details: e?.message || String(e),
    });
  }
});

// --------------------------------------------------
// GET dashboard summary
// --------------------------------------------------
router.get("/dashboard/summary", async (req, res) => {
  try {
    const itemsRes = await q(`SELECT * FROM compliance_calendar_items`);
    const items = itemsRes.rows.map((x) => ({
      ...x,
      status: normalizeStatus(x.status, x.next_due_date),
    }));

    const summary = {
      total: items.length,
      upcoming: items.filter((x) => x.status === "upcoming").length,
      in_progress: items.filter((x) => x.status === "in_progress").length,
      completed: items.filter((x) => x.status === "completed").length,
      overdue: items.filter((x) => x.status === "overdue").length,
      enterprise: items.filter((x) => x.scope_type === "enterprise").length,
      business: items.filter((x) => x.scope_type === "business").length,
    };

    return res.json({ summary, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to load compliance dashboard summary",
      details: e?.message || String(e),
    });
  }
});

export default router;
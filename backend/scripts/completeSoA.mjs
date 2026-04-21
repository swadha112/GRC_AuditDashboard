/**
 * Dev-only script: generate + insert the 37 missing SOA controls for Health Department (id=4).
 * Run inside backend container: node /app/scripts/completeSoA.mjs
 */
import OpenAI from "openai";
import pg from "pg";
import { ISO27001_CONTROLS } from "../constants/iso27001Controls.js";

const SOA_RECORD_ID = 4;
const CHUNK_SIZE = Number(process.env.SOA_CHUNK_SIZE || 12);
const CONCURRENCY = Number(process.env.SOA_CONCURRENCY || 4);

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const pool = new pg.Pool({
  host: process.env.PGHOST || "db",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "auditDashboard",
});

async function q(text, params) {
  return pool.query(text, params);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const APPLICABILITY = ["Yes", "No", "Conditional", "Clarification Needed"];

function normalizeActionables(actionables) {
  return Array.isArray(actionables)
    ? actionables
        .map((a) => {
          if (typeof a === "string") return { text: a.trim(), type: "evidence_note", upload_required: false };
          return {
            text: String(a?.text || "").trim(),
            type: a?.type === "document" ? "document" : "evidence_note",
            upload_required: Boolean(a?.upload_required),
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
    applicability: APPLICABILITY.includes(found.applicability) ? found.applicability : "Clarification Needed",
    justification: String(found.justification || "").trim(),
    clarification_question: String(found.clarification_question || "").trim(),
    actionables: normalizeActionables(found.actionables),
  };
}

async function generateBatch(businessText, controlsBatch) {
  const prompt = `
Generate ISO 27001:2022 SoA rows for the given controls.
Use only the Business Function text. Do not invent facts.
Rules:
- applicability must be one of: Yes, No, Conditional, Clarification Needed
- keep results balanced; do not mark almost everything Yes
- if Clarification Needed, add a short clarification_question, else keep it empty
- keep justification to 1 short sentence
- return exactly one row per control
- keep provided standard/domain/clause/control/title unchanged
- give at most 1 short actionable per control
- actionable format: { text, type, upload_required }
- use "document"/true only for a real uploadable artifact; otherwise "evidence_note"/false

Return only valid JSON:
{ "rows": [ { "standard": "", "domain": "", "clause": "", "control": "", "title": "", "applicability": "", "justification": "", "clarification_question": "", "actionables": [] } ] }

Business Function:
${businessText}

Controls:
${JSON.stringify(controlsBatch)}
`;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      const raw = completion?.choices?.[0]?.message?.content || "{}";
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      return controlsBatch.map((ctrl) => {
        const found = rows.find((r) => String(r.control) === ctrl.control) || {};
        return normalizeRow(ctrl, found);
      });
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if ((status === 429 || status >= 500) && attempt < 2) {
        const wait = 5000 * Math.pow(2, attempt);
        console.log(`  Retry ${attempt + 1} after ${wait}ms (status ${status})`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

async function insertRow(soaRecordId, row) {
  const rowRes = await q(
    `INSERT INTO soa_rows
      (soa_record_id, standard, domain, clause, control, title, applicability, justification, clarification_question)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [soaRecordId, row.standard, row.domain, row.clause, row.control, row.title,
     row.applicability, row.justification, row.clarification_question]
  );
  const rowId = rowRes.rows[0].id;
  for (const a of row.actionables) {
    await q(
      `INSERT INTO soa_actionables (soa_row_id, text, type, upload_required) VALUES ($1,$2,$3,$4)`,
      [rowId, a.text, a.type, a.upload_required]
    );
  }
}

async function main() {
  const recRes = await q(`SELECT business_text FROM soa_records WHERE id = $1`, [SOA_RECORD_ID]);
  const businessText = recRes.rows[0]?.business_text;
  if (!businessText) throw new Error(`SOA record ${SOA_RECORD_ID} not found`);

  const savedRes = await q(`SELECT control FROM soa_rows WHERE soa_record_id = $1`, [SOA_RECORD_ID]);
  const saved = new Set(savedRes.rows.map((r) => r.control));

  const missing = ISO27001_CONTROLS.filter((c) => !saved.has(c.control));
  console.log(`Found ${missing.length} missing controls:`, missing.map((c) => c.control).join(", "));

  if (!missing.length) {
    console.log("Nothing to do.");
    await pool.end();
    return;
  }

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    chunks.push(missing.slice(i, i + CHUNK_SIZE));
  }
  console.log(`Processing ${chunks.length} chunks (size ${CHUNK_SIZE}, concurrency ${CONCURRENCY})…`);

  let chunkIdx = 0;
  while (chunkIdx < chunks.length) {
    const batch = chunks.slice(chunkIdx, chunkIdx + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (chunk, i) => {
        const idx = chunkIdx + i;
        console.log(`  Chunk ${idx + 1}/${chunks.length}: generating ${chunk.length} controls…`);
        const rows = await generateBatch(businessText, chunk);
        for (const row of rows) {
          await insertRow(SOA_RECORD_ID, row);
          console.log(`    Inserted ${row.control} (${row.applicability})`);
        }
        return rows.length;
      })
    );
    for (const r of results) {
      if (r.status === "rejected") console.error("  Chunk failed:", r.reason?.message || r.reason);
    }
    chunkIdx += CONCURRENCY;
    if (chunkIdx < chunks.length) await sleep(1000);
  }

  await q(`UPDATE soa_records SET updated_at = NOW() WHERE id = $1`, [SOA_RECORD_ID]);
  const countRes = await q(`SELECT COUNT(*) FROM soa_rows WHERE soa_record_id = $1`, [SOA_RECORD_ID]);
  console.log(`Done. Health Department now has ${countRes.rows[0].count} controls.`);
  await pool.end();
}

main().catch((e) => { console.error("Script failed:", e); process.exit(1); });

// backend/routes/auditGapRoute.js
import express from "express";
import OpenAI from "openai";
import crypto from "crypto";
import { q } from "../db.js";
import { embedText } from "../utils/embeddings.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});
const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

// ===== Embeddings =====
const EMB_MODEL_NAME = "all-MiniLM-L6-v2"; // 384 dims
const SIM_THRESHOLD = Number(process.env.DEDUPE_SIM_THRESHOLD || 0.88);
const TOP_K = Number(process.env.DEDUPE_TOPK || 3);


function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function makeFingerprint({ standard, control, source_observation }) {
  const std = String(standard || "ISO27001:2022").trim();
  const ctrl = String(control || "Unknown").trim() || "Unknown";
  const body = normalizeText(source_observation);
  return `${std}|${ctrl}|${sha256(body)}`;
}

function toPgVector(arr) {
  // pgvector accepts '[1,2,3]'
  return `[${arr.join(",")}]`;
}

/* async function embedText(text) {
  const emb = await getEmbedder();
  const input = normalizeText(text);
  const out = await emb.embed([input]);
  return out[0]; // number[]
} */

async function findExactByFingerprint(fingerprint) {
  const r = await q(
    `SELECT * FROM ia_findings WHERE fingerprint = $1 LIMIT 1`,
    [fingerprint]
  );
  return r.rows[0] || null;
}

async function findSimilarByEmbedding(embeddingVec, standard) {
  // cosine distance operator in pgvector: <=> (smaller is closer)
  // similarity ≈ 1 - distance
  const vec = toPgVector(embeddingVec);
  const r = await q(
    `
    SELECT
      *,
      (1 - (embedding <=> $1::vector)) AS similarity
    FROM ia_findings
    WHERE standard = $2 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    [vec, standard, TOP_K]
  );
  return r.rows || [];
}

async function insertFinding(row) {
  const r = await q(
    `
    INSERT INTO ia_findings
      (standard, domain, control, clause, type, basis, source_observation, recommendation, confidence,
       fingerprint, embedding, embedding_model)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::vector,$12)
    RETURNING *
    `,
    [
      row.standard,
      row.domain,
      row.control,
      row.clause,
      row.type,
      row.basis,
      row.source_observation,
      JSON.stringify(row.recommendation || []),
      row.confidence ?? 0.5,
      row.fingerprint,
      toPgVector(row.embedding),
      row.embedding_model,
    ]
  );
  return r.rows[0];
}

async function updateFinding(id, patch) {
  const fields = [];
  const vals = [];
  let i = 1;

  const allowed = [
    "domain",
    "control",
    "clause",
    "type",
    "basis",
    "source_observation",
    "recommendation",
    "confidence",
    "embedding",
  ];

  for (const k of allowed) {
    if (patch[k] !== undefined) {
      if (k === "recommendation") {
        fields.push(`${k} = $${i}::jsonb`);
        vals.push(JSON.stringify(patch[k] || []));
      } else if (k === "embedding") {
        fields.push(`${k} = $${i}::vector`);
        vals.push(toPgVector(patch[k]));
      } else {
        fields.push(`${k} = $${i}`);
        vals.push(patch[k]);
      }
      i++;
    }
  }

  fields.push(`updated_at = NOW()`);

  const sql = `
    UPDATE ia_findings
    SET ${fields.join(", ")}
    WHERE id = $${i}
    RETURNING *
  `;
  vals.push(id);

  const r = await q(sql, vals);
  return r.rows[0] || null;
}

// ====== LIST / CRUD endpoints ======
router.get("/findings", async (req, res) => {
  try {
    const r = await q(
      `SELECT * FROM ia_findings ORDER BY created_at DESC LIMIT 500`,
      []
    );
    res.json({ rows: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load findings", details: e.message });
  }
});

router.patch("/findings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const patch = req.body || {};
    
    if (patch.source_observation) {
      patch.embedding = await embedText(patch.source_observation);
    }

    const updated = await updateFinding(id, patch);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update finding", details: e.message });
  }
});

router.delete("/findings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await q(`DELETE FROM ia_findings WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete finding", details: e.message });
  }
});

// ====== MERGE / RESOLVE endpoint ======
/**
 * POST /api/audit/resolve
 * body: { resolutions: [ { incoming, action, targetId? } ] }
 * action: "merge" | "keep_both" | "keep_existing" | "replace_existing"
 */
router.post("/resolve", async (req, res) => {
  try {
    const { resolutions } = req.body || {};
    if (!Array.isArray(resolutions)) {
      return res.status(400).json({ error: "resolutions[] required" });
    }

    const results = [];

    for (const r0 of resolutions) {
      const action = r0.action;
      const incoming = r0.incoming;

      if (!incoming) continue;

      // if targetId provided, we act on that record
      const targetId = r0.targetId ? Number(r0.targetId) : null;

      if (action === "keep_existing") {
        results.push({ action, ok: true });
        continue;
      }

      if (action === "keep_both") {
        // ensure fingerprint unique (if exact duplicate, salt it)
        const salted = {
          ...incoming,
          fingerprint: incoming.fingerprint + "|salt:" + crypto.randomBytes(4).toString("hex"),
        };
        const inserted = await insertFinding(salted);
        results.push({ action, inserted });
        continue;
      }

      if (!targetId || !Number.isFinite(targetId)) {
        results.push({ action, ok: false, error: "targetId required for merge/replace" });
        continue;
      }

      if (action === "replace_existing") {
        const updated = await updateFinding(targetId, {
          domain: incoming.domain,
          control: incoming.control,
          clause: incoming.clause,
          type: incoming.type,
          basis: incoming.basis,
          source_observation: incoming.source_observation,
          recommendation: incoming.recommendation,
          confidence: incoming.confidence,
          embedding: incoming.embedding,
        });
        results.push({ action, updated });
        continue;
      }

      if (action === "merge") {
        // merge recommendations (dedupe)
        const existing = (await q(`SELECT * FROM ia_findings WHERE id=$1`, [targetId])).rows[0];
        if (!existing) {
          results.push({ action, ok: false, error: "target not found" });
          continue;
        }

        const recA = Array.isArray(existing.recommendation) ? existing.recommendation : [];
        const recB = Array.isArray(incoming.recommendation) ? incoming.recommendation : [];
        const mergedRec = [...new Set([...recA, ...recB].map((x) => String(x).trim()).filter(Boolean))];

        const merged = await updateFinding(targetId, {
          // keep existing domain/control/clause unless incoming has better values
          domain: existing.domain === "Unknown" ? incoming.domain : existing.domain,
          control: existing.control === "Unknown" ? incoming.control : existing.control,
          clause: existing.clause || incoming.clause || "",
          type: existing.type, // keep existing type by default
          basis: existing.basis || incoming.basis || "",
          recommendation: mergedRec,
          confidence: Math.max(existing.confidence ?? 0.5, incoming.confidence ?? 0.5),
        });

        results.push({ action, merged });
        continue;
      }

      results.push({ action, ok: false, error: "Unknown action" });
    }

    res.json({ results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Resolve failed", details: e.message });
  }
});

// ===== YOUR EXISTING LLM ENDPOINT (kept prompt unchanged) =====
router.post("/assess", async (req, res) => {
  try {
    const { standard, observationsText } = req.body || {};

    if (!observationsText || !String(observationsText).trim()) {
      return res.status(400).json({ error: "observationsText is required" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in backend .env" });
    }

    const std = standard || "ISO27001:2022";

    // ===== DO NOT CHANGE THIS PROMPT =====
    const prompt = `
You are an internal ISMS auditor.
Task: From the auditor's input text, FIRST split it into distinct audit observations (multiple rows if needed),
THEN for each observation produce a structured gap assessment row.

IMPORTANT RULES:
- Use ONLY what is in the input. Do NOT invent facts.
- If a control is uncertain, set control="Unknown" and explain in basis.
- Domain must be one of: Organizational | People | Physical | Technological | Unknown
- Type must be one of: Major | Minor | Observation
- Recommendation must be written in simple, easy-to-read language (professional, not overly technical).
  It's okay to include light technical terms (e.g., MFA, access review), but explain clearly.

NC MATRIX (POC):
- Major: control missing, not implemented, or serious gap with likely high risk / broad scope.
- Minor: partially implemented, inconsistent, evidence missing, limited scope.
- Observation: improvement suggestion, low risk, clarity/documentation enhancement.

OUTPUT FORMAT:
Return ONLY valid JSON with this schema:

{
  "items": [
    {
      "source_observation": "<the split observation text>",
      "domain": "Organizational|People|Physical|Technological|Unknown",
      "control": "<e.g., A.5.15 or Unknown>",
      "clause": "<optional; if unknown use ''>",
      "type": "Major|Minor|Observation",
      "basis": "<1-2 lines why it's a gap>",
      "recommendation": [
        "<step 1>",
        "<step 2>",
        "<step 3 (optional)>"
      ],
      "confidence": 0.0
    }
  ]
}

Standard context: ${std}

Auditor input (may contain multiple observations in one block):
${observationsText}
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

    const items = Array.isArray(parsed.items) ? parsed.items : [];

    const normalized = items.map((it) => ({
      standard: std,
      source_observation: String(it.source_observation || "").trim(),
      domain: String(it.domain || "Unknown"),
      control: String(it.control || "Unknown"),
      clause: String(it.clause || ""),
      type: String(it.type || "Observation"),
      basis: String(it.basis || "").trim(),
      recommendation: Array.isArray(it.recommendation)
        ? it.recommendation.map((x) => String(x).trim()).filter(Boolean)
        : [],
      confidence:
        typeof it.confidence === "number"
          ? Math.max(0, Math.min(1, it.confidence))
          : 0.5,
    }));

    // ===== NEW: DB insert + conflicts =====
    const created = [];
    const conflicts = [];

    for (const row of normalized) {
      row.fingerprint = makeFingerprint(row);
      row.embedding_model = `fastembed:${EMB_MODEL_NAME}`;
      row.embedding = await embedText(`${row.source_observation}\n${row.basis}`);

      // 1) exact duplicate
      const exact = await findExactByFingerprint(row.fingerprint);
      if (exact) {
        conflicts.push({
          incoming: row,
          candidates: [{ existing: exact, similarity: 1.0, reason: "Exact match (fingerprint)" }],
        });
        continue;
      }

      // 2) semantic duplicate candidates
      const near = await findSimilarByEmbedding(row.embedding, row.standard);
      const candidates = (near || [])
        .map((x) => ({
          existing: x,
          similarity: Number(x.similarity ?? 0),
          reason: "Semantic similarity (embedding)",
        }))
        .filter((x) => x.similarity >= SIM_THRESHOLD);

      if (candidates.length > 0) {
        conflicts.push({ incoming: row, candidates });
        continue;
      }

      // 3) insert
      const inserted = await insertFinding(row);
      created.push(inserted);
    }

    return res.json({ created, conflicts });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Assessment failed",
      details: e?.message || String(e),
    });
  }
});

export default router;
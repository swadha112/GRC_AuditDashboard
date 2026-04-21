import express from "express";
import OpenAI from "openai";
import { q } from "../db.js";
import { embedText } from "../utils/embeddings.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const STRONG_DUP_THRESHOLD = Number(process.env.IA_DUP_THRESHOLD_STRONG || 0.88);
const POSSIBLE_DUP_THRESHOLD = Number(process.env.IA_DUP_THRESHOLD_POSSIBLE || 0.82);
const TOP_K = Number(process.env.IA_DUP_TOPK || 5);

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toPgVector(arr) {
  return `[${arr.join(",")}]`;
}

function rowFromDb(r) {
  return {
    id: String(r.id),
    standard: r.standard,
    domain: r.domain,
    control: r.control,
    clause: r.clause,
    type: r.type,
    basis: r.basis,
    source_observation: r.source_observation,
    recommendation: Array.isArray(r.recommendation) ? r.recommendation : [],
    confidence: Number(r.confidence ?? 0.5),
    embedding_model: r.embedding_model,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function getAllFindings() {
  const res = await q(
    `SELECT * FROM ia_findings ORDER BY created_at DESC LIMIT 500`,
    []
  );
  return res.rows.map(rowFromDb);
}

async function getFindingById(id) {
  const res = await q(`SELECT * FROM ia_findings WHERE id = $1 LIMIT 1`, [id]);
  return res.rows[0] ? rowFromDb(res.rows[0]) : null;
}

async function insertFinding(row) {
  const res = await q(
    `
    INSERT INTO ia_findings
      (standard, domain, control, clause, type, basis, source_observation, recommendation, confidence, embedding, embedding_model)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::vector,$11)
    RETURNING *
    `,
    [
      row.standard,
      row.domain,
      row.control,
      row.clause || "",
      row.type,
      row.basis || "",
      row.source_observation || "",
      JSON.stringify(row.recommendation || []),
      row.confidence ?? 0.5,
      toPgVector(row.embedding),
      row.embedding_model,
    ]
  );
  return rowFromDb(res.rows[0]);
}

async function updateFindingById(id, patch) {
  const current = await getFindingById(id);
  if (!current) return null;

  const merged = {
    ...current,
    ...patch,
  };

  // Re-embed if key semantic fields change
  if (
    patch.source_observation !== undefined ||
    patch.basis !== undefined ||
    patch.control !== undefined ||
    patch.clause !== undefined
  ) {
    const semanticText = buildSemanticText(merged);
    merged.embedding = await embedText(semanticText);
  } else {
    const raw = await q(`SELECT embedding FROM ia_findings WHERE id = $1`, [id]);
    merged.embedding = raw.rows[0]?.embedding || null;
  }

  const res = await q(
    `
    UPDATE ia_findings
    SET
      standard = $1,
      domain = $2,
      control = $3,
      clause = $4,
      type = $5,
      basis = $6,
      source_observation = $7,
      recommendation = $8::jsonb,
      confidence = $9,
      embedding = $10::vector,
      updated_at = NOW()
    WHERE id = $11
    RETURNING *
    `,
    [
      merged.standard,
      merged.domain,
      merged.control,
      merged.clause || "",
      merged.type,
      merged.basis || "",
      merged.source_observation || "",
      JSON.stringify(merged.recommendation || []),
      merged.confidence ?? 0.5,
      merged.embedding ? toPgVector(merged.embedding) : null,
      id,
    ]
  );

  return res.rows[0] ? rowFromDb(res.rows[0]) : null;
}

async function deleteFindingById(id) {
  await q(`DELETE FROM ia_findings WHERE id = $1`, [id]);
}

function buildSemanticText(row) {
  // Embed only the human observation text so that paraphrases with different
  // AI-assigned controls/clauses still score as similar.
  return normalizeText(row.source_observation) || normalizeText(row.basis) || "";
}

async function findSimilarCandidates({ standard, embedding }) {
  const vec = toPgVector(embedding);

  // Search all findings in the same standard — don't restrict by control
  // because the AI may map the same observation to different control IDs.
  const res = await q(
    `
    SELECT *,
           (1 - (embedding <=> $1::vector)) AS similarity
    FROM ia_findings
    WHERE standard = $2
      AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    [vec, standard, TOP_K]
  );

  return (res.rows || [])
    .map((r) => ({
      existing: rowFromDb(r),
      similarity: Number(r.similarity ?? 0),
      conflict_level: Number(r.similarity ?? 0) >= STRONG_DUP_THRESHOLD ? "strong" : "possible",
    }))
    .filter((x) => x.similarity >= POSSIBLE_DUP_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_K);
}

function mergeRows(existing, incoming) {
  const recs = [
    ...(existing.recommendation || []),
    ...(incoming.recommendation || []),
  ];

  const uniqRecs = [...new Set(recs.map((x) => String(x).trim()).filter(Boolean))];

  let mergedBasis = existing.basis || "";
  if (
    incoming.basis &&
    normalizeText(incoming.basis) !== normalizeText(existing.basis)
  ) {
    mergedBasis = `${existing.basis || ""}${
      existing.basis ? "\n\n" : ""
    }(Merged note)\n${incoming.basis}`;
  }

  return {
    ...existing,
    domain: existing.domain === "Unknown" ? incoming.domain : existing.domain,
    control: existing.control === "Unknown" ? incoming.control : existing.control,
    clause: existing.clause || incoming.clause || "",
    type: existing.type || incoming.type || "Observation",
    basis: mergedBasis,
    source_observation: existing.source_observation || incoming.source_observation || "",
    recommendation: uniqRecs,
    confidence: Math.max(existing.confidence || 0.5, incoming.confidence || 0.5),
  };
}

// ---------- GET findings ----------
router.get("/findings", async (req, res) => {
  try {
    const rows = await getAllFindings();
    return res.json({ rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to load findings",
      details: e?.message || String(e),
    });
  }
});

// ---------- PATCH finding ----------
router.patch("/findings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const patch = req.body || {};
    const updated = await updateFindingById(id, patch);
    if (!updated) return res.status(404).json({ error: "Finding not found" });

    return res.json(updated);
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to update finding",
      details: e?.message || String(e),
    });
  }
});

// ---------- DELETE finding ----------
router.delete("/findings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    await deleteFindingById(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to delete finding",
      details: e?.message || String(e),
    });
  }
});

// ---------- RESOLVE conflicts ----------
router.post("/resolve", async (req, res) => {
  try {
    const { resolutions } = req.body || {};
    if (!Array.isArray(resolutions)) {
      return res.status(400).json({ error: "resolutions[] is required" });
    }

    for (const r of resolutions) {
      const { incoming, action, targetId } = r || {};
      if (!incoming || !action) continue;

      if (action === "keep_existing") {
        continue;
      }

      if (action === "keep_both") {
        const semanticText = buildSemanticText(incoming);
        const embedding = incoming.embedding || (await embedText(semanticText));
        await insertFinding({
          ...incoming,
          embedding,
          embedding_model: "@huggingface/transformers:all-MiniLM-L6-v2",
        });
        continue;
      }

      if (!targetId) continue;
      const existing = await getFindingById(targetId);
      if (!existing) continue;

      if (action === "replace_existing") {
        const semanticText = buildSemanticText(incoming);
        const embedding = incoming.embedding || (await embedText(semanticText));

        await updateFindingById(targetId, {
          ...incoming,
          embedding,
        });
        continue;
      }

      if (action === "merge") {
        const merged = mergeRows(existing, incoming);
        const semanticText = buildSemanticText(merged);
        const embedding = await embedText(semanticText);

        await updateFindingById(targetId, {
          ...merged,
          embedding,
        });
      }
    }

    const rows = await getAllFindings();
    return res.json({ rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "Failed to resolve conflicts",
      details: e?.message || String(e),
    });
  }
});

/**
 * POST /api/audit/assess
 * Body: { standard, observationsText }
 * Returns: { created: [...], conflicts: [...] }
 */
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

    const created = [];
    const conflicts = [];

    for (const row of normalized) {
      const semanticText = buildSemanticText(row);
      const embedding = await embedText(semanticText);

      const candidates = await findSimilarCandidates({
        standard: row.standard,
        embedding,
      });

      if (candidates.length > 0) {
        conflicts.push({
          incoming: {
            ...row,
            embedding,
            embedding_model: "@huggingface/transformers:all-MiniLM-L6-v2",
          },
          candidates,
        });
        continue;
      }

      const inserted = await insertFinding({
        ...row,
        embedding,
        embedding_model: "@huggingface/transformers:all-MiniLM-L6-v2",
      });

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
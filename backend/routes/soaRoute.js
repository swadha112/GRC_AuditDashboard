// backend/routes/soaRoute.js
import express from "express";
import OpenAI from "openai";
import pLimit from "p-limit";
import crypto from "crypto";

import { buildDefaultFacts, FACT_KEYS } from "../data/factsSchema.js";
import { QUESTION_BANK, assertQuestionBankComplete } from "../data/factsQuestions.js";
import ANNEX_A_CONTROLS from "../data/annexAControls.js";
import { ISO27701_CONTROLS } from "../data/iso27701Controls.js";

assertQuestionBankComplete();

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

// --------- perf knobs (ONLY affects batching/parallelism; prompts unchanged) ----------
const FACTS_TTL_MS = Number(process.env.FACTS_TTL_MS || 10 * 60 * 1000); // 10 min
const SOA_CHUNK_SIZE = Number(process.env.SOA_CHUNK_SIZE || 15); // 10/12/15 recommended
const SOA_CONCURRENCY = Number(process.env.SOA_CONCURRENCY || 4); // 3-5 recommended

// In-memory cache (per server instance)
const factsCache = new Map(); // key -> { value, ts }

function hashText(s) {
  return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex");
}

function cacheGet(map, key) {
  const v = map.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > FACTS_TTL_MS) {
    map.delete(key);
    return null;
  }
  return v.value;
}

function cacheSet(map, key, value) {
  map.set(key, { value, ts: Date.now() });
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- helpers ----------
function isKnown(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  return true;
}

function computeMissingKeys(facts) {
  return FACT_KEYS.filter((k) => !isKnown(facts[k]));
}

function pickQuestionsForMissing(missingKeys) {
  // deterministic ordering for stable UI
  return missingKeys.map((k, idx) => ({
    id: `Q${idx + 1}`,
    key: k,
    question: QUESTION_BANK[k].question,
    why_it_matters: QUESTION_BANK[k].why,
  }));
}

// -----------
// LLM: Extract facts (fast) + cached
// (PROMPT UNCHANGED)
// -----------
async function extractFactsFromBF(businessText) {
  const cacheKey = "facts:" + hashText(businessText);
  const cached = cacheGet(factsCache, cacheKey);
  if (cached) return cached;

  const factsTemplate = buildDefaultFacts();

  const prompt = `
You are extracting structured facts for an ISO SoA decision.
ONLY use the current Business Function text. Do NOT assume anything.
If a fact is not explicitly stated, set it to null.

Return ONLY valid JSON with exactly these keys:
${JSON.stringify(Object.keys(factsTemplate), null, 2)}

Business Function:
${businessText}
`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const raw = completion?.choices?.[0]?.message?.content || "{}";
  let obj = {};
  try {
    obj = JSON.parse(raw);
  } catch {
    obj = {};
  }

  // fill missing keys with null (never allow missing key to break logic)
  const merged = buildDefaultFacts();
  for (const k of FACT_KEYS) merged[k] = isKnown(obj[k]) ? obj[k] : null;

  cacheSet(factsCache, cacheKey, merged);
  return merged;
}

// -----------
// LLM: Generate SoA for a control list (chunked + parallel)
// (PROMPT UNCHANGED except "Controls list:" gets a chunk)
// -----------
async function generateSoAForStandard({ standardName, controls, facts }) {
  const chunks = chunkArray(controls, SOA_CHUNK_SIZE);
  const limit = pLimit(SOA_CONCURRENCY);

  async function runOneChunk(controlsChunk) {
    const prompt = `
You are producing a Statement of Applicability (SoA) for ${standardName}.

Rules:
- Use ONLY the Facts JSON. Do NOT assume anything not present.
- If facts are insufficient for a decision, mark "Conditional" and explain what is unknown in reason.
- Output ONLY valid JSON with schema: { "controls": [ ... ] }

Facts JSON:
${JSON.stringify(facts, null, 2)}

Controls list:
${JSON.stringify(controlsChunk, null, 2)}

For each control, output:
{
  "standard": "${standardName}",
  "code": "<control code>",
  "title": "<title>",
  "domain": "<domain if given else ''>",
  "applicable": "Yes|No|Conditional",
  "reason": "<short audit-grade justification tied to facts; if Conditional, say what missing>",
  "confidence": <0.0-1.0>
}
`;

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = completion?.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    return Array.isArray(parsed.controls) ? parsed.controls : [];
  }

  const tasks = chunks.map((c) => limit(() => runOneChunk(c)));
  const results = await Promise.all(tasks);
  return results.flat();
}

// -----------------------------
// POST /api/soa/clarify
// -> returns facts + missing questions
// -----------------------------
router.post("/clarify", async (req, res) => {
  try {
    const { businessText } = req.body;

    if (!businessText || !String(businessText).trim()) {
      return res.status(400).json({ error: "businessText is required" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in .env" });
    }

    const facts = await extractFactsFromBF(businessText);
    const missingKeys = computeMissingKeys(facts);

    if (missingKeys.length) {
      return res.json({
        needs_clarification: true,
        missing_keys: missingKeys,
        missing_areas: [...new Set(missingKeys.map((k) => k.split(".")[0]))],
        questions: pickQuestionsForMissing(missingKeys),
        facts,
      });
    }

    return res.json({
      needs_clarification: false,
      missing_keys: [],
      missing_areas: [],
      questions: [],
      facts,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Clarify failed", details: e?.message || String(e) });
  }
});

// -----------------------------
// POST /api/soa/generate
// -> Always generates SoA, even if some unknowns exist
// -> unknowns become Conditional in output
// -----------------------------
router.post("/generate", async (req, res) => {
  try {
    const { businessText } = req.body;

    if (!businessText || !String(businessText).trim()) {
      return res.status(400).json({ error: "businessText is required" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in .env" });
    }

    // 1) extract facts (cached)
    const facts = await extractFactsFromBF(businessText);

    // 2) compute missing keys (we still generate; missing affects "Conditional")
    const missingKeys = computeMissingKeys(facts);

    // 3) generate both standards in parallel, and each standard is internally chunked+parallel
    const [soa27001, soa27701] = await Promise.all([
      generateSoAForStandard({
        standardName: "ISO 27001:2022 Annex A",
        controls: ANNEX_A_CONTROLS,
        facts,
      }),
      generateSoAForStandard({
        standardName: "ISO/IEC 27701:2019 PIMS",
        controls: ISO27701_CONTROLS,
        facts,
      }),
    ]);

    const combined = [...soa27001, ...soa27701];

    return res.json({
      controls: combined,
      facts_used: facts,
      missing_keys: missingKeys,
      questions: missingKeys.length ? pickQuestionsForMissing(missingKeys) : [],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Generate failed", details: e?.message || String(e) });
  }
});

export default router;
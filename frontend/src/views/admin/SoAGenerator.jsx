import React, { useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";

const API_BASE = "http://localhost:5001";
const APP_VALUES = new Set(["yes", "no", "conditional"]);

function normalizeApplicability(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "yes") return "Yes";
  if (s === "no") return "No";
  if (s === "conditional") return "Conditional";
  return v || "";
}

function normalizeControlRow(ctrl) {
  const c = { ...(ctrl || {}) };
  c.applicable = normalizeApplicability(c.applicable);
  if (typeof c.confidence === "string") {
    const n = Number(c.confidence);
    c.confidence = Number.isFinite(n) ? n : null;
  }
  if (typeof c.confidence !== "number") c.confidence = null;
  if (!c.reason && c.justification) c.reason = c.justification;
  return c;
}

function ApplicabilityBadge({ value }) {
  const v = (value || "").toLowerCase();
  let cls = "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white";
  if (v === "yes") cls = "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200";
  if (v === "conditional")
    cls = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200";
  if (v === "no") cls = "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200";

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${cls}`}>
      {value || "-"}
    </span>
  );
}

function ConfidencePill({ value }) {
  const v = typeof value === "number" ? value : null;
  let cls = "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white";
  if (v !== null) {
    if (v >= 0.8) cls = "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200";
    else if (v >= 0.5) cls = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200";
    else cls = "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200";
  }
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${cls}`}>
      {v === null ? "-" : v.toFixed(2)}
    </span>
  );
}

export default function SoAGenerator() {
  const [businessText, setBusinessText] = useState("");

  const [questions, setQuestions] = useState([]); // [{id,key,question,why_it_matters}]
  const [answers, setAnswers] = useState({});

  const [results, setResults] = useState([]);
  const [missingKeys, setMissingKeys] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All"); // All | Yes | Conditional | No

  const resetAll = () => {
    setBusinessText("");
    setQuestions([]);
    setAnswers({});
    setResults([]);
    setMissingKeys([]);
    setSearch("");
    setFilter("All");
    setError("");
    setLoading(false);
  };

  const filteredResults = useMemo(() => {
    const s = search.trim().toLowerCase();
    const normalized = (results || []).map(normalizeControlRow);

    return normalized.filter((r) => {
      const app = String(r.applicable || "");
      const okFilter = filter === "All" ? true : app.toLowerCase() === filter.toLowerCase();
      const okSearch = !s
        ? true
        : `${r.standard || ""} ${r.code || ""} ${r.title || ""} ${r.domain || ""} ${r.reason || ""}`
            .toLowerCase()
            .includes(s);
      return okFilter && okSearch;
    });
  }, [results, search, filter]);

  async function apiClarify(text) {
    const res = await axios.post(`${API_BASE}/api/soa/clarify`, { businessText: text });
    return res.data;
  }

  async function apiGenerate(text) {
    const res = await axios.post(`${API_BASE}/api/soa/generate`, { businessText: text });
    return res.data;
  }

  // Step 1: Clarify -> if no questions -> generate
  const onGenerate = async () => {
    if (!businessText.trim()) return setError("Please enter business function description.");
    setLoading(true);
    setError("");

    try {
      const c = await apiClarify(businessText);

      if (c?.needs_clarification) {
        setQuestions(Array.isArray(c.questions) ? c.questions : []);
        setAnswers({});
        setResults([]);
        setMissingKeys(Array.isArray(c.missing_keys) ? c.missing_keys : []);
        return;
      }

      // no questions -> generate immediately
      const g = await apiGenerate(businessText);
      setResults(Array.isArray(g.controls) ? g.controls : []);
      setMissingKeys(Array.isArray(g.missing_keys) ? g.missing_keys : []);
      setQuestions([]); // backend still returns questions optionally, but we won't force user
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || "Failed to generate SoA.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Continue after answering missing questions -> generate
  const onContinue = async () => {
    const unanswered = questions.filter((q) => !(answers[q.id] || "").trim());
    if (unanswered.length) return setError(`Please answer all questions (${unanswered.length} missing).`);

    setLoading(true);
    setError("");

    try {
      const qaBlock = [
        "\n\n---\nCLARIFICATIONS (user provided):",
        ...questions.map((q) => `- ${q.key}: ${(answers[q.id] || "").trim()}`),
        "---\n",
      ].join("\n");

      const mergedBF = `${businessText.trim()}\n${qaBlock}`;
      setBusinessText(mergedBF);

      const g = await apiGenerate(mergedBF);

      setResults(Array.isArray(g.controls) ? g.controls : []);
      setMissingKeys(Array.isArray(g.missing_keys) ? g.missing_keys : []);

      // If there are still missing keys, we DO NOT block generation (they become Conditional).
      // But we can show the questions optionally.
      setQuestions(Array.isArray(g.questions) ? g.questions : []);
      setAnswers({});
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || "Failed to continue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">Statement of Applicability (SoA)</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              BF → Clarify missing facts → Generate SoA (ISO 27001:2022 Annex A + ISO/IEC 27701 PIMS).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-navy-700"
            >
              Reset
            </button>

            <button
              onClick={onGenerate}
              disabled={loading}
              type="button"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? "Working..." : "Generate SoA"}
            </button>
          </div>
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
          rows={7}
          value={businessText}
          onChange={(e) => setBusinessText(e.target.value)}
          placeholder="Describe scope, sites, systems, data (PII/payment), vendors, remote access, logging, backups, etc."
        />

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
      </Card>

      {/* Clarification UI (only when clarify endpoint asks) */}
      {questions.length > 0 && results.length === 0 && (
        <Card className="p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-navy-700 dark:text-white">Clarifications needed</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Answer only what is missing. If you skip, SoA can still be generated later as Conditional.
              </p>

              {missingKeys.length > 0 && (
                <div className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                  Missing keys: <span className="font-semibold">{missingKeys.length}</span>
                </div>
              )}
            </div>

            <button
              onClick={onContinue}
              disabled={loading}
              type="button"
              className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 md:mt-0"
            >
              {loading ? "Continuing..." : "Continue"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4">
            {questions.map((q) => (
              <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
                <div className="text-sm font-bold text-navy-700 dark:text-white">
                  {q.id}. {q.question}
                </div>
                {q.why_it_matters && (
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-semibold">Why:</span> {q.why_it_matters}
                  </div>
                )}
                <textarea
                  className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  rows={3}
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Type your answer..."
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card className="p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-navy-700 dark:text-white">
                SoA Controls ({filteredResults.length}/{results.length})
              </h3>
              {missingKeys.length > 0 && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Some facts were unknown → affected controls may be marked <span className="font-semibold">Conditional</span>.
                </p>
              )}
            </div>

            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search standard / code / title / reason..."
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white md:w-80"
              />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
              >
                <option value="All">All</option>
                <option value="Yes">Yes</option>
                <option value="Conditional">Conditional</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
            <table className="min-w-[1200px] w-full border-collapse">
              <thead className="bg-gray-50 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Standard
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Control
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Domain
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Applicable
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Confidence
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredResults.map((raw, idx) => {
                  const ctrl = normalizeControlRow(raw);
                  return (
                    <tr key={`${ctrl.standard || ""}-${ctrl.code}-${idx}`} className="border-t border-gray-200 dark:border-white/10">
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{ctrl.standard || "-"}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-navy-700 dark:text-white">{ctrl.code}</td>
                      <td className="px-4 py-3 text-sm text-navy-700 dark:text-white">{ctrl.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{ctrl.domain || "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        <ApplicabilityBadge value={ctrl.applicable} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{ctrl.reason || "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        <ConfidencePill value={ctrl.confidence} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

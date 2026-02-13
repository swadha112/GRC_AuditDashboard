import React, { useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001";

/** Try to parse JSON even if model wraps it in ```json ...``` */
function parseMaybeJson(raw) {
  if (!raw) return { ok: false, data: null, err: "Empty" };

  let s = String(raw).trim();

  // strip markdown fences
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "");
    s = s.replace(/```$/, "");
    s = s.trim();
  }

  try {
    const data = JSON.parse(s);
    return { ok: true, data, err: null };
  } catch (e) {
    return { ok: false, data: null, err: e.message };
  }
}

function SeverityBadge({ severity }) {
  const sev = (severity || "").toLowerCase();
  let cls = "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white";

  if (sev.includes("high") || sev.includes("major") || sev.includes("critical"))
    cls = "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200";

  if (sev.includes("medium") || sev.includes("minor"))
    cls = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-200";

  if (sev.includes("low") || sev.includes("observation"))
    cls = "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${cls}`}
    >
      {severity || "Unspecified"}
    </span>
  );
}

function ConfidenceBar({ value }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const pct = Math.round(v * 100);
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
        <span>Confidence</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-white/10">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Pretty renderer if output is valid JSON */
function NiceOutputView({ data }) {
  const control = data?.control || "";
  const summary = data?.summary || data?.overall_summary || "";
  const gaps = Array.isArray(data?.gaps) ? data.gaps : [];
  const conf = data?.confidence?.overall ?? data?.confidence ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-navy-700 dark:text-white">
            {control || "Control/Clause"}
          </div>
          {summary ? (
            <div className="text-sm text-gray-700 dark:text-gray-200">{summary}</div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-300">
              No summary provided.
            </div>
          )}
          {conf !== null && <ConfidenceBar value={conf} />}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {gaps.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-white/10 dark:bg-navy-800 dark:text-gray-200">
            No gaps returned.
          </div>
        ) : (
          gaps.map((g, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-navy-700 dark:text-white">
                  {g.gap_title || `Gap ${idx + 1}`}
                </div>
                <SeverityBadge severity={g.severity} />
              </div>

              {g.gap_description && (
                <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                  {g.gap_description}
                </div>
              )}

              {g.recommended_action && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-white/5 dark:text-gray-200">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                    Recommended action
                  </div>
                  <div className="mt-1">{g.recommended_action}</div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function GapGenerator() {
  // Inputs
  const [standard, setStandard] = useState("ISO 27001:2022");
  const [control, setControl] = useState("A.5.1");
  const [questions, setQuestions] = useState("");
  const [businessResponse, setBusinessResponse] = useState("");
  const [file, setFile] = useState(null);

  // Output state
  const [loading, setLoading] = useState(false);
  const [rawResult, setRawResult] = useState("");
  const [draftResult, setDraftResult] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // "Local accept" state (no DB yet)
  const [accepted, setAccepted] = useState(false);

  const parsed = useMemo(() => parseMaybeJson(rawResult), [rawResult]);
  const parsedDraft = useMemo(() => parseMaybeJson(draftResult), [draftResult]);

  const canGenerate = useMemo(() => {
    return Boolean(standard.trim() && control.trim() && (questions.trim() || businessResponse.trim()));
  }, [standard, control, questions, businessResponse]);

  const generate = async () => {
    setLoading(true);
    setAccepted(false);
    try {
      const fd = new FormData();
      fd.append("standard", standard);
      fd.append("control", control);
      fd.append("questions", questions);
      fd.append("response", businessResponse);
      if (file) fd.append("evidence", file);

      const res = await axios.post('http://localhost:5001/api/gaps/generate', fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res?.data;
        const out = data?.raw ? String(data.raw) : JSON.stringify(data ?? {}, null, 2);
        setRawResult(out);
        setDraftResult(out);
        setIsEditing(false);
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || e.message || "Request failed";
      const errObj = JSON.stringify({ error: msg }, null, 2);
      setRawResult(errObj);
      setDraftResult(errObj);
      setIsEditing(false);
    } finally {
      setLoading(false);
    }
  };

  const regenerate = () => generate();

  const reject = () => {
    setRawResult("");
    setDraftResult("");
    setIsEditing(false);
    setAccepted(false);
  };

  const accept = () => {
    if (isEditing) {
      setRawResult(draftResult);
      setIsEditing(false);
    }
    setAccepted(true);
  };

  const toggleEdit = () => {
    if (!rawResult) return;
    setIsEditing((s) => !s);
    setAccepted(false);
    if (!isEditing) setDraftResult(rawResult);
  };

  const outputData = useMemo(() => {
    if (isEditing) return parsedDraft;
    return parsed;
  }, [isEditing, parsed, parsedDraft]);

  return (
    <div className="mt-3 flex h-full w-full flex-col gap-5">
      {/* Header (NO breadcrumbs here to avoid repeat) */}
      <div className="flex flex-col gap-1 px-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Input control/clause + questions + response + evidence, then generate gaps via LLM.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 items-start">
        {/* Inputs */}
        <Card extra={"w-full p-5"}>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">Inputs</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Keep answers concise. 
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm font-medium text-navy-700 dark:text-white">Standard</label>
              <input
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                placeholder="e.g., ISO 27001:2022"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-navy-700 dark:text-white">
                Control / Clause
              </label>
              <input
                value={control}
                onChange={(e) => setControl(e.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                placeholder="e.g., A.5.1 or 5.2"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-navy-700 dark:text-white">Questions</label>
              <textarea
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                rows={6}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                placeholder="Paste audit checklist questions here..."
              />
            </div>

            <div>
              <label className="text-sm font-medium text-navy-700 dark:text-white">
                Business Response
              </label>
              <textarea
                value={businessResponse}
                onChange={(e) => setBusinessResponse(e.target.value)}
                rows={6}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                placeholder="Paste business response here..."
              />
            </div>

            <div>
              <label className="text-sm font-medium text-navy-700 dark:text-white">
                Evidence (PDF)
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
              />
              {file && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                  Selected: <span className="font-medium">{file.name}</span>
                </p>
              )}
            </div>

            <button
              onClick={generate}
              disabled={loading || !canGenerate}
              className="mt-2 w-full rounded-xl bg-brand-500 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate Gaps"}
            </button>

            {!canGenerate && (
              <p className="text-xs text-gray-500 dark:text-gray-300">
                Tip: Add Standard + Control, and either Questions or Business Response.
              </p>
            )}
          </div>
        </Card>

        {/* Output */}
        <Card extra={"w-full p-5"}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">Output</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Edit before accepting. 
              </p>
              {accepted && (
                <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-300">
                  Accepted (local only).
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={toggleEdit}
                disabled={!rawResult}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-navy-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
              >
                {isEditing ? "Stop Edit" : "Edit"}
              </button>
              <button
                onClick={regenerate}
                disabled={loading}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-navy-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
              >
                Regenerate
              </button>
            </div>
          </div>

          {!rawResult ? (
            <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-white/10">
              <span className="text-sm text-gray-500 dark:text-gray-300">
                No gaps generated yet.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {isEditing ? (
                <>
                  <textarea
                    value={draftResult}
                    onChange={(e) => setDraftResult(e.target.value)}
                    rows={16}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                  />
                  {!outputData.ok && (
                    <p className="text-xs text-red-600 dark:text-red-300">
                      Edited output is not valid JSON: {outputData.err}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {outputData.ok ? (
                    <NiceOutputView data={outputData.data} />
                  ) : (
                    <div className="max-h-[520px] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs dark:border-white/10 dark:bg-navy-900 dark:text-white">
                      <pre className="whitespace-pre-wrap">{rawResult}</pre>
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={accept}
                  className="rounded-xl bg-green-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-green-700"
                >
                  Accept
                </button>
                <button
                  onClick={reject}
                  className="rounded-xl bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

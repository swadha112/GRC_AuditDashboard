import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";

const API_BASE = "http://localhost:5001";

const DOMAIN_OPTIONS = ["Organizational", "People", "Physical", "Technological", "Unknown"];
const TYPE_OPTIONS = ["Major", "Minor", "Observation"];

function TypeBadge({ value }) {
  const v = (value || "").toLowerCase();
  let cls = "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white";
  if (v === "major") cls = "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200";
  if (v === "minor") cls = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200";
  if (v === "observation") cls = "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200";
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${cls}`}>
      {value || "-"}
    </span>
  );
}

function MergeModal({ open, conflicts, onClose, onResolved }) {
  const [decisions, setDecisions] = useState([]);

  useEffect(() => {
    if (!open) return;
    const init = (conflicts || []).map((c, idx) => ({
      idx,
      action: "merge",
      targetId: c.candidates?.[0]?.existing?.id || null,
    }));
    setDecisions(init);
  }, [open, conflicts]);

  if (!open) return null;

  const setDecision = (idx, patch) => {
    setDecisions((prev) => prev.map((d) => (d.idx === idx ? { ...d, ...patch } : d)));
  };

  const submit = async () => {
    const resolutions = (conflicts || []).map((c, idx) => {
      const d = decisions.find((x) => x.idx === idx);
      return {
        incoming: c.incoming,
        action: d?.action || "merge",
        targetId: d?.targetId || c.candidates?.[0]?.existing?.id || null,
      };
    });

    await axios.post(`${API_BASE}/api/audit/resolve`, { resolutions });
    onResolved?.();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl dark:bg-navy-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-navy-700 dark:text-white">Possible duplicates detected</div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Review similar findings and choose what to do.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] space-y-4 overflow-auto pr-1">
          {(conflicts || []).map((c, idx) => {
            const best = c.candidates?.[0];
            const bestExisting = best?.existing;
            const sim = Number(best?.similarity ?? 0);
            const decision = decisions.find((x) => x.idx === idx) || {};
            const action = decision.action || "merge";

            return (
              <div key={idx} className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-bold text-navy-700 dark:text-white">
                      Conflict #{idx + 1} — similarity {sim.toFixed(2)}
                    </div>
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      {best?.conflict_level === "strong" ? "Strong match" : "Possible match"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <select
                      value={action}
                      onChange={(e) => setDecision(idx, { action: e.target.value })}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                    >
                      <option value="merge">Merge</option>
                      <option value="keep_both">Keep both</option>
                      <option value="keep_existing">Keep existing</option>
                      <option value="replace_existing">Replace existing</option>
                    </select>

                    {(action === "merge" || action === "replace_existing") && (
                      <select
                        value={decision.targetId || ""}
                        onChange={(e) => setDecision(idx, { targetId: Number(e.target.value) })}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                      >
                        {(c.candidates || []).map((cand) => (
                          <option key={cand.existing.id} value={cand.existing.id}>
                            #{cand.existing.id} • {cand.existing.control} • {cand.similarity.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/5">
                    <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Incoming</div>
                    <div className="mt-2 text-navy-700 dark:text-white">
                      <div className="font-semibold">
                        {c.incoming.control} • {c.incoming.type}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-200">
                        {c.incoming.source_observation}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-gray-700 dark:text-gray-200">
                        <b>Basis:</b> {c.incoming.basis}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/5">
                    <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Candidates</div>
                    <div className="mt-2 space-y-2">
                      {(c.candidates || []).map((cand) => (
                        <div
                          key={cand.existing.id}
                          className="rounded-lg border border-gray-200 p-2 dark:border-white/10"
                        >
                          <div className="font-semibold text-navy-700 dark:text-white">
                            #{cand.existing.id} • {cand.existing.control} • {cand.existing.type}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            similarity {Number(cand.similarity).toFixed(2)}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-200">
                            {cand.existing.source_observation}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-200">
                            <b>Basis:</b> {cand.existing.basis}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            type="button"
          >
            Apply decisions
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InternalAuditGapAssessment() {
  const [standard, setStandard] = useState("ISO27001:2022");
  const [observationsText, setObservationsText] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const [conflicts, setConflicts] = useState([]);
  const [mergeOpen, setMergeOpen] = useState(false);

  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const blob = `${r.source_observation} ${r.domain} ${r.control} ${r.clause} ${r.type} ${r.basis} ${(r.recommendation || []).join(" ")}`.toLowerCase();
      return blob.includes(s);
    });
  }, [rows, search]);

  const refresh = async () => {
    const res = await axios.get(`${API_BASE}/api/audit/findings`);
    setRows(res.data?.rows || []);
  };

  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  const assess = async () => {
    setError("");
    if (!observationsText.trim()) {
      setError("Paste at least one observation.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/audit/assess`, {
        standard,
        observationsText,
      });

      const created = Array.isArray(res.data?.created) ? res.data.created : [];
      const conf = Array.isArray(res.data?.conflicts) ? res.data.conflicts : [];

      if (created.length) {
        await refresh();
      }

      if (conf.length) {
        setConflicts(conf);
        setMergeOpen(true);
      }

      if (!created.length && !conf.length) {
        setError("AI returned no items. Try rewriting the observation(s).");
      } else {
        setObservationsText("");
      }
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Assessment failed.");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft({
      ...row,
      recommendationText: (row.recommendation || []).join("\n"),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = async () => {
    if (!editDraft) return;

    const updated = {
      domain: editDraft.domain,
      control: editDraft.control,
      clause: editDraft.clause,
      type: editDraft.type,
      basis: editDraft.basis,
      recommendation: String(editDraft.recommendationText || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    };

    try {
      await axios.patch(`${API_BASE}/api/audit/findings/${editingId}`, updated);
      await refresh();
      cancelEdit();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to save edit.");
    }
  };

  const removeRow = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/audit/findings/${id}`);
      await refresh();
      if (editingId === id) cancelEdit();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to delete.");
    }
  };

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      <MergeModal
        open={mergeOpen}
        conflicts={conflicts}
        onClose={() => setMergeOpen(false)}
        onResolved={async () => {
          await refresh();
          setConflicts([]);
          setMergeOpen(false);
        }}
      />

      <Card className="p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Internal Audit Gap Assessment
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Paste observations. AI splits them into rows and classifies them. Stored in DB. Similar findings come up for merge review.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-white/5"
              type="button"
            >
              Refresh
            </button>

            <button
              onClick={assess}
              disabled={loading}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              type="button"
            >
              {loading ? "Assessing..." : "Assess with AI"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Standard</div>
            <input
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
              value={standard}
              onChange={(e) => setStandard(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Observations</div>
            <textarea
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
              rows={6}
              placeholder={`Example:
- Access reviews are not documented for admin accounts.
- USB ports are not blocked on store desktops.
- Incident response contacts are outdated.

Or paste a paragraph; AI will split it.`}
              value={observationsText}
              onChange={(e) => setObservationsText(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-navy-700 dark:text-white">
              Findings Table ({filteredRows.length}/{rows.length})
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Always human-reviewed. Edit and delete persist to DB.
            </p>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search domain / control / type / text..."
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white md:w-96"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="min-w-[1250px] w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Control</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Clause</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Basis</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Recommendation</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((r) => {
                const isEditing = editingId === r.id;
                const d = isEditing ? editDraft : r;

                return (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-white/10">
                    <td className="px-4 py-3 text-sm text-navy-700 dark:text-white">
                      {isEditing ? (
                        <select
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          value={d.domain}
                          onChange={(e) => setEditDraft((p) => ({ ...p, domain: e.target.value }))}
                        >
                          {DOMAIN_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      ) : (
                        r.domain
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm font-semibold text-navy-700 dark:text-white">
                      {isEditing ? (
                        <input
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          value={d.control}
                          onChange={(e) => setEditDraft((p) => ({ ...p, control: e.target.value }))}
                        />
                      ) : (
                        r.control
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {isEditing ? (
                        <input
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          value={d.clause || ""}
                          onChange={(e) => setEditDraft((p) => ({ ...p, clause: e.target.value }))}
                        />
                      ) : (
                        r.clause || "-"
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      {isEditing ? (
                        <select
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          value={d.type}
                          onChange={(e) => setEditDraft((p) => ({ ...p, type: e.target.value }))}
                        >
                          {TYPE_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      ) : (
                        <TypeBadge value={r.type} />
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {isEditing ? (
                        <textarea
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          rows={3}
                          value={d.basis || ""}
                          onChange={(e) => setEditDraft((p) => ({ ...p, basis: e.target.value }))}
                        />
                      ) : (
                        r.basis || "-"
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {isEditing ? (
                        <textarea
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          rows={4}
                          value={d.recommendationText}
                          onChange={(e) => setEditDraft((p) => ({ ...p, recommendationText: e.target.value }))}
                          placeholder="One step per line"
                        />
                      ) : (
                        <ul className="list-disc pl-5">
                          {(r.recommendation || []).map((x, i) => <li key={i}>{x}</li>)}
                        </ul>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        {!isEditing ? (
                          <>
                            <button
                              onClick={() => startEdit(r)}
                              className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => removeRow(r.id)}
                              className="rounded-lg border border-red-200 px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-200 dark:hover:bg-red-500/10"
                              type="button"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={saveEdit}
                              className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-white hover:bg-brand-600"
                              type="button"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                              type="button"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-gray-600 dark:text-gray-300">
                    No findings yet. Paste observations above and click “Assess with AI”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
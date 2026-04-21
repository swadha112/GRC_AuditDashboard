import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";
import {
  MdOutlineSearch,
  MdOutlineAssignment,
  MdRefresh,
  MdAutoAwesome,
  MdEdit,
  MdDeleteOutline,
  MdSave,
  MdClose,
  MdOutlineWarningAmber,
  MdMerge,
} from "react-icons/md";

const API_BASE = "http://localhost:5001";

const DOMAIN_OPTIONS = ["Organizational", "People", "Physical", "Technological", "Unknown"];
const TYPE_OPTIONS = ["Major", "Minor", "Observation"];

const TYPE_CFG = {
  major:       { badge: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",     dot: "bg-red-500" },
  minor:       { badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500" },
  observation: { badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300", dot: "bg-green-500" },
};

const DOMAIN_CFG = {
  organizational: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  people:         "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  physical:       "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  technological:  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  unknown:        "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

// ── Inject keyframes ─────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("ia-keyframes")) {
  const s = document.createElement("style");
  s.id = "ia-keyframes";
  s.textContent = `
    @keyframes iaModalIn  { from { opacity:0; transform:scale(0.96) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes iaFadeIn   { from { opacity:0; } to { opacity:1; } }
    @keyframes iaSlideDown{ from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(s);
}

const INPUT_CLS =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-navy-700 outline-none focus:border-brand-400 focus:bg-white transition dark:border-white/10 dark:bg-navy-900 dark:text-white dark:focus:bg-navy-800";
const LABEL_CLS = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

function TypeBadge({ value }) {
  const k = (value || "").toLowerCase();
  const cfg = TYPE_CFG[k] || { badge: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}>
      {value || "—"}
    </span>
  );
}

function DomainBadge({ value }) {
  const k = (value || "").toLowerCase();
  const cls = DOMAIN_CFG[k] || DOMAIN_CFG.unknown;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {value || "—"}
    </span>
  );
}

function StatCard({ label, value, dotColor }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-navy-900">
      <span className={`h-3 w-3 flex-shrink-0 rounded-full ${dotColor}`} />
      <div>
        <p className="text-xl font-bold text-navy-700 dark:text-white">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

// ── Merge conflict modal ──────────────────────────────────────────────────────
function MergeModal({ open, conflicts, onClose, onResolved }) {
  const [decisions, setDecisions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDecisions(
      (conflicts || []).map((c, idx) => ({
        idx,
        action: "merge",
        targetId: c.candidates?.[0]?.existing?.id || null,
      }))
    );
  }, [open, conflicts]);

  if (!open) return null;

  const setDecision = (idx, patch) =>
    setDecisions((prev) => prev.map((d) => (d.idx === idx ? { ...d, ...patch } : d)));

  const submit = async () => {
    setSubmitting(true);
    try {
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        style={{ animation: "iaFadeIn 0.15s ease both" }}
        onClick={onClose}
      />
      <div
        style={{ animation: "iaModalIn 0.18s cubic-bezier(0.16,1,0.3,1) both" }}
        className="relative z-10 w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-navy-800"
      >
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 dark:border-white/10 dark:bg-navy-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
              <MdMerge className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-700 dark:text-white">
                Similar Findings Detected
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {conflicts.length} potential duplicate{conflicts.length !== 1 ? "s" : ""} — choose how to handle each
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 transition"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {(conflicts || []).map((c, idx) => {
            const best = c.candidates?.[0];
            const sim = Number(best?.similarity ?? 0);
            const decision = decisions.find((x) => x.idx === idx) || {};
            const action = decision.action || "merge";
            const isStrong = best?.conflict_level === "strong";

            return (
              <div
                key={idx}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-white/10 dark:bg-navy-900"
              >
                {/* Conflict header */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isStrong
                          ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                      }`}
                    >
                      {isStrong ? "Strong match" : "Possible match"} · {sim.toFixed(2)} similarity
                    </span>
                    <span className="text-sm font-semibold text-navy-700 dark:text-white">
                      Conflict #{idx + 1}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <select
                      value={action}
                      onChange={(e) => setDecision(idx, { action: e.target.value })}
                      className={INPUT_CLS + " !w-auto"}
                    >
                      <option value="merge">Merge into existing</option>
                      <option value="keep_both">Keep both</option>
                      <option value="keep_existing">Keep existing, discard new</option>
                      <option value="replace_existing">Replace existing with new</option>
                    </select>

                    {(action === "merge" || action === "replace_existing") && (
                      <select
                        value={decision.targetId || ""}
                        onChange={(e) => setDecision(idx, { targetId: Number(e.target.value) })}
                        className={INPUT_CLS + " !w-auto"}
                      >
                        {(c.candidates || []).map((cand) => (
                          <option key={cand.existing.id} value={cand.existing.id}>
                            #{cand.existing.id} · {cand.existing.control} · {Number(cand.similarity).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-brand-200 bg-white p-4 dark:border-brand-500/30 dark:bg-navy-800">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-500">Incoming (new)</p>
                    <p className="font-semibold text-navy-700 dark:text-white">
                      {c.incoming.control}
                      <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">· {c.incoming.type}</span>
                    </p>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{c.incoming.source_observation}</p>
                    {c.incoming.basis && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold">Basis: </span>{c.incoming.basis}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {(c.candidates || []).map((cand) => (
                      <div
                        key={cand.existing.id}
                        className={`rounded-xl border bg-white p-4 dark:bg-navy-800 ${
                          String(decision.targetId) === String(cand.existing.id)
                            ? "border-amber-400 dark:border-amber-400/50"
                            : "border-gray-100 dark:border-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-navy-700 dark:text-white">
                            #{cand.existing.id} · {cand.existing.control}
                            <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">· {cand.existing.type}</span>
                          </p>
                          <span className="text-xs text-gray-400">{Number(cand.similarity).toFixed(2)}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{cand.existing.source_observation}</p>
                        {cand.existing.basis && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-semibold">Basis: </span>{cand.existing.basis}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4 dark:border-white/10 dark:bg-navy-800">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5 transition"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition"
            type="button"
          >
            <MdMerge className="h-4 w-4" />
            {submitting ? "Applying…" : "Apply decisions"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function InternalAuditGapAssessment() {
  const [standard, setStandard] = useState("ISO27001:2022");
  const [observationsText, setObservationsText] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const [conflicts, setConflicts] = useState([]);
  const [mergeOpen, setMergeOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterDomain, setFilterDomain] = useState("all");

  const stats = useMemo(() => {
    const s = { total: rows.length, Major: 0, Minor: 0, Observation: 0 };
    rows.forEach((r) => { if (s[r.type] !== undefined) s[r.type]++; });
    return s;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterDomain !== "all" && r.domain !== filterDomain) return false;
      if (!s) return true;
      const blob = `${r.source_observation} ${r.domain} ${r.control} ${r.clause} ${r.type} ${r.basis} ${(r.recommendation || []).join(" ")}`.toLowerCase();
      return blob.includes(s);
    });
  }, [rows, search, filterType, filterDomain]);

  const refresh = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await axios.get(`${API_BASE}/api/audit/findings`);
      setRows(res.data?.rows || []);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { refresh(true).catch(console.error); }, []);

  const assess = async () => {
    setError("");
    if (!observationsText.trim()) { setError("Paste at least one observation."); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/audit/assess`, { standard, observationsText });
      const created = Array.isArray(res.data?.created) ? res.data.created : [];
      const conf = Array.isArray(res.data?.conflicts) ? res.data.conflicts : [];

      if (created.length) await refresh(true);
      if (conf.length) { setConflicts(conf); setMergeOpen(true); }
      if (!created.length && !conf.length) {
        setError("AI returned no items. Try rewriting the observation(s).");
      } else {
        setObservationsText("");
      }
    } catch (e) {
      setError(e?.response?.data?.error || "Assessment failed.");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft({ ...row, recommendationText: (row.recommendation || []).join("\n") });
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };

  const saveEdit = async () => {
    if (!editDraft) return;
    try {
      await axios.patch(`${API_BASE}/api/audit/findings/${editingId}`, {
        domain: editDraft.domain,
        control: editDraft.control,
        clause: editDraft.clause,
        type: editDraft.type,
        basis: editDraft.basis,
        recommendation: String(editDraft.recommendationText || "").split("\n").map((x) => x.trim()).filter(Boolean),
      });
      await refresh(true);
      cancelEdit();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save edit.");
    }
  };

  const removeRow = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/audit/findings/${id}`);
      await refresh(true);
      if (editingId === id) cancelEdit();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to delete.");
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-5">
      <MergeModal
        open={mergeOpen}
        conflicts={conflicts}
        onClose={() => setMergeOpen(false)}
        onResolved={async () => { await refresh(true); setConflicts([]); setMergeOpen(false); }}
      />

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
            <MdOutlineAssignment className="text-xl" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-navy-700 dark:text-white">IA Gap Assessment</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paste observations · AI classifies · similar findings merge automatically
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5 transition"
            type="button"
          >
            <MdRefresh className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={assess}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 hover:bg-brand-600 disabled:opacity-60 transition"
            type="button"
          >
            <MdAutoAwesome className="h-4 w-4" />
            {loading ? "Assessing…" : "Assess with AI"}
          </button>
        </div>
      </div>

      {/* Input card */}
      <Card className="rounded-2xl p-5 dark:bg-navy-800">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label className={LABEL_CLS}>Standard</label>
            <input
              className={INPUT_CLS}
              value={standard}
              onChange={(e) => setStandard(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Audit observations</label>
            <textarea
              className={INPUT_CLS}
              rows={5}
              placeholder={`- Access reviews are not documented for admin accounts.\n- USB ports are not blocked on store desktops.\n- Incident response contacts are outdated.\n\nOr paste a paragraph — AI will split it into rows.`}
              value={observationsText}
              onChange={(e) => setObservationsText(e.target.value)}
            />
            <p className="mt-1.5 text-right text-xs text-gray-400 dark:text-gray-500">
              {observationsText.trim().split(/\n+/).filter(Boolean).length} line{observationsText.trim().split(/\n+/).filter(Boolean).length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {error && (
          <div
            style={{ animation: "iaSlideDown 0.2s ease both" }}
            className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          >
            {error}
          </div>
        )}
      </Card>

      {/* Stats strip */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total findings" value={stats.total} dotColor="bg-brand-500" />
          <StatCard label="Major" value={stats.Major} dotColor="bg-red-500" />
          <StatCard label="Minor" value={stats.Minor} dotColor="bg-amber-500" />
          <StatCard label="Observation" value={stats.Observation} dotColor="bg-green-500" />
        </div>
      )}

      {/* Findings card */}
      <Card className="rounded-2xl p-5 dark:bg-navy-800">
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-navy-700 dark:text-white">
              Findings
              <span className="ml-2 text-sm font-normal text-gray-400">
                {filteredRows.length}/{rows.length}
              </span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Human-reviewed · edits persist to DB</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className={INPUT_CLS + " !w-auto"}
            >
              <option value="all">All types</option>
              {TYPE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              className={INPUT_CLS + " !w-auto"}
            >
              <option value="all">All domains</option>
              {DOMAIN_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <div className="relative">
              <MdOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className={INPUT_CLS + " !pl-9 !w-52"}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-white/10">
          <table className="min-w-[1100px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-white/10 dark:bg-white/5">
                {["Domain", "Control", "Clause", "Type", "Observation", "Basis", "Recommendations", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((r) => {
                const isEditing = editingId === r.id;
                const d = isEditing ? editDraft : r;
                const typeDot = TYPE_CFG[(r.type || "").toLowerCase()]?.dot || "bg-gray-400";

                return (
                  <tr
                    key={r.id}
                    className={`border-b border-gray-100 transition dark:border-white/10 ${
                      isEditing ? "bg-brand-50/40 dark:bg-brand-500/5" : "hover:bg-gray-50/60 dark:hover:bg-white/3"
                    }`}
                  >
                    {/* Domain */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select value={d.domain} onChange={(e) => setEditDraft((p) => ({ ...p, domain: e.target.value }))} className={INPUT_CLS}>
                          {DOMAIN_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      ) : (
                        <DomainBadge value={r.domain} />
                      )}
                    </td>

                    {/* Control */}
                    <td className="px-4 py-3 font-mono font-semibold text-navy-700 dark:text-white">
                      {isEditing ? (
                        <input value={d.control} onChange={(e) => setEditDraft((p) => ({ ...p, control: e.target.value }))} className={INPUT_CLS} />
                      ) : r.control}
                    </td>

                    {/* Clause */}
                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">
                      {isEditing ? (
                        <input value={d.clause || ""} onChange={(e) => setEditDraft((p) => ({ ...p, clause: e.target.value }))} className={INPUT_CLS} />
                      ) : (r.clause || "—")}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select value={d.type} onChange={(e) => setEditDraft((p) => ({ ...p, type: e.target.value }))} className={INPUT_CLS}>
                          {TYPE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${typeDot}`} />
                          <TypeBadge value={r.type} />
                        </div>
                      )}
                    </td>

                    {/* Source observation */}
                    <td className="max-w-[220px] px-4 py-3 text-gray-800 dark:text-gray-100">
                      <p className="line-clamp-3 text-sm leading-snug">{r.source_observation || "—"}</p>
                    </td>

                    {/* Basis */}
                    <td className="max-w-[180px] px-4 py-3 text-gray-600 dark:text-gray-300">
                      {isEditing ? (
                        <textarea rows={3} value={d.basis || ""} onChange={(e) => setEditDraft((p) => ({ ...p, basis: e.target.value }))} className={INPUT_CLS} />
                      ) : (
                        <p className="line-clamp-3 text-sm">{r.basis || "—"}</p>
                      )}
                    </td>

                    {/* Recommendations */}
                    <td className="max-w-[200px] px-4 py-3">
                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={d.recommendationText}
                          onChange={(e) => setEditDraft((p) => ({ ...p, recommendationText: e.target.value }))}
                          placeholder="One step per line"
                          className={INPUT_CLS}
                        />
                      ) : (
                        <ul className="space-y-1">
                          {(r.recommendation || []).map((x, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
                              {x}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {!isEditing ? (
                          <>
                            <button
                              onClick={() => startEdit(r)}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/10 transition"
                              title="Edit"
                            >
                              <MdEdit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => removeRow(r.id)}
                              className="rounded-lg border border-red-100 p-1.5 text-red-500 hover:bg-red-50 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10 transition"
                              title="Delete"
                            >
                              <MdDeleteOutline className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={saveEdit}
                              className="rounded-lg bg-brand-500 p-1.5 text-white hover:bg-brand-600 transition"
                              title="Save"
                            >
                              <MdSave className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/10 transition"
                              title="Cancel"
                            >
                              <MdClose className="h-4 w-4" />
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
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <MdOutlineWarningAmber className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      {rows.length === 0
                        ? "No findings yet — paste observations above and click Assess with AI."
                        : "No findings match your filters."}
                    </p>
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

import React, { useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";
import { ISO27001_CONTROLS } from "../../constants/iso27001Controls";
import {
  MdOutlineAutoAwesome,
  MdOutlineSave,
  MdOutlineRefresh,
  MdOutlineEdit,
  MdOutlineCheck,
  MdOutlineClose,
  MdOutlineFilterList,
  MdOutlineSearch,
  MdOutlineShield,
  MdOutlineAdd,
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdOutlineQuestionAnswer,
  MdOutlineDescription,
} from "react-icons/md";
import {
  HiDocumentText,
  HiClipboardDocumentCheck,
  HiExclamationCircle,
  HiCheckCircle,
} from "react-icons/hi2";

const API_BASE = "http://localhost:5001";
const APPLICABILITY_OPTIONS = ["Yes", "No", "Conditional", "Clarification Needed"];
const DOMAIN_ORDER = ["Organizational", "People", "Physical", "Technological"];

const DOMAIN_STYLE = {
  Organizational: { dot: "#4318FF", badge: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300", bar: "bg-brand-500" },
  People:         { dot: "#17c1e8", badge: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300", bar: "bg-cyan-500" },
  Physical:       { dot: "#FFB547", badge: "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-300", bar: "bg-yellow-500" },
  Technological:  { dot: "#01B574", badge: "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-300", bar: "bg-green-500" },
};

const TYPE_OPTIONS = [
  { value: "document",      label: "Document" },
  { value: "evidence_note", label: "Evidence / Activity Note" },
];

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function getRemainingControls(all, existing) {
  const s = new Set((existing || []).map((r) => r.control));
  return all.filter((c) => !s.has(c.control));
}

/* ─── Applicability badge ─── */
function ApplicabilityBadge({ value }) {
  const v = (value || "").toLowerCase();
  const styles = {
    yes: "bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/20",
    no: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20",
    conditional: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/20",
    "clarification needed": "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${styles[v] || "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>
      {value || "—"}
    </span>
  );
}

/* ─── Save modal ─── */
function SaveSoAModal({ open, onClose, onSave, saving }) {
  const [businessName, setBusinessName] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
            <MdOutlineSave className="text-lg" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">Save SoA</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Give this SoA a business name</p>
          </div>
        </div>

        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && businessName.trim() && onSave(businessName)}
          placeholder="e.g. RetailCo HR Department"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-900 dark:text-white dark:placeholder-gray-500"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5"
            type="button"
          >
            <MdOutlineClose className="text-base" /> Cancel
          </button>
          <button
            onClick={() => onSave(businessName)}
            disabled={saving || !businessName.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-brand-600 disabled:opacity-50"
            type="button"
          >
            <MdOutlineCheck className="text-base" />
            {saving ? "Saving…" : "Save SoA"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Structured actionable editor row ─── */
function ActionableEditorRow({ item, index, onChange, onRemove }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-navy-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Action #{index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <MdOutlineClose className="text-sm" />
        </button>
      </div>
      <textarea
        rows={2}
        value={item.text}
        onChange={(e) => onChange({ ...item, text: e.target.value })}
        placeholder="Describe the required action or evidence…"
        className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:placeholder-gray-500"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Type</label>
          <select
            value={item.type}
            onChange={(e) => onChange({ ...item, type: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-navy-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
          >
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Upload Required</label>
          <select
            value={item.upload_required ? "yes" : "no"}
            onChange={(e) => onChange({ ...item, upload_required: e.target.value === "yes" })}
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-navy-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
          >
            <option value="yes">Yes — upload required</option>
            <option value="no">No — activity note only</option>
          </select>
        </div>
      </div>
    </div>
  );
}

/* ─── Domain section header ─── */
function DomainSectionHeader({ domain, count, isOpen, onToggle }) {
  const style = DOMAIN_STYLE[domain] || { dot: "#A3AED0", badge: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400", bar: "bg-gray-400" };
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-left transition hover:border-gray-300 hover:bg-gray-50/50 dark:border-white/10 dark:bg-navy-800 dark:hover:bg-white/[0.03]"
    >
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: style.dot }} />
        <span className="text-sm font-bold text-navy-700 dark:text-white">{domain}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style.badge}`}>
          {count} control{count !== 1 ? "s" : ""}
        </span>
      </div>
      {isOpen
        ? <MdKeyboardArrowUp className="text-lg text-gray-400 transition group-hover:text-brand-500" />
        : <MdKeyboardArrowDown className="text-lg text-gray-400 transition group-hover:text-brand-500" />
      }
    </button>
  );
}

/* ─── Summary stat card ─── */
function SummaryCard({ label, value, icon, tone = "default" }) {
  const styles = {
    default:       { card: "bg-lightPrimary dark:bg-white/5", num: "text-navy-700 dark:text-white", label: "text-gray-500 dark:text-gray-400", icon: "bg-white dark:bg-white/10 text-navy-700 dark:text-white" },
    yes:           { card: "bg-green-50 dark:bg-green-500/10", num: "text-green-700 dark:text-green-300", label: "text-green-600/80 dark:text-green-400/80", icon: "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-300" },
    conditional:   { card: "bg-yellow-50 dark:bg-yellow-500/10", num: "text-yellow-700 dark:text-yellow-300", label: "text-yellow-600/80 dark:text-yellow-400/80", icon: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-300" },
    clarification: { card: "bg-cyan-50 dark:bg-cyan-500/10", num: "text-cyan-700 dark:text-cyan-300", label: "text-cyan-600/80 dark:text-cyan-400/80", icon: "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-300" },
    no:            { card: "bg-red-50 dark:bg-red-500/10", num: "text-red-700 dark:text-red-300", label: "text-red-600/80 dark:text-red-400/80", icon: "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300" },
  };
  const s = styles[tone] || styles.default;
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-4 ${s.card}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${s.icon}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-bold ${s.num}`}>{value}</div>
        <div className={`text-[11px] font-semibold uppercase tracking-wide ${s.label}`}>{label}</div>
      </div>
    </div>
  );
}

/* ─── Progress bar ─── */
function ProgressBar({ percent, failed }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
      <div
        className={`h-full rounded-full transition-all duration-500 ${failed ? "bg-red-500" : "bg-gradient-to-r from-brand-500 to-cyan-400"}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════ */
export default function SoALiteGenerator() {
  const [businessText, setBusinessText] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const [clarifyRowId, setClarifyRowId] = useState(null);
  const [clarificationInput, setClarificationInput] = useState("");
  const [clarifyLoading, setClarifyLoading] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [savingSoA, setSavingSoA] = useState(false);

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("lite");
  const [domainFilter, setDomainFilter] = useState("All");
  const [applicabilityFilter, setApplicabilityFilter] = useState("All");
  const [clarificationOnly, setClarificationOnly] = useState(false);
  const [openGroups, setOpenGroups] = useState({ Organizational: true, People: true, Physical: true, Technological: true });

  const [batchProgress, setBatchProgress] = useState({
    active: false, current: 0, total: 0, percent: 0, message: "", failed: false,
  });

  /* ── Derived state ── */
  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const blob = `${r.standard} ${r.domain} ${r.clause} ${r.control} ${r.title} ${r.applicability} ${r.justification} ${(r.actionables||[]).map((a) => typeof a === "string" ? a : a?.text||"").join(" ")} ${r.clarification_question||""}`.toLowerCase();
      return (
        (!s || blob.includes(s)) &&
        (domainFilter === "All" || r.domain === domainFilter) &&
        (applicabilityFilter === "All" || r.applicability === applicabilityFilter) &&
        (!clarificationOnly || r.applicability === "Clarification Needed")
      );
    });
  }, [rows, search, domainFilter, applicabilityFilter, clarificationOnly]);

  const summary = useMemo(() =>
    filteredRows.reduce((acc, r) => {
      acc.total++;
      if (r.applicability === "Yes") acc.yes++;
      else if (r.applicability === "Conditional") acc.conditional++;
      else if (r.applicability === "Clarification Needed") acc.clarification++;
      else if (r.applicability === "No") acc.no++;
      return acc;
    }, { total: 0, yes: 0, conditional: 0, clarification: 0, no: 0 }),
  [filteredRows]);

  const groupedRows = useMemo(() => {
    const g = {};
    DOMAIN_ORDER.forEach((d) => { g[d] = []; });
    filteredRows.forEach((r) => {
      const k = DOMAIN_ORDER.includes(r.domain) ? r.domain : "Other";
      if (!g[k]) g[k] = [];
      g[k].push(r);
    });
    return g;
  }, [filteredRows]);

  const visibleDomains = useMemo(() => {
    const ordered = DOMAIN_ORDER.filter((d) => (groupedRows[d]||[]).length > 0);
    const others = Object.keys(groupedRows).filter((d) => !DOMAIN_ORDER.includes(d) && (groupedRows[d]||[]).length > 0);
    return [...ordered, ...others];
  }, [groupedRows]);

  /* ── Helpers ── */
  const toggleGroup = (d) => setOpenGroups((p) => ({ ...p, [d]: !p[d] }));

  const normalizeUiRows = (output) =>
    output.map((r) => ({
      id: `soa_${r.control}`,
      ...r,
      actionables: Array.isArray(r.actionables)
        ? r.actionables.map((a) => ({
            text: String(a?.text||"").trim(),
            type: a?.type === "document" ? "document" : "evidence_note",
            upload_required: Boolean(a?.upload_required),
            uploadedFileName: "",
            selectedFile: null,
          }))
        : [],
    }));

  const rebuildGroupState = (nextRows) => {
    const g = {};
    DOMAIN_ORDER.forEach((d) => { g[d] = true; });
    new Set(nextRows.map((r) => r.domain).filter(Boolean)).forEach((d) => { g[d] = true; });
    setOpenGroups(g);
  };

  /* ── Generation ── */
  const runFullGeneration = async ({ freshStart }) => {
    setError(""); setSuccess("");
    if (!businessText.trim()) { setError("Please enter a business function."); return; }
    setLoading(true);
    try {
      if (mode !== "full") {
        const res = await axios.post(`${API_BASE}/api/soa-lite/generate`, { businessText, mode });
        const normalized = normalizeUiRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
        setRows(normalized);
        rebuildGroupState(normalized);
        setBatchProgress({ active: false, current: 0, total: 0, percent: 0, message: "", failed: false });
        return;
      }

      const baseRows = freshStart ? [] : rows;
      const controlsToRun = freshStart ? ISO27001_CONTROLS : getRemainingControls(ISO27001_CONTROLS, rows);

      if (!controlsToRun.length) {
        setSuccess("All controls are already generated.");
        setBatchProgress({ active: true, current: 0, total: 0, percent: 100, message: "Nothing remaining.", failed: false });
        return;
      }

      if (freshStart) setRows([]);
      const batches = chunkArray(controlsToRun, 8);
      let accumulated = [...baseRows];

      setBatchProgress({ active: true, current: 0, total: batches.length, percent: 0, message: `Starting (0/${batches.length} batches)…`, failed: false });

      for (let i = 0; i < batches.length; i++) {
        setBatchProgress({ active: true, current: i, total: batches.length, percent: Math.round((i / batches.length) * 100), message: `Batch ${i + 1} of ${batches.length}…`, failed: false });
        try {
          const res = await axios.post(`${API_BASE}/api/soa-lite/generate-batch`, { businessText, controlsBatch: batches[i] });
          accumulated = [...accumulated, ...normalizeUiRows(Array.isArray(res.data?.rows) ? res.data.rows : [])];
          setRows(accumulated);
          rebuildGroupState(accumulated);
          setBatchProgress({ active: true, current: i + 1, total: batches.length, percent: Math.round(((i + 1) / batches.length) * 100), message: `Completed ${i + 1} of ${batches.length} batches.`, failed: false });
          if (i < batches.length - 1) await sleep(5000);
        } catch (batchErr) {
          const msg = batchErr?.response?.data?.details || batchErr?.response?.data?.error || batchErr?.message || "Batch failed.";
          setBatchProgress({ active: true, current: i, total: batches.length, percent: Math.round((i / batches.length) * 100), message: `Stopped at batch ${i + 1}.`, failed: true });
          setError(msg);
          if (accumulated.length) setSuccess(`${accumulated.length} rows generated. Use "Generate Remaining" to continue.`);
          return;
        }
      }

      setBatchProgress({ active: true, current: batches.length, total: batches.length, percent: 100, message: freshStart ? "Full generation complete." : "Remaining controls generated.", failed: false });
      setSuccess(freshStart ? "Full SoA generated successfully." : "Remaining controls generated.");
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || e?.message || "Failed to generate SoA.");
    } finally {
      setLoading(false);
    }
  };

  const generateFresh     = () => runFullGeneration({ freshStart: true });
  const generateRemaining = () => runFullGeneration({ freshStart: false });

  /* ── Save ── */
  const saveCurrentSoA = async (businessName, overwrite = false) => {
    setError(""); setSuccess("");
    if (!businessName?.trim()) { setError("Business name is required."); return; }
    if (!rows.length) { setError("Generate SoA first."); return; }
    setSavingSoA(true);
    try {
      const res = await axios.post(`${API_BASE}/api/soa-records`, { businessName, businessText, rows, overwrite });
      setSaveOpen(false);
      setSuccess(`SoA ${overwrite ? "overwritten" : "saved"} for "${businessName}" (${res.data?.saved_row_count || rows.length} rows).`);
    } catch (e) {
      if (e?.response?.status === 409) {
        const ok = window.confirm(`"${businessName}" already exists. Overwrite?`);
        if (ok) { setSavingSoA(false); return saveCurrentSoA(businessName, true); }
      }
      setError(e?.response?.data?.details || e?.response?.data?.error || "Failed to save SoA.");
    } finally {
      setSavingSoA(false);
    }
  };

  /* ── Row edit (structured actionables) ── */
  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft({
      ...row,
      actionablesList: (row.actionables || []).map((a) => ({
        text: a.text,
        type: a.type || "evidence_note",
        upload_required: !!a.upload_required,
      })),
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };
  const saveEdit = () => {
    if (!editDraft) return;
    setRows((prev) => prev.map((r) => r.id === editingId
      ? { ...editDraft, actionables: (editDraft.actionablesList || []).filter((a) => a.text).map(({ text, type, upload_required }) => ({ text, type, upload_required, uploadedFileName: "", selectedFile: null })) }
      : r
    ));
    setEditingId(null); setEditDraft(null);
  };

  /* ── Re-evaluate ── */
  const reEvaluateRow = async (row) => {
    if (!clarificationInput.trim()) { setError("Please enter clarification for this row."); return; }
    setClarifyLoading(true); setError("");
    try {
      const res = await axios.post(`${API_BASE}/api/soa-lite/re-evaluate-row`, {
        businessText,
        row: { standard: row.standard, domain: row.domain, clause: row.clause, control: row.control, title: row.title },
        clarification: clarificationInput,
      });
      const updated = res.data?.row;
      if (!updated) throw new Error("No row returned");
      setRows((prev) => prev.map((r) => r.id === row.id
        ? { ...r, ...updated, actionables: Array.isArray(updated.actionables) ? updated.actionables.map((a) => ({ text: String(a?.text||"").trim(), type: a?.type === "document" ? "document" : "evidence_note", upload_required: Boolean(a?.upload_required), uploadedFileName: "", selectedFile: null })) : [] }
        : r
      ));
      setClarifyRowId(null); setClarificationInput("");
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to re-evaluate row.");
    } finally {
      setClarifyLoading(false);
    }
  };

  const resetFilters = () => { setSearch(""); setDomainFilter("All"); setApplicabilityFilter("All"); setClarificationOnly(false); };
  const hasFilters = search || domainFilter !== "All" || applicabilityFilter !== "All" || clarificationOnly;

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <div className="mt-5 space-y-5">
      <SaveSoAModal open={saveOpen} onClose={() => setSaveOpen(false)} onSave={saveCurrentSoA} saving={savingSoA} />

      {/* ── Input card ── */}
      <Card className="rounded-[20px] p-6 dark:bg-navy-800">
        {/* Header row */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
              <MdOutlineShield className="text-xl" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-navy-700 dark:text-white">SoA Generator</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Generate ISO 27001:2022 controls in lite or full mode, review, and save.
              </p>
            </div>
          </div>

          {/* Mode + actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Mode toggle */}
            <div className="flex overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
              {[
                { v: "lite", label: "Lite", sub: "~8" },
                { v: "full", label: "Full", sub: "93" },
              ].map(({ v, label, sub }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMode(v)}
                  className={`flex items-center gap-1 px-4 py-2 text-sm font-semibold transition-colors ${
                    mode === v
                      ? "bg-brand-500 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-navy-800 dark:text-gray-400 dark:hover:bg-white/5"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-1.5 text-[10px] font-bold ${mode === v ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"}`}>
                    {sub}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={generateFresh}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-brand-600 disabled:opacity-60"
              type="button"
            >
              {loading
                ? <><MdOutlineRefresh className="animate-spin text-base" />Generating…</>
                : <><MdOutlineAutoAwesome className="text-base" />Generate Fresh</>
              }
            </button>

            {mode === "full" && (
              <button
                onClick={generateRemaining}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                type="button"
              >
                <MdOutlineRefresh className="text-base" />
                Remaining
              </button>
            )}

            <button
              onClick={() => setSaveOpen(true)}
              disabled={!rows.length}
              className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-100 disabled:opacity-40 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
              type="button"
            >
              <MdOutlineSave className="text-base" />
              Save SoA
            </button>
          </div>
        </div>

        {/* Business text input */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white">
            Business Function Description
          </label>
          <textarea
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-900 dark:text-white dark:placeholder-gray-500"
            rows={6}
            placeholder="Describe the business function — systems used, data handled, users, cloud/on-prem setup, access model, vendors, backups, incidents, logs, etc."
            value={businessText}
            onChange={(e) => setBusinessText(e.target.value)}
          />
          <p className="mt-1 text-right text-xs text-gray-400 dark:text-gray-500">
            {businessText.trim().split(/\s+/).filter(Boolean).length} words
          </p>
        </div>

        {/* Batch progress */}
        {batchProgress.active && mode === "full" && (
          <div className={`mt-4 rounded-2xl border p-4 ${batchProgress.failed ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10" : "border-brand-200 bg-brand-50 dark:border-brand-500/20 dark:bg-brand-500/10"}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-navy-700 dark:text-white">
                {batchProgress.failed ? "Generation stopped" : loading ? "Generating…" : "Generation complete"}
              </span>
              <span className={`text-sm font-bold ${batchProgress.failed ? "text-red-500" : "text-brand-500"}`}>
                {batchProgress.percent}%
              </span>
            </div>
            <ProgressBar percent={batchProgress.percent} failed={batchProgress.failed} />
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{batchProgress.message}</span>
              <span className="font-semibold">{batchProgress.current}/{batchProgress.total} batches</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <HiExclamationCircle className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
            <HiCheckCircle className="mt-0.5 shrink-0" />
            {success}
          </div>
        )}
      </Card>

      {/* ── Results card ── */}
      <Card className="rounded-[20px] p-6 dark:bg-navy-800">

        {/* Summary stat cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard label="Total"    value={summary.total}         icon={<MdOutlineShield />}        tone="default" />
          <SummaryCard label="Yes"      value={summary.yes}           icon={<HiCheckCircle />}          tone="yes" />
          <SummaryCard label="Conditional" value={summary.conditional} icon={<MdOutlineDescription />}  tone="conditional" />
          <SummaryCard label="Clarify"  value={summary.clarification} icon={<MdOutlineQuestionAnswer />} tone="clarification" />
          <SummaryCard label="No"       value={summary.no}            icon={<HiExclamationCircle />}    tone="no" />
        </div>

        {/* Search + filters */}
        <div className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/5 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-navy-700 dark:text-white">
                SoA Controls
                <span className="ml-2 text-sm font-normal text-gray-400 dark:text-gray-500">
                  ({filteredRows.length}/{rows.length} shown)
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Human-in-the-loop — review, edit, or clarify individual rows
              </p>
            </div>
            <div className="relative w-full max-w-xs">
              <MdOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search control / title…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MdOutlineFilterList className="text-lg text-gray-400" />

            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
            >
              <option value="All">All Domains</option>
              {DOMAIN_ORDER.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            <select
              value={applicabilityFilter}
              onChange={(e) => setApplicabilityFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
            >
              <option value="All">All Applicability</option>
              {APPLICABILITY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-white">
              <input
                type="checkbox"
                checked={clarificationOnly}
                onChange={(e) => setClarificationOnly(e.target.checked)}
                className="accent-brand-500"
              />
              Clarification only
            </label>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-500 transition hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5"
              >
                <MdOutlineClose className="text-sm" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {visibleDomains.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-lightPrimary dark:bg-white/5">
              <MdOutlineShield className="text-3xl text-gray-300 dark:text-gray-600" />
            </div>
            <p className="font-semibold text-gray-500 dark:text-gray-400">No controls yet</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              Enter a business function above and click Generate Fresh.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleDomains.map((domain) => {
              const domainRows = groupedRows[domain] || [];
              const isOpen = openGroups[domain] !== false;
              const style = DOMAIN_STYLE[domain] || { bar: "bg-gray-400" };

              return (
                <div key={domain}>
                  <DomainSectionHeader
                    domain={domain}
                    count={domainRows.length}
                    isOpen={isOpen}
                    onToggle={() => toggleGroup(domain)}
                  />

                  {isOpen && (
                    <div className="mt-2 overflow-hidden rounded-2xl border border-gray-100 dark:border-white/10">
                      <div className={`h-1 w-full ${style.bar}`} />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1700px] border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-white/10 dark:bg-white/[0.02]">
                              {["Standard","Domain","Clause","Control","Title","Applicability","Justification","Actionables","Clarification",""].map((h) => (
                                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {domainRows.map((r) => {
                              const isEditing  = editingId === r.id;
                              const d          = isEditing ? editDraft : r;
                              const isClarifying = clarifyRowId === r.id;
                              const needsClarify = r.applicability === "Clarification Needed";

                              return (
                                <tr
                                  key={r.id}
                                  className={`group border-b border-gray-50 align-top transition-colors last:border-0 dark:border-white/5 ${
                                    isEditing
                                      ? "bg-brand-50/40 dark:bg-brand-500/[0.04]"
                                      : needsClarify
                                      ? "bg-cyan-50/30 dark:bg-cyan-500/[0.03]"
                                      : "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                                  }`}
                                >
                                  {/* Standard */}
                                  <td className="px-4 py-3.5 text-xs font-medium text-gray-700 dark:text-gray-300">{r.standard}</td>

                                  {/* Domain badge */}
                                  <td className="px-4 py-3.5">
                                    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${(DOMAIN_STYLE[r.domain]||{badge:"bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"}).badge}`}>
                                      {r.domain}
                                    </span>
                                  </td>

                                  {/* Clause */}
                                  <td className="px-4 py-3.5 text-sm font-mono font-semibold text-gray-700 dark:text-gray-300">{r.clause}</td>

                                  {/* Control */}
                                  <td className="px-4 py-3.5 text-sm font-bold text-navy-700 dark:text-white">{r.control}</td>

                                  {/* Title */}
                                  <td className="min-w-[180px] px-4 py-3.5 text-sm font-medium text-gray-800 dark:text-gray-200">{r.title}</td>

                                  {/* Applicability */}
                                  <td className="px-4 py-3.5">
                                    {isEditing ? (
                                      <select
                                        value={d.applicability}
                                        onChange={(e) => setEditDraft((p) => ({ ...p, applicability: e.target.value }))}
                                        className="w-full min-w-[155px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-navy-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                                      >
                                        {APPLICABILITY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                                      </select>
                                    ) : (
                                      <ApplicabilityBadge value={r.applicability} />
                                    )}
                                  </td>

                                  {/* Justification */}
                                  <td className="min-w-[240px] px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200">
                                    {isEditing ? (
                                      <textarea
                                        rows={4}
                                        value={d.justification}
                                        onChange={(e) => setEditDraft((p) => ({ ...p, justification: e.target.value }))}
                                        className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                                      />
                                    ) : (
                                      <span className="leading-relaxed">{r.justification || "—"}</span>
                                    )}
                                  </td>

                                  {/* Actionables */}
                                  <td className="min-w-[360px] px-4 py-3.5">
                                    {isEditing ? (
                                      <div className="space-y-2">
                                        {(d.actionablesList || []).map((item, idx) => (
                                          <ActionableEditorRow
                                            key={idx}
                                            item={item}
                                            index={idx}
                                            onChange={(updated) =>
                                              setEditDraft((p) => ({ ...p, actionablesList: p.actionablesList.map((a, i) => i === idx ? updated : a) }))
                                            }
                                            onRemove={() =>
                                              setEditDraft((p) => ({ ...p, actionablesList: p.actionablesList.filter((_, i) => i !== idx) }))
                                            }
                                          />
                                        ))}
                                        <button
                                          type="button"
                                          onClick={() => setEditDraft((p) => ({ ...p, actionablesList: [...(p.actionablesList||[]), { text: "", type: "evidence_note", upload_required: false }] }))}
                                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-400 transition hover:border-brand-400 hover:text-brand-500 dark:border-white/20 dark:text-gray-500 dark:hover:border-brand-400 dark:hover:text-brand-400"
                                        >
                                          <MdOutlineAdd /> Add action
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {(r.actionables || []).map((a, idx) => (
                                          <div key={idx} className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                                            <div className="mb-1.5 flex items-center gap-1.5">
                                              {a.type === "document" ? (
                                                <span className="flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-500 dark:bg-brand-500/10 dark:text-brand-300">
                                                  <HiDocumentText className="text-xs" />Doc
                                                </span>
                                              ) : (
                                                <span className="flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-white/5 dark:text-gray-400">
                                                  <HiClipboardDocumentCheck className="text-xs" />Note
                                                </span>
                                              )}
                                              {a.upload_required && (
                                                <span className="rounded-md bg-yellow-50 px-1.5 py-0.5 text-[10px] font-bold text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-300">
                                                  Upload req.
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-xs leading-snug text-gray-800 dark:text-gray-200">{a.text}</p>
                                          </div>
                                        ))}
                                        {(!r.actionables || r.actionables.length === 0) && (
                                          <span className="text-xs text-gray-400">None</span>
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  {/* Clarification */}
                                  <td className="min-w-[260px] px-4 py-3.5">
                                    {needsClarify ? (
                                      <div className="space-y-2">
                                        <div className="flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-2.5 dark:border-cyan-500/20 dark:bg-cyan-500/[0.07]">
                                          <MdOutlineQuestionAnswer className="mt-0.5 shrink-0 text-sm text-cyan-500" />
                                          <p className="text-xs leading-snug text-cyan-800 dark:text-cyan-200">
                                            {r.clarification_question || "Please provide clarification."}
                                          </p>
                                        </div>
                                        {!isClarifying ? (
                                          <button
                                            onClick={() => { setClarifyRowId(r.id); setClarificationInput(""); }}
                                            className="flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600"
                                            type="button"
                                          >
                                            <MdOutlineQuestionAnswer className="text-sm" />
                                            Give Clarification
                                          </button>
                                        ) : (
                                          <div className="space-y-2">
                                            <textarea
                                              rows={3}
                                              value={clarificationInput}
                                              onChange={(e) => setClarificationInput(e.target.value)}
                                              placeholder="Your clarification for this control…"
                                              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-navy-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                                            />
                                            <div className="flex gap-1.5">
                                              <button
                                                onClick={() => reEvaluateRow(r)}
                                                disabled={clarifyLoading}
                                                className="flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
                                                type="button"
                                              >
                                                {clarifyLoading ? "…" : <><MdOutlineRefresh className="text-xs" />Re-evaluate</>}
                                              </button>
                                              <button
                                                onClick={() => { setClarifyRowId(null); setClarificationInput(""); }}
                                                className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-400"
                                                type="button"
                                              >
                                                <MdOutlineClose className="text-xs" />Cancel
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600 dark:bg-green-500/10 dark:text-green-400">
                                        <HiCheckCircle className="text-xs" /> None needed
                                      </span>
                                    )}
                                  </td>

                                  {/* Edit / Save / Cancel */}
                                  <td className="min-w-[100px] px-4 py-3.5">
                                    {!isEditing ? (
                                      <button
                                        onClick={() => startEdit(r)}
                                        className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-500 dark:border-white/10 dark:text-white dark:hover:border-brand-400"
                                        type="button"
                                      >
                                        <MdOutlineEdit className="text-sm" /> Edit
                                      </button>
                                    ) : (
                                      <div className="flex flex-col gap-1.5">
                                        <button
                                          onClick={saveEdit}
                                          className="flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-brand-600"
                                          type="button"
                                        >
                                          <MdOutlineCheck className="text-sm" /> Save
                                        </button>
                                        <button
                                          onClick={cancelEdit}
                                          className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-400"
                                          type="button"
                                        >
                                          <MdOutlineClose className="text-sm" /> Cancel
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

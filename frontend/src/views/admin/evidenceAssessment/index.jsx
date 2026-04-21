import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import Card from "components/card";
import {
  MdOutlineDescription,
  MdOutlineLink,
  MdOutlineCheckCircle,
  MdOutlineWarningAmber,
  MdOutlineCancel,
  MdOutlineRemoveCircle,
  MdEdit,
  MdClose,
  MdPlayArrow,
  MdSave,
  MdRefresh,
  MdOutlineFolder,
  MdOutlineInsertDriveFile,
  MdOutlineUploadFile,
  MdOutlineAssignment,
  MdOutlinePendingActions,
  MdOutlineErrorOutline,
} from "react-icons/md";

const API_BASE = "http://localhost:5001";

const STATUS_OPTIONS = ["Adequate", "Partially Adequate", "Inadequate", "Not Relevant"];

// ── Inject animation keyframes once ─────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("ea-keyframes")) {
  const s = document.createElement("style");
  s.id = "ea-keyframes";
  s.textContent = `
    @keyframes eaModalIn  { from { opacity:0; transform:scale(0.96) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes eaFadeIn   { from { opacity:0; } to { opacity:1; } }
    @keyframes eaSlideDown{ from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(s);
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  "Adequate":           { badge: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",   border: "border-l-green-500",  icon: MdOutlineCheckCircle,  dot: "bg-green-500" },
  "Partially Adequate": { badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",   border: "border-l-amber-500",  icon: MdOutlineWarningAmber, dot: "bg-amber-500" },
  "Inadequate":         { badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",           border: "border-l-red-500",    icon: MdOutlineCancel,       dot: "bg-red-500" },
  "Not Relevant":       { badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",       border: "border-l-blue-400",   icon: MdOutlineRemoveCircle, dot: "bg-blue-400" },
  saved:                { badge: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",   border: "border-l-green-500",  icon: MdOutlineCheckCircle,  dot: "bg-green-500" },
  draft:                { badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",   border: "border-l-amber-500",  icon: MdOutlineWarningAmber, dot: "bg-amber-500" },
};

const CONFIDENCE_CFG = {
  high:   "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  low:    "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

const INPUT_CLS =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-navy-700 outline-none focus:border-brand-400 focus:bg-white transition dark:border-white/10 dark:bg-navy-900 dark:text-white dark:focus:bg-navy-800";
const LABEL_CLS = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

function StatusBadge({ value }) {
  const cfg = STATUS_CFG[value] || { badge: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}>
      {value}
    </span>
  );
}

function ConfidenceBadge({ value }) {
  if (!value) return null;
  const key = value.toLowerCase();
  const cls = CONFIDENCE_CFG[key] || "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {value} confidence
    </span>
  );
}

function ControlPill({ control, title }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
      {control}{title ? ` · ${title}` : ""}
    </span>
  );
}

function EmptyState({ title, subtitle, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
      <p className="font-semibold text-navy-700 dark:text-white">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        style={{ animation: "eaFadeIn 0.15s ease both" }}
        onClick={onClose}
      />
      <div
        style={{ animation: "eaModalIn 0.18s cubic-bezier(0.16,1,0.3,1) both" }}
        className="relative z-10 w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-navy-800"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 dark:border-white/10 dark:bg-navy-800">
          <h3 className="text-base font-bold text-navy-700 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 transition"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Business-level stats panel ────────────────────────────────────────────
function BusinessStats({ stats, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 animate-pulse">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-white/5" />
        ))}
      </div>
    );
  }
  if (!stats) return null;

  const totalCtrl = stats.adequate + stats.partially_adequate + stats.inadequate + stats.not_relevant;
  const coveragePct = stats.upload_required
    ? Math.round((stats.files_uploaded / stats.upload_required) * 100)
    : 100;

  const tiles = [
    {
      label: "Files Uploaded",
      value: stats.total_files,
      icon: MdOutlineUploadFile,
      color: "text-brand-500",
      bg: "bg-brand-50 dark:bg-brand-500/10",
      border: "border-l-brand-500",
    },
    {
      label: "Assessed",
      value: stats.assessed_files,
      icon: MdOutlineAssignment,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-500/10",
      border: "border-l-green-500",
    },
    {
      label: "Not Assessed",
      value: stats.not_assessed_files,
      icon: MdOutlinePendingActions,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-500/10",
      border: "border-l-amber-400",
    },
    {
      label: "Missing Evidence",
      value: stats.files_missing,
      icon: MdOutlineErrorOutline,
      color: "text-red-500",
      bg: "bg-red-50 dark:bg-red-500/10",
      border: "border-l-red-500",
    },
    {
      label: "Adequate",
      value: stats.adequate,
      icon: MdOutlineCheckCircle,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-500/10",
      border: "border-l-green-500",
    },
    {
      label: "Partial",
      value: stats.partially_adequate,
      icon: MdOutlineWarningAmber,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-500/10",
      border: "border-l-amber-400",
    },
    {
      label: "Inadequate",
      value: stats.inadequate,
      icon: MdOutlineCancel,
      color: "text-red-500",
      bg: "bg-red-50 dark:bg-red-500/10",
      border: "border-l-red-500",
    },
  ];

  return (
    <Card className="rounded-2xl p-4 dark:bg-navy-800" style={{ animation: "eaSlideDown 0.2s ease both" }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Evidence Overview
        </p>
        <div className="flex items-center gap-2">
          {totalCtrl > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {totalCtrl} control{totalCtrl !== 1 ? "s" : ""} assessed
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              coveragePct === 100
                ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
                : coveragePct >= 50
                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
            }`}
          >
            {coveragePct}% coverage
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div
            key={label}
            className={`flex items-center gap-2.5 rounded-xl border-l-4 ${border} ${bg} px-3 py-3`}
          >
            <Icon className={`h-5 w-5 flex-shrink-0 ${color}`} />
            <div className="min-w-0">
              <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Assessment summary stats ───────────────────────────────────────────────
function AssessmentStats({ controls }) {
  const counts = useMemo(() => {
    const c = { Adequate: 0, "Partially Adequate": 0, Inadequate: 0, "Not Relevant": 0 };
    (controls || []).forEach((x) => { if (c[x.assessment_status] !== undefined) c[x.assessment_status]++; });
    return c;
  }, [controls]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STATUS_OPTIONS.map((s) => {
        const cfg = STATUS_CFG[s];
        const Icon = cfg.icon;
        return (
          <div key={s} className={`flex items-center gap-2 rounded-xl border-l-4 ${cfg.border} bg-white px-3 py-2.5 dark:bg-navy-900`}>
            <Icon className={`h-5 w-5 flex-shrink-0 ${cfg.badge.split(" ").find(c => c.startsWith("text-"))}`} />
            <div>
              <p className="text-lg font-bold text-navy-700 dark:text-white">{counts[s]}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{s}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Edit form content (inside modal) ──────────────────────────────────────────
function EditControlForm({ draft, setEditDraft, saving, onSave, onCancel }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={LABEL_CLS}>Status</label>
        <select
          value={draft.assessment_status}
          onChange={(e) => setEditDraft((p) => ({ ...p, assessment_status: e.target.value }))}
          className={INPUT_CLS}
        >
          {STATUS_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Findings</label>
        <textarea
          rows={3}
          value={draft.findings || ""}
          onChange={(e) => setEditDraft((p) => ({ ...p, findings: e.target.value }))}
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Document Quality Findings</label>
        <textarea
          rows={3}
          value={draft.document_quality_findings || ""}
          onChange={(e) => setEditDraft((p) => ({ ...p, document_quality_findings: e.target.value }))}
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Missing Elements <span className="normal-case font-normal">(one per line)</span></label>
        <textarea
          rows={4}
          value={draft.missing_elements_text || ""}
          onChange={(e) => setEditDraft((p) => ({ ...p, missing_elements_text: e.target.value }))}
          placeholder="Each line becomes a separate element..."
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Recommendations <span className="normal-case font-normal">(one per line)</span></label>
        <textarea
          rows={4}
          value={draft.recommendations_text || ""}
          onChange={(e) => setEditDraft((p) => ({ ...p, recommendations_text: e.target.value }))}
          placeholder="Each line becomes a separate recommendation..."
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Confidence</label>
        <input
          value={draft.confidence || ""}
          onChange={(e) => setEditDraft((p) => ({ ...p, confidence: e.target.value }))}
          placeholder="e.g. High, Medium, Low"
          className={INPUT_CLS}
        />
      </div>

      <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-white/10">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition"
        >
          <MdSave className="h-4 w-4" />
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EvidenceAssessment() {
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [files, setFiles] = useState([]);
  const [selectedFileHash, setSelectedFileHash] = useState("");
  const [selectedFileGroup, setSelectedFileGroup] = useState(null);

  const [assessment, setAssessment] = useState(null);
  const [editingControlId, setEditingControlId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const [businessStats, setBusinessStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [runningAssessment, setRunningAssessment] = useState(false);
  const [savingControl, setSavingControl] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { loadBusinesses(); }, []);

  useEffect(() => {
    if (!selectedBusinessId) {
      setFiles([]); setSelectedFileHash(""); setSelectedFileGroup(null);
      setAssessment(null); setEditingControlId(null); setEditDraft(null);
      setBusinessStats(null);
      return;
    }
    loadFilesForBusiness(selectedBusinessId);
    loadStats(selectedBusinessId);
  }, [selectedBusinessId]);

  const loadStats = async (businessId) => {
    setLoadingStats(true);
    try {
      const res = await axios.get(`${API_BASE}/api/evidence-assessment/business/${businessId}/stats`);
      setBusinessStats(res.data);
    } catch { setBusinessStats(null); }
    finally { setLoadingStats(false); }
  };

  useEffect(() => {
    if (!selectedFileHash) {
      setSelectedFileGroup(null);
      setAssessment(null);
      setEditingControlId(null);
      setEditDraft(null);
      return;
    }
  
    const group =
      files.find(
        (f) => String(f.file_hash || f.files?.[0]?.stored_name) === String(selectedFileHash)
      ) || null;
  
    setSelectedFileGroup(group);
    setEditingControlId(null);
    setEditDraft(null);
  
    if (group?.assessment_id) {
      loadSavedAssessment(group.assessment_id);
    } else {
      setAssessment(null);
    }
  }, [selectedFileHash, files]);

  const loadBusinesses = async () => {
    setLoadingBusinesses(true); setError("");
    try {
      const res = await axios.get(`${API_BASE}/api/evidence-assessment/businesses`);
      setBusinesses(res.data?.businesses || []);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load businesses.");
    } finally { setLoadingBusinesses(false); }
  };

  const loadFilesForBusiness = async (businessId) => {
    setLoadingFiles(true); setError(""); setSuccess("");
    setAssessment(null); setEditingControlId(null); setEditDraft(null);
    try {
      const res = await axios.get(`${API_BASE}/api/evidence-assessment/business/${businessId}/files`);
      const nextFiles = res.data?.files || [];
      setFiles(nextFiles);
      if (nextFiles.length > 0) {
        setSelectedFileHash(nextFiles[0].file_hash || nextFiles[0].files?.[0]?.stored_name || "");
      } else { setSelectedFileHash(""); }
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load evidence files.");
    } finally { setLoadingFiles(false); }
  };

  const loadSavedAssessment = async (assessmentId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/evidence-assessment/${assessmentId}`);
      setAssessment(res.data);
    } catch (e) {
      console.error(e);
      setAssessment(null);
    }
  };

  const runAssessment = async () => {
    if (!selectedBusinessId || !selectedFileHash) { setError("Please select a business and a file."); return; }
    setRunningAssessment(true); setError(""); setSuccess("");
    try {
      const res = await axios.post(`${API_BASE}/api/evidence-assessment/run`, {
        soaRecordId: Number(selectedBusinessId),
        fileHash: selectedFileHash,
      });
      setAssessment(res.data);
      setSuccess("Assessment completed successfully.");
      loadStats(selectedBusinessId);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to run evidence assessment.");
    } finally { setRunningAssessment(false); }
  };

  const startEditControl = (ctrl) => {
    setEditingControlId(ctrl.id);
    setEditDraft({
      ...ctrl,
      missing_elements_text: Array.isArray(ctrl.missing_elements) ? ctrl.missing_elements.join("\n") : "",
      recommendations_text: Array.isArray(ctrl.recommendations) ? ctrl.recommendations.join("\n") : "",
    });
  };

  const cancelEditControl = () => { setEditingControlId(null); setEditDraft(null); };

  const saveControlEdit = async () => {
    if (!editDraft) return;
    setSavingControl(true); setError(""); setSuccess("");
    try {
      const payload = {
        assessment_status: editDraft.assessment_status,
        findings: editDraft.findings,
        document_quality_findings: editDraft.document_quality_findings,
        missing_elements: String(editDraft.missing_elements_text || "").split("\n").map((x) => x.trim()).filter(Boolean),
        recommendations: String(editDraft.recommendations_text || "").split("\n").map((x) => x.trim()).filter(Boolean),
        confidence: editDraft.confidence,
        edited_after_save: true,
      };
      const res = await axios.patch(`${API_BASE}/api/evidence-assessment/controls/${editingControlId}`, payload);
      setAssessment((prev) => ({
        ...prev,
        controls: (prev.controls || []).map((c) => c.id === editingControlId ? { ...c, ...res.data } : c),
      }));
      setSuccess("Control updated.");
      cancelEditControl();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to update control.");
    } finally { setSavingControl(false); }
  };

  const saveOverallSummary = async () => {
    if (!assessment) return;
    try {
      const res = await axios.patch(`${API_BASE}/api/evidence-assessment/${assessment.id}`, {
        overall_summary: assessment.overall_summary || "",
        status: "saved",
      });
      setAssessment((prev) => ({ ...prev, ...res.data }));
      setSuccess("Assessment saved.");
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save assessment.");
    }
  };

  const canRun = selectedBusinessId && selectedFileHash && !runningAssessment;

  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Top control bar */}
      <Card className="rounded-2xl p-5 dark:bg-navy-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLS}>Business</label>
              <select
                value={selectedBusinessId}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
                disabled={loadingBusinesses}
                className={INPUT_CLS}
              >
                <option value="">Select business…</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.business_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Evidence File</label>
              <select
                value={selectedFileHash}
                onChange={(e) => setSelectedFileHash(e.target.value)}
                disabled={!files.length || loadingFiles}
                className={INPUT_CLS}
              >
                <option value="">Select file…</option>
                {files.map((f) => {
                  const key = f.file_hash || f.files?.[0]?.stored_name || "";
                  return <option key={key} value={key}>{f.display_name}</option>;
                })}
              </select>
            </div>
          </div>

          <button
            onClick={runAssessment}
            disabled={!canRun}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition whitespace-nowrap"
            type="button"
          >
            {runningAssessment ? (
              <>
                <MdRefresh className="h-5 w-5 animate-spin" />
                Assessing…
              </>
            ) : (
              <>
                <MdPlayArrow className="h-5 w-5" />
                {selectedFileGroup?.assessment_id ? "Re-run Assessment" : "Run Assessment"}
              </>
            )}
          </button>
        </div>
      </Card>

      {/* Business stats */}
      {selectedBusinessId && (
        <BusinessStats stats={businessStats} loading={loadingStats} />
      )}

      {/* Alerts */}
      {error && (
        <div style={{ animation: "eaSlideDown 0.2s ease both" }} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div style={{ animation: "eaSlideDown 0.2s ease both" }} className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
          {success}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">

        {/* Left — evidence inventory */}
        <Card className="rounded-2xl p-5 dark:bg-navy-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-navy-700 dark:text-white flex items-center gap-2">
                <MdOutlineFolder className="h-5 w-5 text-brand-500" />
                Evidence Files
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Grouped by unique document</p>
            </div>
            {files.length > 0 && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                {files.length}
              </span>
            )}
          </div>

          {loadingBusinesses || loadingFiles ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : !selectedBusinessId ? (
            <EmptyState title="Select a business" subtitle="Evidence files will appear here." />
          ) : files.length === 0 ? (
            <EmptyState title="No evidence files" subtitle="Upload evidence via the SoA module." />
          ) : (
            <div className="max-h-[640px] space-y-2 overflow-y-auto pr-0.5">
              {files.map((f) => {
                const key = f.file_hash || f.files?.[0]?.stored_name || "";
                const selected = String(selectedFileHash) === String(key);
                const controlCount = (f.linked_controls || []).length;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedFileHash(key)}
                    className={`w-full rounded-xl border p-3.5 text-left transition hover:shadow-sm
                      ${selected
                        ? "border-brand-400 bg-brand-50 dark:border-brand-400/50 dark:bg-brand-500/10"
                        : "border-gray-100 bg-white hover:border-gray-200 dark:border-white/10 dark:bg-navy-900"
                      }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <MdOutlineInsertDriveFile className={`mt-0.5 h-5 w-5 flex-shrink-0 ${selected ? "text-brand-500" : "text-gray-400"}`} />
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${selected ? "text-brand-600 dark:text-brand-300" : "text-navy-700 dark:text-white"}`}>
                          {f.display_name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          {f.files?.length || 0} version{(f.files?.length || 0) !== 1 ? "s" : ""} · {controlCount} control{controlCount !== 1 ? "s" : ""}
                        </span>
                        {f.assessment_status ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              STATUS_CFG[f.assessment_status]?.badge ||
                              "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                            }`}
                          >
                            {f.assessment_status === "saved" ? "Saved" : "Draft"}
                          </span>
                        ) : null}
                      </div>
                        {controlCount > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(f.linked_controls || []).slice(0, 3).map((c) => (
                              <span key={`${c.row_id}_${c.control}`} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                                {c.control}
                              </span>
                            ))}
                            {controlCount > 3 && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400">
                                +{controlCount - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right — detail + assessment */}
        <div className="flex flex-col gap-5">

          {/* Selected file details */}
          {selectedFileGroup && (
            <Card className="rounded-2xl p-5 dark:bg-navy-800" style={{ animation: "eaSlideDown 0.15s ease both" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-navy-700 dark:text-white flex items-center gap-2">
                    <MdOutlineDescription className="h-5 w-5 text-brand-500 flex-shrink-0" />
                    <span className="truncate">{selectedFileGroup.display_name}</span>
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {selectedFileGroup.mime_type || "Document"} · {selectedFileGroup.size_bytes ? `${Math.round(selectedFileGroup.size_bytes / 1024)} KB` : "—"}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
    {(selectedFileGroup.linked_controls || []).length} linked controls
  </span>
  {selectedFileGroup.assessment_status ? (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_CFG[selectedFileGroup.assessment_status]?.badge ||
        "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
      }`}
    >
      {selectedFileGroup.assessment_status === "saved"
        ? "Saved assessment"
        : "Draft assessment"}
    </span>
  ) : null}
</div>
              </div>

              {(selectedFileGroup.linked_controls || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedFileGroup.linked_controls || []).map((c) => (
                    <ControlPill key={`${c.row_id}_${c.control}`} control={c.control} title={c.title} />
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Assessment results */}
          {selectedFileGroup && (
            <Card className="rounded-2xl p-5 dark:bg-navy-800">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-navy-700 dark:text-white">Assessment Results</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {assessment ? "Control-wise findings and recommendations" : "Run an assessment to see findings."}
                  </p>
                </div>
                {assessment && (
                  <button
                    onClick={saveOverallSummary}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5 transition"
                    type="button"
                  >
                    <MdSave className="h-4 w-4" />
                    Save
                  </button>
                )}
              </div>

              {!assessment ? (
                <EmptyState
                  title="No assessment yet"
                  subtitle="Click 'Run Assessment' above to generate control-wise findings."
                  action={
                    <button
                      onClick={runAssessment}
                      disabled={!canRun}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition"
                    >
                      <MdPlayArrow className="h-5 w-5" />
                      {runningAssessment ? "Assessing…" : selectedFileGroup?.assessment_id ? "Re-run Assessment" : "Run Assessment"}
                    </button>
                  }
                />
              ) : (
                <div className="space-y-5">
                  {/* Stats strip */}
                  <AssessmentStats controls={assessment.controls} />

                  {/* Overall summary */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-navy-900">
                    <label className={LABEL_CLS}>Overall Summary</label>
                    <textarea
                      rows={3}
                      value={assessment.overall_summary || ""}
                      onChange={(e) => setAssessment((prev) => ({ ...prev, overall_summary: e.target.value }))}
                      className={INPUT_CLS}
                      placeholder="Edit overall summary…"
                    />
                  </div>

                  {/* Control cards */}
                  {(assessment.controls || []).map((ctrl) => {
                    const cfg = STATUS_CFG[ctrl.assessment_status] || { border: "border-l-gray-300", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };

                    return (
                      <div
                        key={ctrl.id}
                        className={`rounded-2xl border border-l-4 border-gray-100 bg-white transition hover:shadow-sm dark:border-white/10 dark:bg-navy-900 ${cfg.border}`}
                      >
                        {/* Card header */}
                        <div className="flex items-start justify-between gap-3 p-4 pb-3">
                          <div className="min-w-0">
                            <p className="font-bold text-navy-700 dark:text-white">
                              {ctrl.control}
                              {ctrl.title ? <span className="font-normal text-gray-500 dark:text-gray-400"> — {ctrl.title}</span> : null}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {[ctrl.domain, ctrl.clause].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <StatusBadge value={ctrl.assessment_status} />
                            <button
                              onClick={() => startEditControl(ctrl)}
                              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/10 transition"
                              title="Edit this control"
                            >
                              <MdEdit className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 dark:border-white/10 xl:grid-cols-2">
                          <div className="space-y-3">
                            <div>
                              <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${cfg.badge.split(" ").find(c => c.startsWith("text-"))}`}>Findings</p>
                              <p className="text-sm text-gray-700 dark:text-gray-200">{ctrl.findings || "—"}</p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Document Quality</p>
                              <p className="text-sm text-gray-700 dark:text-gray-200">{ctrl.document_quality_findings || "—"}</p>
                            </div>
                            <ConfidenceBadge value={ctrl.confidence} />
                          </div>

                          <div className="space-y-3">
                            {(ctrl.missing_elements || []).length > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">Missing Elements</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {ctrl.missing_elements.map((m, idx) => (
                                    <span key={idx} className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:bg-red-500/15 dark:text-red-300">
                                      {m}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(ctrl.recommendations || []).length > 0 && (
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-500">Recommendations</p>
                                <ul className="space-y-1">
                                  {ctrl.recommendations.map((r, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                                      {r}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* Prompt when nothing selected */}
          {!selectedFileGroup && (
            <Card className="rounded-2xl p-10 text-center dark:bg-navy-800">
              <MdOutlineLink className="mx-auto h-12 w-12 text-gray-300 dark:text-white/20" />
              <p className="mt-3 font-semibold text-navy-700 dark:text-white">Select a file to begin</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose a business and an evidence file from the left panel, then run an assessment.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Edit control modal */}
      <Modal
        open={!!editingControlId && !!editDraft}
        onClose={cancelEditControl}
        title={editDraft ? `Edit: ${editDraft.control}${editDraft.title ? ` — ${editDraft.title}` : ""}` : "Edit Control"}
      >
        {editDraft && (
          <EditControlForm
            draft={editDraft}
            setEditDraft={setEditDraft}
            saving={savingControl}
            onSave={saveControlEdit}
            onCancel={cancelEditControl}
          />
        )}
      </Modal>
    </div>
  );
}

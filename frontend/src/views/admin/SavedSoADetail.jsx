import React, { useEffect, useState } from "react";
import axios from "axios";
import Card from "components/card";
import { useParams, useNavigate } from "react-router-dom";
import {
  MdOutlineArrowBack,
  MdOutlinePictureAsPdf,
  MdOutlineTableChart,
  MdOutlineEdit,
  MdOutlineCheck,
  MdOutlineClose,
  MdOutlineUploadFile,
  MdOutlineDeleteOutline,
  MdOutlineOpenInNew,
  MdOutlineFileDownload,
  MdOutlineWarningAmber,
  MdOutlineCheckCircle,
  MdOutlineDescription,
  MdOutlineAdd,
  MdOutlineShield,
} from "react-icons/md";
import { HiExclamationCircle, HiCheckCircle, HiDocumentText, HiClipboardDocumentCheck } from "react-icons/hi2";

const API_BASE = "http://localhost:5001";
const APPLICABILITY_OPTIONS = ["Yes", "No", "Conditional", "Clarification Needed"];
const TYPE_OPTIONS = [
  { value: "document", label: "Document" },
  { value: "evidence_note", label: "Evidence / Activity Note" },
];

/* ─── Applicability badge ─── */
function ApplicabilityBadge({ value }) {
  const v = (value || "").toLowerCase();
  const styles = {
    yes: "bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/20",
    no: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20",
    conditional: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/20",
    "clarification needed": "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/20",
  };
  const cls = styles[v] || "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10";
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {value || "—"}
    </span>
  );
}

/* ─── Domain badge ─── */
function DomainBadge({ value }) {
  const colors = {
    Organizational: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300",
    People: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300",
    Physical: "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-300",
    Technological: "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-300",
  };
  const cls = colors[value] || "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400";
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {value}
    </span>
  );
}

function hasMissingEvidence(row) {
  return (row.actionables || []).some(
    (a) => a.upload_required && (!a.files || a.files.length === 0)
  );
}

/* ─── Stat pill ─── */
function StatPill({ label, value, color }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl px-5 py-3 ${color}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="mt-0.5 text-[11px] font-medium opacity-80">{label}</span>
    </div>
  );
}

/* ─── Structured actionable editor row ─── */
function ActionableEditorRow({ item, index, onChange, onRemove }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-navy-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 dark:text-gray-400">
          Action #{index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <MdOutlineClose className="text-sm" />
        </button>
      </div>

      {/* Text */}
      <textarea
        rows={2}
        value={item.text}
        onChange={(e) => onChange({ ...item, text: e.target.value })}
        placeholder="Describe the required action or evidence…"
        className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:placeholder-gray-500"
      />

      {/* Type + Upload required */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Type
          </label>
          <select
            value={item.type}
            onChange={(e) => onChange({ ...item, type: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-navy-700 outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Evidence Upload Required
          </label>
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

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
export default function SavedSoADetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/soa-records/${id}`);
      setRecord(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load saved SoA.");
    }
  };

  useEffect(() => { load(); }, [id]);

  /* ── Edit helpers ── */
  const startEditRow = (row) => {
    setEditingRowId(row.id);
    setEditDraft({
      ...row,
      actionablesList: (row.actionables || []).map((a) => ({
        id: a.id,
        text: a.text,
        type: a.type || "evidence_note",
        upload_required: !!a.upload_required,
      })),
    });
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditDraft(null);
  };

  const saveRow = async () => {
    if (!editDraft) return;
    setSaving(true);
    try {
      await axios.patch(`${API_BASE}/api/soa-records/rows/${editingRowId}`, {
        applicability: editDraft.applicability,
        justification: editDraft.justification,
        clarification_question: editDraft.clarification_question,
      });

      await axios.patch(`${API_BASE}/api/soa-records/rows/${editingRowId}/actionables`, {
        actionables: editDraft.actionablesList.map(({ text, type, upload_required }) => ({
          text,
          type: type === "document" ? "document" : "evidence_note",
          upload_required,
        })),
      });

      await load();
      cancelEdit();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save row.");
    } finally {
      setSaving(false);
    }
  };

  const uploadFiles = async (actionableId, files) => {
    if (!files?.length) return;
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      await axios.post(`${API_BASE}/api/soa-records/actionables/${actionableId}/files`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to upload files.");
    }
  };

  const deleteFile = async (fileId) => {
    try {
      await axios.delete(`${API_BASE}/api/soa-records/files/${fileId}`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to delete file.");
    }
  };

  /* ── Loading state ── */
  if (!record) {
    return (
      <div className="mt-5 space-y-5">
        <Card className="animate-pulse rounded-[20px] p-6 dark:bg-navy-800">
          <div className="h-6 w-64 rounded bg-gray-100 dark:bg-white/5" />
          <div className="mt-2 h-4 w-96 rounded bg-gray-100 dark:bg-white/5" />
        </Card>
        <Card className="h-64 animate-pulse rounded-[20px] dark:bg-navy-800" />
      </div>
    );
  }

  const rows = record.rows || [];
  const totalRows = rows.length;
  const missingCount = rows.filter(hasMissingEvidence).length;
  const completeCount = totalRows - missingCount;
  const completionPct = totalRows ? Math.round((completeCount / totalRows) * 100) : 0;

  return (
    <div className="mt-5 space-y-5">

      {/* ── Header card ── */}
      <Card className="rounded-[20px] p-6 dark:bg-navy-800">
        {/* Back button */}
        <button
          onClick={() => navigate("/admin/saved-soas")}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition-colors hover:text-brand-500 dark:text-gray-400 dark:hover:text-brand-400"
          type="button"
        >
          <MdOutlineArrowBack className="text-base" />
          Back to Saved SoAs
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
              <MdOutlineShield className="text-xl" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-navy-700 dark:text-white">
                {record.business_name}
              </h2>
              {record.business_text && (
                <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                  {record.business_text}
                </p>
              )}
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href={`${API_BASE}/api/soa-records/${record.id}/export/pdf`}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-brand-600"
            >
              <MdOutlinePictureAsPdf className="text-base" />
              PDF
            </a>
            <a
              href={`${API_BASE}/api/soa-records/${record.id}/export/xlsx`}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
            >
              <MdOutlineTableChart className="text-green-500 text-base" />
              XLSX
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 flex flex-wrap gap-3">
          <StatPill
            label="Total Controls"
            value={totalRows}
            color="bg-lightPrimary text-navy-700 dark:bg-white/5 dark:text-white"
          />
          <StatPill
            label="Complete"
            value={completeCount}
            color="bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
          />
          <StatPill
            label="Missing Evidence"
            value={missingCount}
            color={missingCount > 0 ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" : "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"}
          />
          <div className="flex flex-col items-center rounded-2xl bg-lightPrimary px-5 py-3 dark:bg-white/5">
            <span className="text-2xl font-bold text-navy-700 dark:text-white">{completionPct}%</span>
            <span className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">Completion</span>
          </div>
        </div>

        {/* Completion bar */}
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${completionPct}%`,
                background: completionPct >= 80 ? "linear-gradient(90deg,#01B574,#6AD2FF)" : completionPct >= 50 ? "linear-gradient(90deg,#FFB547,#6AD2FF)" : "linear-gradient(90deg,#EE5D50,#FFB547)",
              }}
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <HiExclamationCircle className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </Card>

      {/* ── Controls table ── */}
      <Card className="overflow-hidden rounded-[20px] p-0 dark:bg-navy-800">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-white/10">
          <h3 className="font-bold text-navy-700 dark:text-white">Controls</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Click Edit on any row to update applicability, justification, or required actions.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1600px] border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-white/10 dark:bg-white/[0.02]">
                {[
                  "Standard", "Domain", "Clause", "Control", "Title",
                  "Applicability", "Justification", "Actions / Evidence", "Status", "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const isEditing = editingRowId === row.id;
                const d = isEditing ? editDraft : row;
                const missing = hasMissingEvidence(row);

                return (
                  <tr
                    key={row.id}
                    className={`group border-b border-gray-50 align-top transition-colors last:border-0 dark:border-white/5 ${
                      missing && !isEditing
                        ? "bg-red-50/40 dark:bg-red-500/[0.04]"
                        : isEditing
                        ? "bg-brand-50/40 dark:bg-brand-500/[0.04]"
                        : "hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                    }`}
                  >
                    {/* Standard */}
                    <td className="px-4 py-3.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {row.standard}
                    </td>

                    {/* Domain */}
                    <td className="px-4 py-3.5">
                      <DomainBadge value={row.domain} />
                    </td>

                    {/* Clause */}
                    <td className="px-4 py-3.5 text-sm font-mono font-semibold text-gray-700 dark:text-gray-300">
                      {row.clause}
                    </td>

                    {/* Control */}
                    <td className="px-4 py-3.5 text-sm font-bold text-navy-700 dark:text-white">
                      {row.control}
                    </td>

                    {/* Title */}
                    <td className="min-w-[200px] px-4 py-3.5 text-sm font-medium text-gray-800 dark:text-gray-200">
                      {row.title}
                    </td>

                    {/* Applicability */}
                    <td className="px-4 py-3.5">
                      {isEditing ? (
                        <select
                          value={d.applicability}
                          onChange={(e) =>
                            setEditDraft((p) => ({ ...p, applicability: e.target.value }))
                          }
                          className="w-full min-w-[160px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                        >
                          {APPLICABILITY_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      ) : (
                        <ApplicabilityBadge value={row.applicability} />
                      )}
                    </td>

                    {/* Justification */}
                    <td className="min-w-[240px] px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200">
                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={d.justification}
                          onChange={(e) =>
                            setEditDraft((p) => ({ ...p, justification: e.target.value }))
                          }
                          className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                        />
                      ) : (
                        <span className="leading-relaxed">{row.justification || "—"}</span>
                      )}
                    </td>

                    {/* Actions / Evidence */}
                    <td className="min-w-[420px] px-4 py-3.5">
                      {isEditing ? (
                        /* ── Structured actionable editor ── */
                        <div className="space-y-2">
                          {(d.actionablesList || []).map((item, idx) => (
                            <ActionableEditorRow
                              key={idx}
                              item={item}
                              index={idx}
                              onChange={(updated) =>
                                setEditDraft((p) => ({
                                  ...p,
                                  actionablesList: p.actionablesList.map((a, i) =>
                                    i === idx ? updated : a
                                  ),
                                }))
                              }
                              onRemove={() =>
                                setEditDraft((p) => ({
                                  ...p,
                                  actionablesList: p.actionablesList.filter((_, i) => i !== idx),
                                }))
                              }
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setEditDraft((p) => ({
                                ...p,
                                actionablesList: [
                                  ...(p.actionablesList || []),
                                  { text: "", type: "evidence_note", upload_required: false },
                                ],
                              }))
                            }
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-400 transition hover:border-brand-400 hover:text-brand-500 dark:border-white/20 dark:text-gray-500 dark:hover:border-brand-400 dark:hover:text-brand-400"
                          >
                            <MdOutlineAdd />
                            Add action
                          </button>
                        </div>
                      ) : (
                        /* ── Read-only actionable display ── */
                        <div className="space-y-2.5">
                          {(row.actionables || []).map((a) => {
                            const missingThis = a.upload_required && (!a.files || a.files.length === 0);
                            return (
                              <div
                                key={a.id}
                                className={`rounded-xl border p-3 transition-colors ${
                                  missingThis
                                    ? "border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/[0.07]"
                                    : "border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.02]"
                                }`}
                              >
                                {/* Type chip */}
                                <div className="mb-1.5 flex items-center gap-2">
                                  {a.type === "document" ? (
                                    <span className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-500 dark:bg-brand-500/10 dark:text-brand-300">
                                      <HiDocumentText className="text-xs" />
                                      Document
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-white/5 dark:text-gray-400">
                                      <HiClipboardDocumentCheck className="text-xs" />
                                      Evidence Note
                                    </span>
                                  )}

                                  {a.upload_required && (
                                    <span
                                      className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                        missingThis
                                          ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                                          : "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                                      }`}
                                    >
                                      {missingThis ? (
                                        <><MdOutlineWarningAmber className="text-xs" />Missing</>
                                      ) : (
                                        <><MdOutlineCheckCircle className="text-xs" />Uploaded</>
                                      )}
                                    </span>
                                  )}
                                </div>

                                <p className="text-sm leading-snug text-navy-700 dark:text-white">
                                  {a.text}
                                </p>

                                {/* File upload + file list */}
                                {a.upload_required && (
                                  <div className="mt-2.5 space-y-1.5">
                                    {/* Upload input */}
                                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-gray-400 transition hover:border-brand-400 hover:text-brand-500 dark:border-white/10 dark:hover:border-brand-400">
                                      <MdOutlineUploadFile className="text-base" />
                                      Upload evidence
                                      <input
                                        type="file"
                                        multiple
                                        className="sr-only"
                                        onChange={(e) => uploadFiles(a.id, e.target.files)}
                                      />
                                    </label>

                                    {/* Uploaded files */}
                                    {(a.files || []).map((f) => (
                                      <div
                                        key={f.id}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-navy-900"
                                      >
                                        <div className="flex min-w-0 items-center gap-2">
                                          <MdOutlineDescription className="shrink-0 text-sm text-brand-500" />
                                          <span className="truncate text-xs font-medium text-navy-700 dark:text-white">
                                            {f.original_name}
                                          </span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                          <a
                                            href={`${API_BASE}/api/soa-records/files/${f.id}/view`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-0.5 text-[11px] font-semibold text-brand-500 hover:underline"
                                          >
                                            <MdOutlineOpenInNew className="text-xs" />
                                            View
                                          </a>
                                          <a
                                            href={`${API_BASE}/api/soa-records/files/${f.id}/download`}
                                            className="flex items-center gap-0.5 text-[11px] font-semibold text-brand-500 hover:underline"
                                          >
                                            <MdOutlineFileDownload className="text-xs" />
                                            Download
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() => deleteFile(f.id)}
                                            className="flex items-center gap-0.5 text-[11px] font-semibold text-red-500 hover:underline"
                                          >
                                            <MdOutlineDeleteOutline className="text-xs" />
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {row.actionables?.length === 0 && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">No actions defined.</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      {missing ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20">
                          <HiExclamationCircle className="text-xs" />
                          Missing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/20">
                          <HiCheckCircle className="text-xs" />
                          Complete
                        </span>
                      )}
                    </td>

                    {/* Edit / Save / Cancel */}
                    <td className="min-w-[110px] px-4 py-3.5">
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => startEditRow(row)}
                          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-500 dark:border-white/10 dark:text-white dark:hover:border-brand-400"
                        >
                          <MdOutlineEdit className="text-sm" />
                          Edit
                        </button>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={saveRow}
                            disabled={saving}
                            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-brand-600 disabled:opacity-60"
                          >
                            <MdOutlineCheck className="text-sm" />
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5"
                          >
                            <MdOutlineClose className="text-sm" />
                            Cancel
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
      </Card>
    </div>
  );
}

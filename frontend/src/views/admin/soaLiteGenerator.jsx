import React, { useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";

const API_BASE = "http://localhost:5001";
const APPLICABILITY_OPTIONS = ["Yes", "No", "Conditional", "Clarification Needed"];

function ApplicabilityBadge({ value }) {
  const v = (value || "").toLowerCase();
  let cls = "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white";

  if (v === "yes") cls = "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200";
  if (v === "conditional") cls = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200";
  if (v === "no") cls = "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200";
  if (v === "clarification needed") cls = "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200";

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${cls}`}>
      {value}
    </span>
  );
}

function SaveSoAModal({ open, onClose, onSave, saving }) {
  const [businessName, setBusinessName] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-navy-800">
        <h3 className="text-lg font-bold text-navy-700 dark:text-white">Save SoA</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Enter a business name to save this SoA.
        </p>

        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="e.g. RetailCo"
          className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(businessName)}
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            type="button"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const blob = `${r.standard} ${r.domain} ${r.clause} ${r.control} ${r.title} ${r.applicability} ${r.justification} ${(r.actionables || [])
        .map((a) => (typeof a === "string" ? a : a?.text || ""))
        .join(" ")} ${r.clarification_question || ""}`.toLowerCase();

      return blob.includes(s);
    });
  }, [rows, search]);

  const generateSoA = async () => {
    setError("");
    setSuccess("");

    if (!businessText.trim()) {
      setError("Please enter business function.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/soa-lite/generate`, {
        businessText,
      });

      const output = Array.isArray(res.data?.rows) ? res.data.rows : [];
      const withUiFields = output.map((r, idx) => ({
        id: `soa_${idx}_${r.control}`,
        ...r,
        actionables: Array.isArray(r.actionables)
          ? r.actionables.map((a) => ({
              text: String(a?.text || "").trim(),
              type: a?.type === "document" ? "document" : "evidence_note",
              upload_required: Boolean(a?.upload_required),
              uploadedFileName: "",
              selectedFile: null,
            }))
          : [],
      }));

      setRows(withUiFields);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to generate SoA.");
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentSoA = async (businessName) => {
    setError("");
    setSuccess("");

    if (!businessName || !businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    if (!rows.length) {
      setError("Generate SoA first before saving.");
      return;
    }

    setSavingSoA(true);
    try {
      await axios.post(`${API_BASE}/api/soa-records`, {
        businessName,
        businessText,
        rows,
      });

      setSaveOpen(false);
      setSuccess(`SoA saved successfully for "${businessName}".`);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to save SoA.");
    } finally {
      setSavingSoA(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft({
      ...row,
      actionablesText: (row.actionables || [])
        .map((a) => `${a.text} | ${a.type} | ${a.upload_required ? "true" : "false"}`)
        .join("\n"),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editDraft) return;

    const parsedActionables = String(editDraft.actionablesText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [text = "", type = "evidence_note", uploadFlag = "false"] = line.split("|").map((x) => x.trim());
        return {
          text,
          type: type === "document" ? "document" : "evidence_note",
          upload_required: uploadFlag === "true",
          uploadedFileName: "",
          selectedFile: null,
        };
      })
      .filter((a) => a.text);

    const updated = {
      ...editDraft,
      actionables: parsedActionables,
    };

    delete updated.actionablesText;

    setRows((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
    setEditingId(null);
    setEditDraft(null);
  };

  const reEvaluateRow = async (row) => {
    if (!clarificationInput.trim()) {
      setError("Please enter clarification for this row.");
      return;
    }

    setClarifyLoading(true);
    setError("");

    try {
      const res = await axios.post(`${API_BASE}/api/soa-lite/re-evaluate-row`, {
        businessText,
        row: {
          standard: row.standard,
          domain: row.domain,
          clause: row.clause,
          control: row.control,
          title: row.title,
        },
        clarification: clarificationInput,
      });

      const updatedRow = res.data?.row;
      if (!updatedRow) throw new Error("No row returned");

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...updatedRow,
                actionables: Array.isArray(updatedRow.actionables)
                  ? updatedRow.actionables.map((a) => ({
                      text: String(a?.text || "").trim(),
                      type: a?.type === "document" ? "document" : "evidence_note",
                      upload_required: Boolean(a?.upload_required),
                      uploadedFileName: "",
                      selectedFile: null,
                    }))
                  : [],
              }
            : r
        )
      );

      setClarifyRowId(null);
      setClarificationInput("");
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to re-evaluate row.");
    } finally {
      setClarifyLoading(false);
    }
  };

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      <SaveSoAModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={saveCurrentSoA}
        saving={savingSoA}
      />

      <Card className="p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">SoA Generator (Lite)</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Generate SoA rows, refine them, and save them by business name.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={generateSoA}
              disabled={loading}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              type="button"
            >
              {loading ? "Generating..." : "Generate SoA"}
            </button>

            <button
              onClick={() => setSaveOpen(true)}
              disabled={!rows.length}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white disabled:opacity-50"
              type="button"
            >
              Save
            </button>
          </div>
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
          rows={7}
          placeholder="Describe the business function, systems, users, cloud/on-prem setup, data handled, access model, vendors, backups, incidents, logs, etc."
          value={businessText}
          onChange={(e) => setBusinessText(e.target.value)}
        />

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">
            {success}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-navy-700 dark:text-white">
              SoA Rows ({filteredRows.length}/{rows.length})
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Human-in-the-loop: review, edit, or clarify only specific rows.
            </p>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search control / title / justification..."
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white md:w-96"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="min-w-[1800px] w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Standard</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Clause</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Control</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Title</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Applicability</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Justification</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Actionables</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Clarification</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Edit</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((r) => {
                const isEditing = editingId === r.id;
                const d = isEditing ? editDraft : r;
                const isClarifying = clarifyRowId === r.id;

                return (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-white/10 align-top">
                    <td className="px-4 py-3 text-sm text-navy-700 dark:text-white">{r.standard}</td>
                    <td className="px-4 py-3 text-sm text-navy-700 dark:text-white">{r.domain}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{r.clause}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-navy-700 dark:text-white">{r.control}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{r.title}</td>

                    <td className="px-4 py-3 text-sm">
                      {isEditing ? (
                        <select
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          value={d.applicability}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, applicability: e.target.value }))
                          }
                        >
                          {APPLICABILITY_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      ) : (
                        <ApplicabilityBadge value={r.applicability} />
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 min-w-[260px]">
                      {isEditing ? (
                        <textarea
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          rows={4}
                          value={d.justification}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, justification: e.target.value }))
                          }
                        />
                      ) : (
                        r.justification || "-"
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 min-w-[340px]">
                      {isEditing ? (
                        <textarea
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                          rows={6}
                          value={d.actionablesText}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, actionablesText: e.target.value }))
                          }
                          placeholder={`Format:
Information Security Policy | document | true
Retain backup success logs and periodic restoration test records | evidence_note | false`}
                        />
                      ) : (
                        <div className="space-y-3">
                          {(r.actionables || []).map((a, idx) => (
                            <div key={idx} className="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                              <div className="font-medium text-navy-700 dark:text-white">{a.text}</div>
                              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                {a.type === "document" ? "Document" : "Evidence / activity note"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm min-w-[280px]">
                      {r.applicability === "Clarification Needed" ? (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                            {r.clarification_question || "Please provide a short clarification for this control."}
                          </div>

                          {!isClarifying ? (
                            <button
                              onClick={() => {
                                setClarifyRowId(r.id);
                                setClarificationInput("");
                              }}
                              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                              type="button"
                            >
                              Give Clarification
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <textarea
                                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-800 dark:text-white"
                                rows={4}
                                value={clarificationInput}
                                onChange={(e) => setClarificationInput(e.target.value)}
                                placeholder="Enter clarification only for this control..."
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => reEvaluateRow(r)}
                                  disabled={clarifyLoading}
                                  className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                                  type="button"
                                >
                                  {clarifyLoading ? "Re-evaluating..." : "Re-evaluate Row"}
                                </button>
                                <button
                                  onClick={() => {
                                    setClarifyRowId(null);
                                    setClarificationInput("");
                                  }}
                                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          No clarification needed
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm min-w-[120px]">
                      {!isEditing ? (
                        <button
                          onClick={() => startEdit(r)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                          type="button"
                        >
                          Edit
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
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
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-sm text-gray-600 dark:text-gray-300">
                    No rows yet. Enter a business function and generate SoA.
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
import React, { useEffect, useState } from "react";
import axios from "axios";
import Card from "components/card";
import { useParams } from "react-router-dom";

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

function hasMissingEvidence(row) {
  return (row.actionables || []).some(
    (a) => a.upload_required && (!a.files || a.files.length === 0)
  );
}

export default function SavedSoADetail() {
  const { id } = useParams();

  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const load = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/soa-records/${id}`);
      setRecord(res.data);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to load saved SoA.");
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const startEditRow = (row) => {
    setEditingRowId(row.id);
    setEditDraft({
      ...row,
      actionablesText: (row.actionables || [])
        .map((a) => `${a.text} | ${a.type} | ${a.upload_required ? "true" : "false"}`)
        .join("\n"),
    });
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditDraft(null);
  };

  const saveRow = async () => {
    if (!editDraft) return;

    try {
      await axios.patch(`${API_BASE}/api/soa-records/rows/${editingRowId}`, {
        applicability: editDraft.applicability,
        justification: editDraft.justification,
        clarification_question: editDraft.clarification_question,
      });

      const parsedActionables = String(editDraft.actionablesText || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [text = "", type = "evidence_note", uploadFlag = "false"] = line
            .split("|")
            .map((x) => x.trim());

          return {
            text,
            type: type === "document" ? "document" : "evidence_note",
            upload_required: uploadFlag === "true",
          };
        });

      await axios.patch(`${API_BASE}/api/soa-records/rows/${editingRowId}/actionables`, {
        actionables: parsedActionables,
      });

      await load();
      cancelEdit();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to save row.");
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
      console.error(e);
      setError(e?.response?.data?.error || "Failed to upload files.");
    }
  };

  const deleteFile = async (fileId) => {
    try {
      await axios.delete(`${API_BASE}/api/soa-records/files/${fileId}`);
      await load();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to delete file.");
    }
  };

  if (!record) {
    return (
      <div className="mt-5">
        <Card className="p-6">
          <div className="text-sm text-gray-600 dark:text-gray-300">Loading...</div>
        </Card>
      </div>
    );
  }

  const missingCount = (record.rows || []).filter(hasMissingEvidence).length;

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      <Card className="p-6">
        <h2 className="text-xl font-bold text-navy-700 dark:text-white">{record.business_name}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{record.business_text}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`${API_BASE}/api/soa-records/${record.id}/export/pdf`}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Download PDF
          </a>

          <a
            href={`${API_BASE}/api/soa-records/${record.id}/export/xlsx`}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
          >
            Download XLSX
          </a>

          {missingCount > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              Missing evidence in {missingCount} row{missingCount > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="min-w-[1900px] w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Standard</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Clause</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Control</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Title</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Applicability</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Justification</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Evidence / Files</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Edit</th>
              </tr>
            </thead>

            <tbody>
              {(record.rows || []).map((row) => {
                const isEditing = editingRowId === row.id;
                const d = isEditing ? editDraft : row;
                const missingEvidence = hasMissingEvidence(row);

                return (
                  <tr
                    key={row.id}
                    className={`border-t border-gray-200 dark:border-white/10 align-top ${
                      missingEvidence ? "bg-red-50 dark:bg-red-500/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-navy-700 dark:text-white">{row.standard}</td>
                    <td className="px-4 py-3 text-sm text-navy-700 dark:text-white">{row.domain}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.clause}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-navy-700 dark:text-white">{row.control}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{row.title}</td>

                    <td className="px-4 py-3 text-sm">
                      {isEditing ? (
                        <select
                          value={d.applicability}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, applicability: e.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                        >
                          {APPLICABILITY_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      ) : (
                        <ApplicabilityBadge value={row.applicability} />
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 min-w-[260px]">
                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={d.justification}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, justification: e.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                        />
                      ) : (
                        row.justification || "-"
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 min-w-[460px]">
                      {isEditing ? (
                        <textarea
                          rows={6}
                          value={d.actionablesText}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, actionablesText: e.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-navy-900 dark:text-white"
                        />
                      ) : (
                        <div className="space-y-3">
                          {(row.actionables || []).map((a) => {
                            const missingThisActionable =
                              a.upload_required && (!a.files || a.files.length === 0);

                            return (
                              <div
                                key={a.id}
                                className={`rounded-lg border p-3 dark:border-white/10 ${
                                  missingThisActionable
                                    ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
                                    : "border-gray-200"
                                }`}
                              >
                                <div className="font-medium text-navy-700 dark:text-white">{a.text}</div>
                                <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                  {a.type === "document" ? "Document" : "Evidence / activity note"}
                                </div>

                                {a.upload_required && (
                                  <div className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
                                    {a.files?.length ? "Evidence uploaded" : "Missing required evidence"}
                                  </div>
                                )}

                                <div className="mt-3 flex flex-col gap-2">
                                  {a.upload_required && (
                                    <input
                                      type="file"
                                      multiple
                                      onChange={(e) => uploadFiles(a.id, e.target.files)}
                                      className="text-sm dark:text-white"
                                    />
                                  )}

                                  {(a.files || []).map((f) => (
                                    <div
                                      key={f.id}
                                      className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10"
                                    >
                                      <span className="text-xs text-navy-700 dark:text-white">
                                        {f.original_name}
                                      </span>
                                      <a
                                        href={`${API_BASE}/api/soa-records/files/${f.id}/view`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-semibold text-brand-500"
                                      >
                                        View
                                      </a>
                                      <a
                                        href={`${API_BASE}/api/soa-records/files/${f.id}/download`}
                                        className="text-xs font-semibold text-brand-500"
                                      >
                                        Download
                                      </a>
                                      <button
                                        onClick={() => deleteFile(f.id)}
                                        className="text-xs font-semibold text-red-600"
                                        type="button"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      {missingEvidence ? (
                        <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-200">
                          Missing Evidence
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-200">
                          Complete
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm min-w-[120px]">
                      {!isEditing ? (
                        <button
                          onClick={() => startEditRow(row)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
                          type="button"
                        >
                          Edit
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={saveRow}
                            className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-white"
                            type="button"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
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
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
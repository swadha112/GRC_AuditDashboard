import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Card from "components/card";

const API = "http://localhost:5001";
const TABS = [
  { key: "viewer", label: "Viewer" },
  { key: "editor", label: "Editor" },
  { key: "approver", label: "Approver" },
];

const STATUSES = ["Not Started", "Draft", "Reviewed", "Approved", "Implemented"];

function StatusBadge({ status }) {
  const s = String(status || "");
  let cls = "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white";
  if (s === "Approved" || s === "Implemented")
    cls = "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200";
  if (s === "Reviewed" || s === "Draft")
    cls = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200";
  if (s === "Not Started")
    cls = "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200";

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${cls}`}>
      {s}
    </span>
  );
}

export default function Documents() {
  const [tab, setTab] = useState("viewer");

  const [docs, setDocs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => docs.find((d) => d.id === selectedId) || null, [docs, selectedId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Editor inputs
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [approver, setApprover] = useState("");
  const [file, setFile] = useState(null);

  // Approver inputs
  const [newStatus, setNewStatus] = useState("Draft");
  const [statusNote, setStatusNote] = useState("");

  // Comments
  const [comment, setComment] = useState("");

  // When row expands, scroll to it
  const detailRowRef = useRef(null);

  // Auto-refresh so viewer/editor see approver updates
  useEffect(() => {
    let t = null;
    t = setInterval(() => loadDocs(false), 4000);
    return () => t && clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadDocs(showToast = true) {
    setError("");
    if (showToast) setMsg("");
    try {
      const res = await axios.get(`${API}/api/docs`);
      const list = res.data.documents || [];
      setDocs(list);

      // keep selection valid
      if (selectedId && !list.find((d) => d.id === selectedId)) setSelectedId(null);

      if (showToast) setMsg("Refreshed.");
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load documents.");
    }
  }

  useEffect(() => {
    loadDocs(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync edit form when opening a doc
  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title || "");
    setOwner(selected.owner || "");
    setApprover(selected.approver || "");
    setNewStatus(selected.status || "Draft");
    setFile(null);
    setComment("");
    setStatusNote("");
  }, [selectedId]); // intentionally on id change

  // scroll into expanded detail row
  useEffect(() => {
    if (!selectedId) return;
    const t = setTimeout(() => {
      detailRowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedId]);

  const canEdit = tab === "editor" || tab === "approver";
  const canApprove = tab === "approver";
  const roleQuery = `?role=${tab}`;

  async function saveMetadata() {
    if (!selected) return;
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const res = await axios.patch(`${API}/api/docs/${selected.id}/metadata${roleQuery}`, {
        title,
        owner,
        approver,
      });
      setMsg("Metadata saved.");
      await loadDocs(false);
      setSelectedId(res.data.id);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save metadata.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile() {
    if (!selected) return;
    if (!file) return setError("Choose a file first.");
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await axios.post(`${API}/api/docs/${selected.id}/upload${roleQuery}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMsg("Uploaded new version.");
      setFile(null);
      await loadDocs(false);
    } catch (e) {
      setError(e?.response?.data?.error || "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus() {
    if (!selected) return;
    setLoading(true);
    setError("");
    setMsg("");
    try {
      await axios.patch(`${API}/api/docs/${selected.id}/status${roleQuery}`, {
        status: newStatus,
        note: statusNote,
      });
      setMsg("Status updated.");
      setStatusNote("");
      await loadDocs(false);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to update status.");
    } finally {
      setLoading(false);
    }
  }

  async function addComment() {
    if (!selected) return;
    if (!comment.trim()) return setError("Write a comment first.");
    setLoading(true);
    setError("");
    setMsg("");
    try {
      await axios.post(`${API}/api/docs/${selected.id}/comment${roleQuery}`, { comment });
      setMsg("Comment added.");
      setComment("");
      await loadDocs(false);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to add comment.");
    } finally {
      setLoading(false);
    }
  }

  const renderInlineDetails = (doc) => {
    if (!doc) return null;

    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-900">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-bold text-navy-700 dark:text-white">Document Detail</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {doc.control} • v{doc.version}
            </div>
          </div>

          <button
            onClick={() => setSelectedId(null)}
            className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">Status:</span> {doc.status}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">Owner:</span> {doc.owner}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">Approver:</span> {doc.approver}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">Created:</span>{" "}
            {doc.timestamps?.createdAt ? new Date(doc.timestamps.createdAt).toLocaleString() : "-"}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">Updated:</span>{" "}
            {doc.timestamps?.updatedAt ? new Date(doc.timestamps.updatedAt).toLocaleString() : "-"}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">Approved:</span>{" "}
            {doc.timestamps?.approvedAt ? new Date(doc.timestamps.approvedAt).toLocaleString() : "-"}
          </div>
        </div>

        {/* Editor/Approver: metadata edit */}
        {canEdit && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <div className="text-sm font-bold text-navy-700 dark:text-white">Edit metadata</div>

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Title</div>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Owner</div>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Approver</div>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={saveMetadata}
                disabled={loading}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Editor/Approver: upload */}
        {canEdit && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <div className="text-sm font-bold text-navy-700 dark:text-white">Upload new version</div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm text-gray-700 dark:text-gray-200" />
              <button
                onClick={uploadFile}
                disabled={loading || !file}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                type="button"
              >
                Upload
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              Upload bumps version and moves status from Not Started → Draft (if it was Not Started).
            </div>
          </div>
        )}

        {/* Approver: status update */}
        {canApprove && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <div className="text-sm font-bold text-navy-700 dark:text-white">Approval / Status</div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">New status</div>
                <select
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Note (optional)</div>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="e.g., Reviewed by CISO; minor edits requested"
                />
              </div>
            </div>

            <div className="mt-3">
              <button
                onClick={setStatus}
                disabled={loading}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                type="button"
              >
                Update Status
              </button>
            </div>
          </div>
        )}

        {/* Editor/Approver: comment */}
        {canEdit && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <div className="text-sm font-bold text-navy-700 dark:text-white">Audit comment</div>
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note (e.g., evidence reviewed, gap noted, approval rationale...)"
              />
              <button
                onClick={addComment}
                disabled={loading}
                className="w-fit rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                type="button"
              >
                Add Comment
              </button>
            </div>
          </div>
        )}

        {/* Audit trail */}
        <div className="mt-6">
          <div className="text-sm font-bold text-navy-700 dark:text-white">Audit trail</div>
          <div className="mt-2 space-y-2">
            {(doc.auditTrail || []).slice(0, 20).map((a, idx) => {
              const actorLabel = a.actorName ? `${a.actorRole} • ${a.actorName}` : a.actorRole;
              return (
                <div key={idx} className="rounded-xl border border-gray-200 p-3 text-sm dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-navy-700 dark:text-white">
                      {a.action}{" "}
                      <span className="font-normal text-gray-500 dark:text-gray-400">
                        ({actorLabel || "unknown"})
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {a.at ? new Date(a.at).toLocaleString() : "-"}
                    </div>
                  </div>
                  <div className="mt-1 text-gray-700 dark:text-gray-200">{a.details}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      <Card className="p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">Records / Documents</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDocs(true)}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                tab === t.key
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white"
              }`}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
        {msg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">
            {msg}
          </div>
        )}

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="min-w-[1000px] w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Control</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Title</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Version</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Updated</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>

            <tbody>
              {docs.map((d) => (
                <React.Fragment key={d.id}>
                  <tr
                    className={`border-t border-gray-200 dark:border-white/10 ${
                      selectedId === d.id ? "bg-gray-50 dark:bg-white/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-navy-700 dark:text-white">{d.control}</td>
                    <td className="px-4 py-3 text-sm text-navy-700 dark:text-white">{d.title}</td>
                    <td className="px-4 py-3 text-sm"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{d.version}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {d.timestamps?.updatedAt ? new Date(d.timestamps.updatedAt).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedId(d.id)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                          type="button"
                        >
                          {selectedId === d.id ? "Opened" : "Open"}
                        </button>

                        <a
                          className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                          href={`${API}/api/docs/${d.id}/view`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>

                        <a
                          className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-white hover:bg-brand-600"
                          href={`${API}/api/docs/${d.id}/download`}
                        >
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>

                  {/* Inline expanded detail row */}
                  {selectedId === d.id && (
                    <tr ref={detailRowRef} className="border-t border-gray-200 dark:border-white/10">
                      <td colSpan={6} className="px-4 py-4">
                        {renderInlineDetails(selected)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}

              {docs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-gray-600 dark:text-gray-300">
                    No documents in store.
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
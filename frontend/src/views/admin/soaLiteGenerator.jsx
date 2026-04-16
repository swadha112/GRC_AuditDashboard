import React, { useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";
import { ISO27001_CONTROLS } from "../../constants/iso27001Controls";

const API_BASE = "http://localhost:5001";
const APPLICABILITY_OPTIONS = ["Yes", "No", "Conditional", "Clarification Needed"];
const DOMAIN_ORDER = ["Organizational", "People", "Physical", "Technological"];

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRemainingControls(allControls, existingRows) {
  const existingControlSet = new Set((existingRows || []).map((r) => r.control));
  return allControls.filter((c) => !existingControlSet.has(c.control));
}

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

function DomainSectionHeader({ domain, count, isOpen, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left dark:border-white/10 dark:bg-navy-800"
    >
      <div>
        <div className="text-sm font-bold text-navy-700 dark:text-white">{domain}</div>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          {count} row{count !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="text-sm font-semibold text-brand-500">{isOpen ? "Hide" : "Show"}</div>
    </button>
  );
}

function SummaryCard({ label, value, tone = "default" }) {
  let cls =
    "border-gray-200 bg-white text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white";
  if (tone === "yes") {
    cls =
      "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-200";
  }
  if (tone === "conditional") {
    cls =
      "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200";
  }
  if (tone === "clarification") {
    cls =
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200";
  }
  if (tone === "no") {
    cls =
      "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200";
  }

  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="w-full">
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
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
  const [mode, setMode] = useState("lite");

  const [domainFilter, setDomainFilter] = useState("All");
  const [applicabilityFilter, setApplicabilityFilter] = useState("All");
  const [clarificationOnly, setClarificationOnly] = useState(false);

  const [openGroups, setOpenGroups] = useState({
    Organizational: true,
    People: true,
    Physical: true,
    Technological: true,
  });

  const [batchProgress, setBatchProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    percent: 0,
    message: "",
    failed: false,
  });

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();

    return rows.filter((r) => {
      const blob = `${r.standard} ${r.domain} ${r.clause} ${r.control} ${r.title} ${r.applicability} ${r.justification} ${(r.actionables || [])
        .map((a) => (typeof a === "string" ? a : a?.text || ""))
        .join(" ")} ${r.clarification_question || ""}`.toLowerCase();

      const matchesSearch = !s || blob.includes(s);
      const matchesDomain = domainFilter === "All" || r.domain === domainFilter;
      const matchesApplicability =
        applicabilityFilter === "All" || r.applicability === applicabilityFilter;
      const matchesClarification =
        !clarificationOnly || r.applicability === "Clarification Needed";

      return matchesSearch && matchesDomain && matchesApplicability && matchesClarification;
    });
  }, [rows, search, domainFilter, applicabilityFilter, clarificationOnly]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.applicability === "Yes") acc.yes += 1;
        else if (row.applicability === "Conditional") acc.conditional += 1;
        else if (row.applicability === "Clarification Needed") acc.clarification += 1;
        else if (row.applicability === "No") acc.no += 1;
        return acc;
      },
      { total: 0, yes: 0, conditional: 0, clarification: 0, no: 0 }
    );
  }, [filteredRows]);

  const groupedRows = useMemo(() => {
    const groups = {};
    DOMAIN_ORDER.forEach((d) => {
      groups[d] = [];
    });

    filteredRows.forEach((r) => {
      const key = DOMAIN_ORDER.includes(r.domain) ? r.domain : "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    return groups;
  }, [filteredRows]);

  const visibleDomains = useMemo(() => {
    const ordered = DOMAIN_ORDER.filter((d) => (groupedRows[d] || []).length > 0);
    const others = Object.keys(groupedRows).filter(
      (d) => !DOMAIN_ORDER.includes(d) && (groupedRows[d] || []).length > 0
    );
    return [...ordered, ...others];
  }, [groupedRows]);

  const toggleGroup = (domain) => {
    setOpenGroups((prev) => ({
      ...prev,
      [domain]: !prev[domain],
    }));
  };

  const normalizeUiRows = (output) => {
    return output.map((r) => ({
      id: `soa_${r.control}`,
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
  };

  const rebuildGroupState = (nextRows) => {
    const nextGroups = {};
    const discoveredDomains = new Set(nextRows.map((r) => r.domain).filter(Boolean));
    DOMAIN_ORDER.forEach((d) => {
      nextGroups[d] = true;
    });
    discoveredDomains.forEach((d) => {
      nextGroups[d] = true;
    });
    setOpenGroups(nextGroups);
  };

  const runFullGeneration = async ({ freshStart }) => {
    setError("");
    setSuccess("");

    if (!businessText.trim()) {
      setError("Please enter business function.");
      return;
    }

    setLoading(true);

    try {
      if (mode !== "full") {
        const res = await axios.post(`${API_BASE}/api/soa-lite/generate`, {
          businessText,
          mode,
        });

        const output = Array.isArray(res.data?.rows) ? res.data.rows : [];
        const normalized = normalizeUiRows(output);
        setRows(normalized);
        rebuildGroupState(normalized);
        setBatchProgress({
          active: false,
          current: 0,
          total: 0,
          percent: 0,
          message: "",
          failed: false,
        });
        return;
      }

      const baseRows = freshStart ? [] : rows;
      const controlsToRun = freshStart
        ? ISO27001_CONTROLS
        : getRemainingControls(ISO27001_CONTROLS, rows);

      if (!controlsToRun.length) {
        setSuccess("All controls are already generated.");
        setBatchProgress({
          active: true,
          current: 0,
          total: 0,
          percent: 100,
          message: "Nothing remaining to generate.",
          failed: false,
        });
        return;
      }

      if (freshStart) {
        setRows([]);
      }

      const batches = chunkArray(controlsToRun, 8);
      let accumulatedRows = [...baseRows];

      setBatchProgress({
        active: true,
        current: 0,
        total: batches.length,
        percent: 0,
        message: `Starting ${freshStart ? "full" : "remaining"} generation (0/${batches.length} batches)...`,
        failed: false,
      });

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        setBatchProgress({
          active: true,
          current: i,
          total: batches.length,
          percent: Math.round((i / batches.length) * 100),
          message: `Generating batch ${i + 1} of ${batches.length}...`,
          failed: false,
        });

        try {
          const res = await axios.post(`${API_BASE}/api/soa-lite/generate-batch`, {
            businessText,
            controlsBatch: batch,
          });

          const output = Array.isArray(res.data?.rows) ? res.data.rows : [];
          const normalizedBatch = normalizeUiRows(output);

          accumulatedRows = [...accumulatedRows, ...normalizedBatch];
          setRows(accumulatedRows);
          rebuildGroupState(accumulatedRows);

          setBatchProgress({
            active: true,
            current: i + 1,
            total: batches.length,
            percent: Math.round(((i + 1) / batches.length) * 100),
            message: `Completed ${i + 1} of ${batches.length} batches.`,
            failed: false,
          });

          if (i < batches.length - 1) {
            await sleep(5000);
          }
        } catch (batchError) {
          console.error("Batch failed:", batchError);

          const safeMessage =
            batchError?.response?.data?.details ||
            batchError?.response?.data?.error ||
            batchError?.message ||
            "Batch generation failed.";

          setBatchProgress({
            active: true,
            current: i,
            total: batches.length,
            percent: Math.round((i / batches.length) * 100),
            message: `Stopped at batch ${i + 1} of ${batches.length}.`,
            failed: true,
          });

          setError(safeMessage);
          setSuccess(
            accumulatedRows.length
              ? `Generated ${accumulatedRows.length} rows successfully before stopping. Use "Generate Remaining" to continue later.`
              : ""
          );

          return;
        }
      }

      setBatchProgress({
        active: true,
        current: batches.length,
        total: batches.length,
        percent: 100,
        message: freshStart
          ? "Full SoA generation completed."
          : "Remaining controls generated successfully.",
        failed: false,
      });

      setSuccess(
        freshStart
          ? "Full SoA generated successfully."
          : "Remaining controls generated successfully."
      );
    } catch (e) {
      console.error(e);
      setError(
        e?.response?.data?.details ||
          e?.response?.data?.error ||
          e?.message ||
          "Failed to generate SoA."
      );
    } finally {
      setLoading(false);
    }
  };

  const generateFresh = async () => {
    await runFullGeneration({ freshStart: true });
  };

  const generateRemaining = async () => {
    await runFullGeneration({ freshStart: false });
  };

  const saveCurrentSoA = async (businessName, overwrite = false) => {
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
      const res = await axios.post(`${API_BASE}/api/soa-records`, {
        businessName,
        businessText,
        rows,
        overwrite,
      });
  
      setSaveOpen(false);
      setSuccess(
        overwrite
          ? `SoA overwritten successfully for "${businessName}" (${res.data?.saved_row_count || rows.length} rows).`
          : `SoA saved successfully for "${businessName}" (${res.data?.saved_row_count || rows.length} rows).`
      );
    } catch (e) {
      console.error(e);
  
      if (e?.response?.status === 409) {
        const shouldOverwrite = window.confirm(
          `A saved SoA with the business name "${businessName}" already exists.\n\nDo you want to overwrite it?`
        );
  
        if (shouldOverwrite) {
          setSavingSoA(false);
          return saveCurrentSoA(businessName, true);
        }
      }
  
      setError(
        e?.response?.data?.details ||
        e?.response?.data?.error ||
        "Failed to save SoA."
      );
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
        const [text = "", type = "evidence_note", uploadFlag = "false"] = line
          .split("|")
          .map((x) => x.trim());

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
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">SoA Generator</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Generate SoA rows in lite or full mode, review them, and save them by business name.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <div className="w-full md:w-[220px]">
              <label className="mb-1 block text-sm font-medium text-navy-700 dark:text-white">
                Generation Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
              >
                <option value="lite">Lite (8 controls)</option>
                <option value="full">Full (93 controls)</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={generateFresh}
                disabled={loading}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                type="button"
              >
                {loading ? "Generating..." : "Generate Fresh"}
              </button>

              {mode === "full" && (
                <button
                  onClick={generateRemaining}
                  disabled={loading}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white disabled:opacity-50"
                  type="button"
                >
                  Generate Remaining
                </button>
              )}

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
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
          rows={7}
          placeholder="Describe the business function, systems, users, cloud/on-prem setup, data handled, access model, vendors, backups, incidents, logs, etc."
          value={businessText}
          onChange={(e) => setBusinessText(e.target.value)}
        />

        {batchProgress.active && mode === "full" && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              batchProgress.failed
                ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10"
                : "border-brand-200 bg-brand-50 dark:border-brand-500/20 dark:bg-brand-500/10"
            }`}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-navy-700 dark:text-white">
                  {batchProgress.failed
                    ? "Full generation stopped"
                    : loading
                    ? "Full generation in progress"
                    : "Full generation status"}
                </div>
                <div className="text-sm font-semibold text-brand-500">
                  {batchProgress.percent}%
                </div>
              </div>

              <ProgressBar percent={batchProgress.percent} />

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-300">
                <span>{batchProgress.message}</span>
                <span>
                  {batchProgress.current} / {batchProgress.total} batches
                </span>
              </div>
            </div>
          </div>
        )}

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
        <div className="mb-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <SummaryCard label="Total" value={summary.total} />
            <SummaryCard label="Yes" value={summary.yes} tone="yes" />
            <SummaryCard label="Conditional" value={summary.conditional} tone="conditional" />
            <SummaryCard label="Clarification Needed" value={summary.clarification} tone="clarification" />
            <SummaryCard label="No" value={summary.no} tone="no" />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
            >
              <option value="All">All Domains</option>
              <option value="Organizational">Organizational</option>
              <option value="People">People</option>
              <option value="Physical">Physical</option>
              <option value="Technological">Technological</option>
            </select>

            <select
              value={applicabilityFilter}
              onChange={(e) => setApplicabilityFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-navy-800 dark:text-white"
            >
              <option value="All">All Applicability</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Conditional">Conditional</option>
              <option value="Clarification Needed">Clarification Needed</option>
            </select>

            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white">
              <input
                type="checkbox"
                checked={clarificationOnly}
                onChange={(e) => setClarificationOnly(e.target.checked)}
              />
              Show only clarification needed
            </label>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDomainFilter("All");
                setApplicabilityFilter("All");
                setClarificationOnly(false);
              }}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {visibleDomains.length === 0 ? (
          <div className="rounded-xl border border-gray-200 px-4 py-6 text-sm text-gray-600 dark:border-white/10 dark:text-gray-300">
            No rows yet. Enter a business function and generate SoA.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleDomains.map((domain) => {
              const domainRows = groupedRows[domain] || [];
              const isOpen = openGroups[domain] !== false;

              return (
                <div key={domain} className="space-y-3">
                  <DomainSectionHeader
                    domain={domain}
                    count={domainRows.length}
                    isOpen={isOpen}
                    onToggle={() => toggleGroup(domain)}
                  />

                  {isOpen && (
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
                          {domainRows.map((r) => {
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
                        </tbody>
                      </table>
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
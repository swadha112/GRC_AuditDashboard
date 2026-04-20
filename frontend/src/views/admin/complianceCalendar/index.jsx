import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";
import {
  MdOutlineCalendarMonth,
  MdOutlineSchedule,
  MdOutlinePendingActions,
  MdOutlineCheckCircle,
  MdOutlineWarningAmber,
  MdOutlineBusiness,
  MdOutlineDomain,
  MdAdd,
  MdClose,
  MdEdit,
  MdVisibility,
  MdChevronLeft,
  MdChevronRight,
  MdDeleteOutline,
  MdCheckCircle,
} from "react-icons/md";

const API_BASE = "http://localhost:5001";

const STATUS_OPTIONS = ["upcoming", "in_progress", "completed", "overdue"];
const FREQUENCY_OPTIONS = ["monthly", "quarterly", "half_yearly", "annually", "custom"];

const STATUS_STYLE = {
  upcoming:    { badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",    dot: "bg-blue-500" },
  in_progress: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-500" },
  completed:   { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", dot: "bg-emerald-500" },
  overdue:     { badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",         dot: "bg-red-500" },
};

const STAT_ICON_COLORS = {
  total:       "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200",
  upcoming:    "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
  completed:   "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  overdue:     "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300",
  enterprise:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  business:    "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-300",
};

function StatusBadge({ value }) {
  const v = (value || "").toLowerCase();
  const s = STATUS_STYLE[v] || { badge: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${s.badge}`}>
      {v.replace("_", " ")}
    </span>
  );
}

function SummaryCard({ label, value, icon, colorKey }) {
  const color = STAT_ICON_COLORS[colorKey] || "bg-gray-100 text-gray-500";
  return (
    <Card className="rounded-2xl p-4 dark:bg-navy-800">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-navy-700 dark:text-white">{value ?? 0}</p>
        </div>
      </div>
    </Card>
  );
}

// ── Custom functional calendar ──────────────────────────────────────────────
const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function ComplianceCalendarView({ items, selectedDate, onDateSelect }) {
  const [viewDate, setViewDate] = useState(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const dateMap = useMemo(() => {
    const m = new Map();
    items.forEach((item) => {
      if (!item.next_due_date) return;
      const key = item.next_due_date.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(item);
    });
    return m;
  }, [items]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const getPriorityDot = (dayItems) => {
    if (!dayItems?.length) return null;
    const s = dayItems.map((i) => i.status);
    if (s.includes("overdue")) return "bg-red-500";
    if (s.includes("in_progress")) return "bg-amber-500";
    if (s.includes("upcoming")) return "bg-blue-500";
    return "bg-emerald-500";
  };

  const monthLabel = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <MdChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold text-navy-700 dark:text-white">{monthLabel}</span>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <MdChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-semibold text-gray-400">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`pre-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayItems = dateMap.get(dateKey);
          const dot = getPriorityDot(dayItems);
          const isToday = dateKey === today;
          const isSelected = selectedDate === dateKey;

          return (
            <button
              key={dateKey}
              onClick={() => onDateSelect(isSelected ? null : dateKey)}
              title={dayItems?.map((x) => x.title).join(", ")}
              className={`flex flex-col items-center justify-center rounded-lg py-1.5 text-xs font-medium transition
                ${isSelected
                  ? "bg-brand-500 text-white"
                  : isToday
                  ? "bg-brand-50 text-brand-600 font-bold dark:bg-brand-500/10 dark:text-brand-300"
                  : "text-navy-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10"
                }`}
            >
              {day}
              {dot && (
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : dot}`} />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {[
          ["bg-red-500", "Overdue"],
          ["bg-blue-500", "Upcoming"],
          ["bg-amber-500", "In Progress"],
          ["bg-emerald-500", "Completed"],
        ].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className={`h-2 w-2 rounded-full ${c}`} />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
const modalAnimStyle = {
  animation: "ccModalIn 0.18s cubic-bezier(0.16,1,0.3,1) both",
};
const modalOverlayStyle = {
  animation: "ccFadeIn 0.15s ease both",
};

if (typeof document !== "undefined" && !document.getElementById("cc-modal-keyframes")) {
  const s = document.createElement("style");
  s.id = "cc-modal-keyframes";
  s.textContent = `
    @keyframes ccModalIn  { from { opacity:0; transform:scale(0.95) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes ccFadeIn   { from { opacity:0; } to { opacity:1; } }
    @keyframes ccSlideDown{ from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(s);
}

function Modal({ open, onClose, title, children, maxWidth = "max-w-2xl" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        style={modalOverlayStyle}
        onClick={onClose}
      />
      <div
        style={modalAnimStyle}
        className={`relative z-10 w-full ${maxWidth} max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-navy-800`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 dark:border-white/10 dark:bg-navy-800">
          <h3 className="text-lg font-bold text-navy-700 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Form inside modal ───────────────────────────────────────────────────────
const INPUT_CLS =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-navy-700 outline-none focus:border-brand-400 focus:bg-white transition dark:border-white/10 dark:bg-navy-900 dark:text-white dark:focus:bg-navy-800";
const LABEL_CLS = "mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide";

function ActivityForm({ form, setForm, businesses, saving, onSave, onCancel, editingId }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={LABEL_CLS}>Title *</label>
        <input
          placeholder="e.g. Quarterly Access Review"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Description</label>
        <textarea
          rows={2}
          placeholder="Brief description of this activity..."
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          className={INPUT_CLS}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Scope *</label>
          <select
            value={form.scope_type}
            onChange={(e) => setForm((p) => ({ ...p, scope_type: e.target.value, soa_record_id: "" }))}
            className={INPUT_CLS}
          >
            <option value="enterprise">Enterprise</option>
            <option value="business">Business</option>
          </select>
        </div>

        {form.scope_type === "business" ? (
          <div>
            <label className={LABEL_CLS}>Business *</label>
            <select
              value={form.soa_record_id}
              onChange={(e) => setForm((p) => ({ ...p, soa_record_id: e.target.value }))}
              className={INPUT_CLS}
            >
              <option value="">Select business</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.business_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className={LABEL_CLS}>Standard</label>
            <input
              placeholder="ISO 27001:2022"
              value={form.standard}
              onChange={(e) => setForm((p) => ({ ...p, standard: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {form.scope_type === "business" && (
          <div>
            <label className={LABEL_CLS}>Standard</label>
            <input
              placeholder="ISO 27001:2022"
              value={form.standard}
              onChange={(e) => setForm((p) => ({ ...p, standard: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>
        )}
        <div>
          <label className={LABEL_CLS}>Clause</label>
          <input
            placeholder="e.g. 9.2"
            value={form.clause}
            onChange={(e) => setForm((p) => ({ ...p, clause: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Control</label>
          <input
            placeholder="e.g. A.9.2.1"
            value={form.control}
            onChange={(e) => setForm((p) => ({ ...p, control: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Frequency *</label>
          <select
            value={form.frequency}
            onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
            className={INPUT_CLS}
          >
            {FREQUENCY_OPTIONS.map((x) => (
              <option key={x} value={x}>
                {x.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLS}>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className={INPUT_CLS}
          >
            {STATUS_OPTIONS.map((x) => (
              <option key={x} value={x}>
                {x.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Owner Name *</label>
          <input
            placeholder="Jane Smith"
            value={form.owner_name}
            onChange={(e) => setForm((p) => ({ ...p, owner_name: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Owner Email</label>
          <input
            type="email"
            placeholder="jane@company.com"
            value={form.owner_email}
            onChange={(e) => setForm((p) => ({ ...p, owner_email: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Start Date *</label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Next Due Date *</label>
          <input
            type="date"
            value={form.next_due_date}
            onChange={(e) => setForm((p) => ({ ...p, next_due_date: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>Remarks</label>
        <textarea
          rows={2}
          placeholder="Optional notes..."
          value={form.remarks}
          onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
          className={INPUT_CLS}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-navy-700 dark:text-white">
        <input
          type="checkbox"
          checked={form.evidence_required}
          onChange={(e) => setForm((p) => ({ ...p, evidence_required: e.target.checked }))}
          className="h-4 w-4 rounded accent-brand-500"
        />
        <span>Evidence required for completion</span>
      </label>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition"
          type="button"
        >
          {saving ? "Saving…" : editingId ? "Update Activity" : "Create Activity"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5 transition"
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Detail modal content ────────────────────────────────────────────────────
function DetailContent({ item, businessMap, onComplete, onEdit, onDelete, completing }) {
  const scopeLabel =
    item.scope_type === "enterprise"
      ? "Enterprise"
      : businessMap.get(String(item.soa_record_id)) || "Business";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge value={item.status} />
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300 capitalize">
          {item.frequency?.replace("_", " ")}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
          {scopeLabel}
        </span>
      </div>

      {item.description && (
        <p className="text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 p-4 dark:border-white/10">
        {[
          ["Owner", item.owner_name],
          ["Email", item.owner_email || "—"],
          ["Standard", item.standard || "—"],
          ["Clause", item.clause || "—"],
          ["Control", item.control || "—"],
          ["Evidence Req.", item.evidence_required ? "Yes" : "No"],
          ["Start Date", item.start_date?.slice(0, 10)],
          ["Next Due", item.next_due_date?.slice(0, 10)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{k}</p>
            <p className="mt-0.5 text-sm text-navy-700 dark:text-white">{v}</p>
          </div>
        ))}
      </div>

      {item.remarks && (
        <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
          <span className="font-semibold text-navy-700 dark:text-white">Remarks: </span>
          {item.remarks}
        </div>
      )}

      <div>
        <h4 className="mb-3 text-sm font-bold text-navy-700 dark:text-white">Run History</h4>
        {!item.runs?.length ? (
          <p className="text-sm text-gray-500">No run history yet.</p>
        ) : (
          <div className="space-y-2">
            {item.runs.map((run) => (
              <div
                key={run.id}
                className="flex items-start justify-between rounded-xl border border-gray-100 px-4 py-3 dark:border-white/10"
              >
                <div>
                  <p className="text-sm font-semibold text-navy-700 dark:text-white">{run.period_label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Due: {run.due_date?.slice(0, 10)}
                    {run.completed_on ? ` · Completed: ${run.completed_on.slice(0, 10)}` : ""}
                  </p>
                  {run.evidence_note && (
                    <p className="mt-1 text-xs text-gray-500">{run.evidence_note}</p>
                  )}
                </div>
                <StatusBadge value={run.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-white/10">
        <button
          onClick={onComplete}
          disabled={completing || item.status === "completed"}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition"
        >
          <MdCheckCircle className="h-4 w-4" />
          {completing ? "Marking…" : "Mark Complete"}
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5 transition"
        >
          <MdEdit className="h-4 w-4" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 transition"
        >
          <MdDeleteOutline className="h-4 w-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ title, subtitle }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
      <p className="font-semibold text-navy-700 dark:text-white">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  );
}

// ── Default form ─────────────────────────────────────────────────────────────
const emptyForm = {
  title: "",
  description: "",
  scope_type: "enterprise",
  soa_record_id: "",
  standard: "ISO 27001:2022",
  clause: "",
  control: "",
  frequency: "quarterly",
  owner_name: "",
  owner_email: "",
  start_date: "",
  next_due_date: "",
  status: "upcoming",
  evidence_required: false,
  remarks: "",
};

// ── Main component ───────────────────────────────────────────────────────────
export default function ComplianceCalendar() {
  const [items, setItems] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [summary, setSummary] = useState(null);

  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);

  const [filters, setFilters] = useState({
    scope_type: "all",
    soa_record_id: "",
    status: "all",
    owner_name: "",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadBusinesses();
    loadCalendar();
    loadSummary();
  }, []);

  useEffect(() => {
    loadCalendar();
  }, [filters]);

  const businessMap = useMemo(() => {
    const m = new Map();
    businesses.forEach((b) => m.set(String(b.id), b.business_name));
    return m;
  }, [businesses]);

  const displayedItems = useMemo(() => {
    if (!selectedDate) return items;
    return items.filter((i) => i.next_due_date?.slice(0, 10) === selectedDate);
  }, [items, selectedDate]);

  const upcomingItems = useMemo(
    () =>
      [...items]
        .filter((i) => i.status === "upcoming" || i.status === "overdue")
        .sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))
        .slice(0, 5),
    [items]
  );

  const loadBusinesses = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/soa-records`);
      setBusinesses(res.data?.records || []);
    } catch {}
  };

  const loadCalendar = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (filters.scope_type !== "all") params.scope_type = filters.scope_type;
      if (filters.soa_record_id) params.soa_record_id = filters.soa_record_id;
      if (filters.status !== "all") params.status = filters.status;
      if (filters.owner_name.trim()) params.owner_name = filters.owner_name.trim();

      const res = await axios.get(`${API_BASE}/api/compliance-calendar`, { params });
      setItems(res.data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load calendar items.");
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/compliance-calendar/dashboard/summary`);
      setSummary(res.data?.summary || null);
    } catch {}
  };

  const loadItemDetail = async (id) => {
    try {
      const res = await axios.get(`${API_BASE}/api/compliance-calendar/${id}`);
      setSelectedItem(res.data);
      setShowDetailModal(true);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load item detail.");
    }
  };

  const openCreate = (prefillDate = null) => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      next_due_date: prefillDate || "",
      start_date: prefillDate || "",
    });
    setShowFormModal(true);
  };

  const updateItemStatus = async (id, newStatus) => {
    try {
      await axios.patch(`${API_BASE}/api/compliance-calendar/${id}`, { status: newStatus });
      await loadCalendar();
      await loadSummary();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to update status.");
    }
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setShowDetailModal(false);
    setForm({
      title: item.title || "",
      description: item.description || "",
      scope_type: item.scope_type || "enterprise",
      soa_record_id: item.soa_record_id ? String(item.soa_record_id) : "",
      standard: item.standard || "ISO 27001:2022",
      clause: item.clause || "",
      control: item.control || "",
      frequency: item.frequency || "quarterly",
      owner_name: item.owner_name || "",
      owner_email: item.owner_email || "",
      start_date: item.start_date ? String(item.start_date).slice(0, 10) : "",
      next_due_date: item.next_due_date ? String(item.next_due_date).slice(0, 10) : "",
      status: item.status || "upcoming",
      evidence_required: Boolean(item.evidence_required),
      remarks: item.remarks || "",
    });
    setShowFormModal(true);
  };

  const saveItem = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.owner_name.trim()) throw new Error("Owner name is required.");
      if (!form.start_date || !form.next_due_date) throw new Error("Start and due dates are required.");
      if (form.scope_type === "business" && !form.soa_record_id) throw new Error("Select a business.");

      const payload = {
        ...form,
        soa_record_id: form.scope_type === "business" ? Number(form.soa_record_id) : null,
      };

      if (editingId) {
        await axios.patch(`${API_BASE}/api/compliance-calendar/${editingId}`, payload);
        setSuccess("Activity updated.");
      } else {
        await axios.post(`${API_BASE}/api/compliance-calendar`, payload);
        setSuccess("Activity created.");
      }

      setShowFormModal(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadCalendar();
      await loadSummary();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Delete this calendar item?")) return;
    try {
      await axios.delete(`${API_BASE}/api/compliance-calendar/${id}`);
      setShowDetailModal(false);
      setSelectedItem(null);
      setSuccess("Activity deleted.");
      await loadCalendar();
      await loadSummary();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to delete.");
    }
  };

  const completeItem = async (id) => {
    setCompleting(true);
    setError("");
    setSuccess("");
    try {
      await axios.post(`${API_BASE}/api/compliance-calendar/${id}/complete`, {
        period_label: "Current Cycle",
      });
      setSuccess("Marked complete. Next cycle auto-scheduled.");
      await loadCalendar();
      await loadSummary();
      await loadItemDetail(id);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to complete.");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Page header — no title here since layout breadcrumb already shows it */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Plan and track enterprise-wide and business-specific compliance activities.
        </p>
        <button
          onClick={() => openCreate()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
          type="button"
        >
          <MdAdd className="h-5 w-5" />
          Create Activity
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ animation: "ccSlideDown 0.2s ease both" }} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div style={{ animation: "ccSlideDown 0.2s ease both" }} className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
          {success}
        </div>
      )}

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
          <SummaryCard label="Total" value={summary.total} icon={<MdOutlineCalendarMonth className="h-6 w-6" />} colorKey="total" />
          <SummaryCard label="Upcoming" value={summary.upcoming} icon={<MdOutlineSchedule className="h-6 w-6" />} colorKey="upcoming" />
          <SummaryCard label="In Progress" value={summary.in_progress} icon={<MdOutlinePendingActions className="h-6 w-6" />} colorKey="in_progress" />
          <SummaryCard label="Completed" value={summary.completed} icon={<MdOutlineCheckCircle className="h-6 w-6" />} colorKey="completed" />
          <SummaryCard label="Overdue" value={summary.overdue} icon={<MdOutlineWarningAmber className="h-6 w-6" />} colorKey="overdue" />
          <SummaryCard label="Enterprise" value={summary.enterprise} icon={<MdOutlineDomain className="h-6 w-6" />} colorKey="enterprise" />
          <SummaryCard label="Business" value={summary.business} icon={<MdOutlineBusiness className="h-6 w-6" />} colorKey="business" />
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">

        {/* Left column */}
        <div className="flex flex-col gap-5">
          {/* Functional calendar */}
          <Card className="rounded-2xl p-5 dark:bg-navy-800">
            <div className="mb-4">
              <h3 className="text-base font-bold text-navy-700 dark:text-white">Calendar View</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {selectedDate
                  ? `Filtered to ${selectedDate} — click again to clear`
                  : "Click a date to filter items"}
              </p>
            </div>
            <ComplianceCalendarView
              items={items}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
            {selectedDate && (
              <button
                onClick={() => openCreate(selectedDate)}
                className="mt-3 w-full rounded-xl border border-dashed border-brand-400 py-2 text-xs font-semibold text-brand-500 hover:bg-brand-50 dark:border-brand-400/40 dark:hover:bg-brand-500/10 transition"
                style={{ animation: "ccSlideDown 0.15s ease both" }}
                type="button"
              >
                + Create activity for {selectedDate}
              </button>
            )}
          </Card>

          {/* Upcoming focus */}
          <Card className="rounded-2xl p-5 dark:bg-navy-800">
            <h3 className="mb-4 text-base font-bold text-navy-700 dark:text-white">Upcoming Focus</h3>
            {upcomingItems.length === 0 ? (
              <EmptyState title="No upcoming items" subtitle="Your nearest due tasks will appear here." />
            ) : (
              <div className="space-y-2">
                {upcomingItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadItemDetail(item.id)}
                    className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-left transition hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">{item.title}</p>
                      <StatusBadge value={item.status} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Due {item.next_due_date?.slice(0, 10)} · {item.frequency?.replace("_", " ")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column — items list */}
        <Card className="rounded-2xl p-5 dark:bg-navy-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-navy-700 dark:text-white">
                Calendar Items
                {selectedDate && (
                  <span className="ml-2 text-sm font-normal text-brand-500">
                    — {selectedDate}
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="ml-1 text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {displayedItems.length} {displayedItems.length === 1 ? "item" : "items"}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <select
              value={filters.scope_type}
              onChange={(e) => setFilters((p) => ({ ...p, scope_type: e.target.value }))}
              className={INPUT_CLS}
            >
              <option value="all">All Scope</option>
              <option value="enterprise">Enterprise</option>
              <option value="business">Business</option>
            </select>

            <select
              value={filters.soa_record_id}
              onChange={(e) => setFilters((p) => ({ ...p, soa_record_id: e.target.value }))}
              className={INPUT_CLS}
            >
              <option value="">All Businesses</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.business_name}</option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
              className={INPUT_CLS}
            >
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map((x) => (
                <option key={x} value={x}>{x.replace("_", " ")}</option>
              ))}
            </select>

            <input
              placeholder="Search owner…"
              value={filters.owner_name}
              onChange={(e) => setFilters((p) => ({ ...p, owner_name: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
          ) : displayedItems.length === 0 ? (
            <EmptyState
              title="No calendar items found"
              subtitle="Adjust filters or create your first compliance activity."
            />
          ) : (
            <div className="space-y-3">
              {displayedItems.map((item) => {
                const scopeLabel =
                  item.scope_type === "enterprise"
                    ? "Enterprise"
                    : businessMap.get(String(item.soa_record_id)) || "Business";
                const dotStyle = STATUS_STYLE[item.status]?.dot || "bg-gray-400";

                return (
                  <div
                    key={item.id}
                    className="group rounded-2xl border border-gray-100 bg-white p-4 transition hover:shadow-md dark:border-white/10 dark:bg-navy-900"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dotStyle}`} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-navy-700 dark:text-white">
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {scopeLabel} · {item.frequency?.replace("_", " ")} · Due{" "}
                            <strong className="text-navy-700 dark:text-gray-200">
                              {item.next_due_date?.slice(0, 10)}
                            </strong>
                          </p>
                          {(item.control || item.owner_name) && (
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                              {[item.control && `Control: ${item.control}`, item.owner_name && `Owner: ${item.owner_name}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={item.status}
                          onChange={(e) => updateItemStatus(item.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className={`cursor-pointer rounded-full border-0 py-0.5 pl-2.5 pr-6 text-xs font-semibold capitalize outline-none transition
                            ${STATUS_STYLE[item.status]?.badge || "bg-gray-100 text-gray-600"}`}
                          title="Change status"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s.replace("_", " ")}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => loadItemDetail(item.id)}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10 transition"
                          title="View details"
                        >
                          <MdVisibility className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEdit(item)}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10 transition"
                          title="Edit"
                        >
                          <MdEdit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => completeItem(item.id)}
                          disabled={completing || item.status === "completed"}
                          className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition"
                          title="Mark complete"
                        >
                          <MdCheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="rounded-lg border border-red-100 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10 transition"
                          title="Delete"
                        >
                          <MdDeleteOutline className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={showFormModal}
        onClose={() => { setShowFormModal(false); setEditingId(null); setForm(emptyForm); }}
        title={editingId ? "Edit Activity" : "Create Activity"}
      >
        <ActivityForm
          form={form}
          setForm={setForm}
          businesses={businesses}
          saving={saving}
          onSave={saveItem}
          onCancel={() => { setShowFormModal(false); setEditingId(null); setForm(emptyForm); }}
          editingId={editingId}
        />
      </Modal>

      {/* Detail modal */}
      <Modal
        open={showDetailModal && !!selectedItem}
        onClose={() => { setShowDetailModal(false); setSelectedItem(null); }}
        title={selectedItem?.title || "Activity Detail"}
      >
        {selectedItem && (
          <DetailContent
            item={selectedItem}
            businessMap={businessMap}
            completing={completing}
            onComplete={() => completeItem(selectedItem.id)}
            onEdit={() => openEdit(selectedItem)}
            onDelete={() => deleteItem(selectedItem.id)}
          />
        )}
      </Modal>
    </div>
  );
}

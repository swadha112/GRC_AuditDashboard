import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";
import {
  MdOutlineFolderOpen,
  MdOutlineChecklist,
  MdOutlineFactCheck,
  MdOutlineAssignmentTurnedIn,
  MdOutlineHelpOutline,
  MdOutlineWarningAmber,
  MdRefresh,
  MdOutlineShield,
  MdOutlineVerified,
  MdOutlineAccessTime,
} from "react-icons/md";
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiQuestionMarkCircle,
} from "react-icons/hi2";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const API_BASE = "http://localhost:5001";
const DOMAIN_ORDER = ["Organizational", "People", "Physical", "Technological"];

const PALETTE = {
  brand: "#4318FF",
  cyan: "#6AD2FF",
  green: "#01B574",
  yellow: "#FFB547",
  red: "#EE5D50",
};

const DOMAIN_COLORS = ["#4318FF", "#17c1e8", "#FFB547", "#01B574"];

function hasMissingEvidence(row) {
  return (row.actionables || []).some(
    (a) => a.upload_required && (!a.files || a.files.length === 0)
  );
}

/* ─── Animated counter ─── */
function useCountUp(target, duration = 900, active = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    setValue(0);
    if (!target) { setValue(0); return; }
    let start;
    let raf;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setValue(Math.round(p * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return value;
}

/* ─── Ring progress (SVG) ─── */
function RingProgress({ pct, size = 140, stroke = 14 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const ringColor = pct >= 80 ? PALETTE.green : pct >= 50 ? PALETTE.yellow : PALETTE.red;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(163,174,208,0.18)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-navy-700 dark:text-white">{pct}%</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Score</span>
      </div>
    </div>
  );
}

/* ─── Skeleton card ─── */
function SkeletonCard() {
  return (
    <Card className="rounded-[20px] p-5 dark:bg-navy-800">
      <div className="flex animate-pulse items-center gap-4">
        <div className="h-14 w-14 shrink-0 rounded-2xl bg-gray-100 dark:bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-gray-100 dark:bg-white/5" />
          <div className="h-7 w-14 rounded bg-gray-100 dark:bg-white/5" />
        </div>
      </div>
    </Card>
  );
}

/* ─── Stat card ─── */
function StatCard({ icon, title, value, subtitle, accent, numColor, delay = 0, loaded }) {
  const animated = useCountUp(value, 900, loaded);
  return (
    <Card
      className="group cursor-default rounded-[20px] p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:bg-navy-800"
      style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(12px)", transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms, box-shadow 0.2s ease` }}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[22px] transition-transform duration-300 group-hover:scale-110 ${accent}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <h3
            className="text-3xl font-bold text-navy-700 dark:text-white"
            style={numColor ? { color: numColor } : undefined}
          >
            {animated}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ─── Chart card wrapper ─── */
function ChartCard({ title, subtitle, badge, live = false, children, className = "" }) {
  return (
    <Card className={`rounded-[20px] p-6 shadow-sm dark:bg-navy-800 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xl font-bold text-navy-700 dark:text-white">{title}</h4>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        {badge && (
          <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${live ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400" : "bg-lightPrimary text-brand-500 dark:bg-white/5 dark:text-gray-300"}`}>
            {live && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
            )}
            {badge}
          </div>
        )}
      </div>
      {children}
    </Card>
  );
}

/* ─── Custom tooltip ─── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-xl dark:border-white/10 dark:bg-navy-700">
      {label && (
        <div className="mb-1.5 text-sm font-semibold text-navy-700 dark:text-white">{label}</div>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: entry.color || entry.fill || entry.payload?.color }}
          />
          <span className="text-gray-500 dark:text-gray-400">{entry.name}:</span>
          <span className="font-semibold text-navy-700 dark:text-white">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Custom legend pill row ─── */
function LegendRow({ items }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
      {items.map(({ name, color, value }) => (
        <div key={name} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {name}
          {value !== undefined && (
            <span className="font-bold" style={{ color }}>{value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════════════════════ */
export default function MainDashboard() {
  const [fullRecords, setFullRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setLoaded(false);
    setError("");
    try {
      const listRes = await axios.get(`${API_BASE}/api/soa-records`);
      const basic = listRes.data?.records || [];
      const detailed = await Promise.all(
        basic.map(async (r) => {
          const res = await axios.get(`${API_BASE}/api/soa-records/${r.id}`);
          return res.data;
        })
      );
      setFullRecords(detailed);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
      setError(
        e?.response?.data?.details ||
          e?.response?.data?.error ||
          "Failed to load dashboard data."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      setTimeout(() => setLoaded(true), 80);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const data = useMemo(() => {
    const allRows = fullRecords.flatMap((r) => r.rows || []);
    const app = { Yes: 0, No: 0, Conditional: 0, "Clarification Needed": 0 };
    const dom = { Organizational: 0, People: 0, Physical: 0, Technological: 0 };
    let missing = 0;
    let complete = 0;

    allRows.forEach((row) => {
      const a = row.applicability || "Clarification Needed";
      if (app[a] !== undefined) app[a]++;
      if (dom[row.domain] !== undefined) dom[row.domain]++;
      if (hasMissingEvidence(row)) missing++;
      else complete++;
    });

    const total = allRows.length;
    const completionPct = total ? Math.round((complete / total) * 100) : 0;

    const pieData = [
      { name: "Applicable", value: app.Yes, color: PALETTE.green },
      { name: "Not Applicable", value: app.No, color: PALETTE.red },
      { name: "Conditional", value: app.Conditional, color: PALETTE.yellow },
      { name: "Needs Clarification", value: app["Clarification Needed"], color: PALETTE.cyan },
    ].filter((d) => d.value > 0);

    const domainData = DOMAIN_ORDER.map((d, i) => ({
      domain: d,
      short: d.slice(0, 4) + ".",
      count: dom[d] || 0,
      color: DOMAIN_COLORS[i],
    }));

    const recent = fullRecords
      .map((rec) => {
        const rows = rec.rows || [];
        const t = rows.length;
        const m = rows.filter(hasMissingEvidence).length;
        const pct = t ? Math.round(((t - m) / t) * 100) : 0;
        return { id: rec.id, business_name: rec.business_name, total: t, missing: m, pct, updated_at: rec.updated_at };
      })
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5);

    return {
      totalSoAs: fullRecords.length,
      totalRows: total,
      yes: app.Yes,
      no: app.No,
      conditional: app.Conditional,
      clarification: app["Clarification Needed"],
      missing,
      completionPct,
      pieData,
      domainData,
      recent,
      complete,
    };
  }, [fullRecords]);

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="mt-5 space-y-5">
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="h-[400px] animate-pulse rounded-[20px] p-6 dark:bg-navy-800">
              <div className="space-y-3">
                <div className="h-5 w-44 rounded bg-gray-100 dark:bg-white/5" />
                <div className="h-3 w-64 rounded bg-gray-100 dark:bg-white/5" />
                <div className="mt-8 h-64 rounded-xl bg-gray-100 dark:bg-white/5" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const scoreLabel = data.completionPct >= 80 ? "Excellent" : data.completionPct >= 50 ? "Moderate" : "At Risk";
  const scoreBadgeClass = data.completionPct >= 80
    ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
    : data.completionPct >= 50
    ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400"
    : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400";

  return (
    <div className="mt-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
            <MdOutlineShield className="text-xl" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-navy-700 dark:text-white">
              GRC Audit Dashboard
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ISO 27001 Statement of Applicability — live overview
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastRefresh && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <MdOutlineAccessTime />
              {lastRefresh.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl bg-lightPrimary px-4 py-2 text-sm font-semibold text-brand-500 transition-all hover:bg-brand-50 disabled:opacity-60 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            <MdRefresh className={`text-base ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <HiExclamationCircle className="mt-0.5 shrink-0 text-base" />
          {error}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard loaded={loaded} delay={0}
          icon={<MdOutlineFolderOpen />}
          title="Saved SoAs"
          value={data.totalSoAs}
          accent="bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
        />
        <StatCard loaded={loaded} delay={70}
          icon={<MdOutlineChecklist />}
          title="Total Controls"
          value={data.totalRows}
          accent="bg-lightPrimary text-navy-700 dark:bg-white/5 dark:text-white"
        />
        <StatCard loaded={loaded} delay={140}
          icon={<MdOutlineFactCheck />}
          title="Applicable"
          value={data.yes}
          numColor={PALETTE.green}
          accent="bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400"
        />
        <StatCard loaded={loaded} delay={210}
          icon={<MdOutlineAssignmentTurnedIn />}
          title="Conditional"
          value={data.conditional}
          numColor={PALETTE.yellow}
          accent="bg-yellow-50 text-yellow-500 dark:bg-yellow-500/15 dark:text-yellow-300"
        />
        <StatCard loaded={loaded} delay={280}
          icon={<MdOutlineHelpOutline />}
          title="Needs Clarify"
          value={data.clarification}
          numColor={PALETTE.cyan}
          accent="bg-cyan-50 text-cyan-500 dark:bg-cyan-500/15 dark:text-cyan-400"
        />
        <StatCard loaded={loaded} delay={350}
          icon={<MdOutlineWarningAmber />}
          title="Missing Evidence"
          value={data.missing}
          subtitle={`${data.completionPct}% complete`}
          numColor={PALETTE.red}
          accent="bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* Donut — Applicability */}
        <ChartCard
          title="Applicability Breakdown"
          subtitle="Distribution across all SoA controls"
          badge="Live"
          live
        >
          <div className="relative h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <filter id="pieShadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity="0.14" />
                  </filter>
                </defs>
                <Pie
                  data={data.pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={72}
                  outerRadius={116}
                  paddingAngle={3}
                  stroke="none"
                  animationDuration={1100}
                  animationEasing="ease-out"
                >
                  {data.pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} filter="url(#pieShadow)" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Donut center */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-navy-700 dark:text-white">
                {data.totalRows}
              </span>
              <span className="text-xs font-medium text-gray-400">Controls</span>
            </div>
          </div>
          <LegendRow
            items={data.pieData.map((d) => ({ name: d.name, color: d.color, value: d.value }))}
          />
        </ChartCard>

        {/* Bar — Domain distribution */}
        <ChartCard
          title="Controls by Domain"
          subtitle="ISO 27001 domain-wise spread"
          badge="ISO 27001"
        >
          <div className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.domainData} barCategoryGap="38%" margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  {DOMAIN_COLORS.map((c, i) => (
                    <linearGradient key={i} id={`dg${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.3} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(163,174,208,0.14)"
                />
                <XAxis
                  dataKey="domain"
                  tick={{ fill: "#A3AED0", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#A3AED0", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(163,174,208,0.07)", radius: 8 }} />
                <Bar
                  dataKey="count"
                  name="Controls"
                  radius={[10, 10, 0, 0]}
                  animationDuration={1100}
                  animationEasing="ease-out"
                >
                  {data.domainData.map((_, i) => (
                    <Cell key={i} fill={`url(#dg${i})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <LegendRow
            items={DOMAIN_ORDER.map((d, i) => ({ name: d, color: DOMAIN_COLORS[i] }))}
          />
        </ChartCard>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">

        {/* Recent SoAs table */}
        <ChartCard
          title="Recent SoAs"
          subtitle="Latest business functions by completion status"
          badge="Recent"
          className="xl:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  {["Business Function", "Controls", "Missing", "Progress", "Updated"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent.map((rec) => {
                  const barColor =
                    rec.pct >= 80 ? PALETTE.green : rec.pct >= 50 ? PALETTE.yellow : PALETTE.red;
                  return (
                    <tr
                      key={rec.id}
                      className="group border-b border-gray-50 transition-colors duration-150 last:border-0 hover:bg-gray-50/60 dark:border-white/5 dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-lightPrimary dark:bg-white/5">
                            <MdOutlineFolderOpen className="text-sm text-brand-500 dark:text-white" />
                          </div>
                          <span className="max-w-[160px] truncate text-sm font-semibold text-navy-700 dark:text-white">
                            {rec.business_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                        {rec.total}
                      </td>
                      <td className="px-3 py-3.5">
                        {rec.missing > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
                            <HiExclamationCircle className="text-[11px]" />
                            {rec.missing}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-500/10 dark:text-green-400">
                            <HiCheckCircle className="text-[11px]" />
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                            <div
                              className="h-full rounded-full transition-all duration-1000"
                              style={{
                                width: `${rec.pct}%`,
                                background: `linear-gradient(90deg, ${barColor}, ${PALETTE.cyan})`,
                              }}
                            />
                          </div>
                          <span
                            className="min-w-[32px] text-xs font-bold"
                            style={{ color: barColor }}
                          >
                            {rec.pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-gray-400 dark:text-gray-500">
                        {rec.updated_at
                          ? new Date(rec.updated_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}

                {data.recent.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-sm text-gray-400 dark:text-gray-500"
                    >
                      No saved SoAs yet — generate one to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        {/* Compliance score card */}
        <ChartCard
          title="Compliance Score"
          subtitle="Evidence coverage snapshot"
        >
          {/* Score label badge */}
          <div className="mb-4 flex justify-center">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold ${scoreBadgeClass}`}>
              <MdOutlineVerified className="text-base" />
              {scoreLabel}
            </span>
          </div>

          <div className="flex justify-center">
            <RingProgress pct={data.completionPct} size={148} stroke={14} />
          </div>

          <div className="mt-5 space-y-2.5">
            {[
              {
                icon: <HiCheckCircle className="text-green-500" />,
                label: "Complete Controls",
                value: data.complete,
                bg: "bg-green-50 dark:bg-green-500/10",
                valColor: PALETTE.green,
              },
              {
                icon: <HiExclamationCircle className="text-red-500" />,
                label: "Missing Evidence",
                value: data.missing,
                bg: "bg-red-50 dark:bg-red-500/10",
                valColor: PALETTE.red,
              },
              {
                icon: <HiQuestionMarkCircle className="text-cyan-500" />,
                label: "Needs Clarification",
                value: data.clarification,
                bg: "bg-cyan-50 dark:bg-cyan-500/10",
                valColor: PALETTE.cyan,
              },
            ].map(({ icon, label, value, bg, valColor }) => (
              <div
                key={label}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 ${bg}`}
              >
                <div className="flex items-center gap-2 text-sm text-navy-700 dark:text-white">
                  {icon}
                  {label}
                </div>
                <span className="text-lg font-bold" style={{ color: valColor }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

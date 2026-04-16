import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Card from "components/card";
import {
  MdOutlineFolderOpen,
  MdOutlineChecklist,
  MdOutlineFactCheck,
  MdOutlineAssignmentTurnedIn,
  MdOutlineHelpOutline,
  MdOutlineWarningAmber,
} from "react-icons/md";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const API_BASE = "http://localhost:5001";
const DOMAIN_ORDER = ["Organizational", "People", "Physical", "Technological"];

const COLORS = {
  brand: "#4318FF",
  blue: "#6AD2FF",
  green: "#01B574",
  yellow: "#FFB547",
  red: "#EE5D50",
};

function hasMissingEvidence(row) {
  return (row.actionables || []).some(
    (a) => a.upload_required && (!a.files || a.files.length === 0)
  );
}

function StatCard({ icon, title, value, subtitle, accent }) {
  return (
    <Card className="rounded-[20px] p-5 shadow-sm dark:bg-navy-800">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${accent}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300">{title}</p>
          <h3 className="text-3xl font-bold text-navy-700 dark:text-white">{value}</h3>
          {subtitle ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ChartCard({ title, subtitle, badge, children, className = "" }) {
  return (
    <Card className={`rounded-[20px] p-6 shadow-sm dark:bg-navy-800 ${className}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h4 className="text-xl font-bold text-navy-700 dark:text-white">{title}</h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        {badge ? (
          <div className="rounded-full bg-lightPrimary px-3 py-1 text-xs font-semibold text-brand-500 dark:bg-white/10 dark:text-white">
            {badge}
          </div>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-white/10 dark:bg-navy-700">
      {label ? (
        <div className="mb-1 text-sm font-semibold text-navy-700 dark:text-white">
          {label}
        </div>
      ) : null}
      {payload.map((entry, idx) => (
        <div key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </div>
      ))}
    </div>
  );
}

export default function MainDashboard() {
  const [records, setRecords] = useState([]);
  const [fullRecords, setFullRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const listRes = await axios.get(`${API_BASE}/api/soa-records`);
      const basic = listRes.data?.records || [];
      setRecords(basic);

      const detailed = await Promise.all(
        basic.map(async (r) => {
          const res = await axios.get(`${API_BASE}/api/soa-records/${r.id}`);
          return res.data;
        })
      );

      setFullRecords(detailed);
    } catch (e) {
      console.error(e);
      setError(
        e?.response?.data?.details ||
          e?.response?.data?.error ||
          "Failed to load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const data = useMemo(() => {
    const allRows = fullRecords.flatMap((r) => r.rows || []);

    const applicability = {
      Yes: 0,
      No: 0,
      Conditional: 0,
      "Clarification Needed": 0,
    };

    const domains = {
      Organizational: 0,
      People: 0,
      Physical: 0,
      Technological: 0,
    };

    let missingEvidence = 0;
    let completeRows = 0;

    allRows.forEach((row) => {
      const app = row.applicability || "Clarification Needed";
      if (applicability[app] !== undefined) applicability[app] += 1;

      if (domains[row.domain] !== undefined) domains[row.domain] += 1;

      if (hasMissingEvidence(row)) missingEvidence += 1;
      else completeRows += 1;
    });

    const totalRows = allRows.length;
    const completionPct = totalRows ? Math.round((completeRows / totalRows) * 100) : 0;

    const pieData = [
      { name: "Yes", value: applicability.Yes, color: COLORS.green },
      { name: "No", value: applicability.No, color: COLORS.red },
      { name: "Conditional", value: applicability.Conditional, color: COLORS.yellow },
      {
        name: "Clarification Needed",
        value: applicability["Clarification Needed"],
        color: COLORS.blue,
      },
    ];

    const domainData = DOMAIN_ORDER.map((domain) => ({
      domain,
      count: domains[domain] || 0,
    }));

    const recent = fullRecords
      .map((rec) => {
        const rows = rec.rows || [];
        const total = rows.length;
        const missing = rows.filter(hasMissingEvidence).length;
        const complete = total - missing;
        const pct = total ? Math.round((complete / total) * 100) : 0;

        return {
          id: rec.id,
          business_name: rec.business_name,
          total,
          missing,
          pct,
          updated_at: rec.updated_at,
        };
      })
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5);

    return {
      totalSavedSoAs: fullRecords.length,
      totalRows,
      yes: applicability.Yes,
      conditional: applicability.Conditional,
      clarification: applicability["Clarification Needed"],
      missingEvidence,
      completionPct,
      pieData,
      domainData,
      recent,
      completeRows,
    };
  }, [fullRecords]);

  if (loading) {
    return (
      <div className="mt-5 grid grid-cols-1 gap-5">
        <Card className="rounded-[20px] p-6 dark:bg-navy-800">
          <div className="text-sm text-gray-600 dark:text-gray-300">Loading dashboard...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      {error ? (
        <Card className="rounded-[20px] p-6 dark:bg-navy-800">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          icon={<MdOutlineFolderOpen />}
          title="Saved SoAs"
          value={data.totalSavedSoAs}
          accent="bg-lightPrimary text-brand-500 dark:bg-white/10 dark:text-white"
        />
        <StatCard
          icon={<MdOutlineChecklist />}
          title="Total Controls"
          value={data.totalRows}
          accent="bg-lightPrimary text-brand-500 dark:bg-white/10 dark:text-white"
        />
        <StatCard
          icon={<MdOutlineFactCheck />}
          title="Yes"
          value={data.yes}
          accent="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300"
        />
        <StatCard
          icon={<MdOutlineAssignmentTurnedIn />}
          title="Conditional"
          value={data.conditional}
          accent="bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300"
        />
        <StatCard
          icon={<MdOutlineHelpOutline />}
          title="Clarification Needed"
          value={data.clarification}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
        />
        <StatCard
          icon={<MdOutlineWarningAmber />}
          title="Missing Evidence"
          value={data.missingEvidence}
          subtitle={`${data.completionPct}% overall completion`}
          accent="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Applicability Distribution"
          subtitle="Across all saved SoA rows"
          badge="Live"
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={112}
                  paddingAngle={3}
                  stroke="none"
                  animationDuration={900}
                >
                  {data.pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Controls by Domain"
          subtitle="Domain-wise spread of reviewed controls"
          badge="Domain"
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.domainData} barCategoryGap="30%">
                <defs>
                  <linearGradient id="domainBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4318FF" />
                    <stop offset="100%" stopColor="#6AD2FF" />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(163,174,208,0.2)"
                />
                <XAxis
                  dataKey="domain"
                  tick={{ fill: "#A3AED0", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#A3AED0", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  name="Count"
                  fill="url(#domainBar)"
                  radius={[12, 12, 0, 0]}
                  animationDuration={900}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Recent Saved SoAs"
          subtitle="Latest business functions and completion status"
          badge="Recent"
          className="xl:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    Business
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    Rows
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    Missing
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    Completion
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((rec) => (
                  <tr
                    key={rec.id}
                    className="border-b border-gray-100 dark:border-white/5"
                  >
                    <td className="px-2 py-3 text-sm font-semibold text-navy-700 dark:text-white">
                      {rec.business_name}
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {rec.total}
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {rec.missing}
                    </td>
                    <td className="px-2 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-24 rounded-full bg-gray-100 dark:bg-white/10">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-brand-500"
                            style={{ width: `${rec.pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-brand-500">
                          {rec.pct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {rec.updated_at ? new Date(rec.updated_at).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}

                {data.recent.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-6 text-sm text-gray-600 dark:text-gray-300"
                    >
                      No saved SoAs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title="Evidence Health"
          subtitle="Overall completeness snapshot"
          badge="Health"
        >
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Overall Completion
                </span>
                <span className="text-sm font-bold text-brand-500">
                  {data.completionPct}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 dark:bg-white/10">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-cyan-400 to-brand-500"
                  style={{ width: `${data.completionPct}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-lightPrimary/60 px-4 py-3 dark:bg-white/5">
                <span className="text-sm text-navy-700 dark:text-white">Complete Rows</span>
                <span className="text-lg font-bold text-green-500">{data.completeRows}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-lightPrimary/60 px-4 py-3 dark:bg-white/5">
                <span className="text-sm text-navy-700 dark:text-white">Missing Evidence</span>
                <span className="text-lg font-bold text-red-500">{data.missingEvidence}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-lightPrimary/60 px-4 py-3 dark:bg-white/5">
                <span className="text-sm text-navy-700 dark:text-white">Clarification Needed</span>
                <span className="text-lg font-bold text-blue-500">{data.clarification}</span>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
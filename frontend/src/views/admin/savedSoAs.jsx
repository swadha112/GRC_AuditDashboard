import React, { useEffect, useState } from "react";
import axios from "axios";
import Card from "components/card";
import { useNavigate } from "react-router-dom";
import {
  MdOutlineFolderOpen,
  MdOutlineSearch,
  MdOutlineDescription,
  MdOutlineAccessTime,
  MdOutlineAddCircleOutline,
  MdOutlineArrowForward,
  MdOutlinePictureAsPdf,
  MdOutlineGridOn,
} from "react-icons/md";

const API_BASE = "http://localhost:5001";

function formatDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SavedSoAs() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/soa-records`);
        setRecords(res.data?.records || []);
      } catch (e) {
        setError(e?.response?.data?.error || "Failed to load saved SoAs.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = records.filter((r) =>
    r.business_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mt-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
            <MdOutlineDescription className="text-xl" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-navy-700 dark:text-white">Saved SoAs</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {records.length} Statement{records.length !== 1 ? "s" : ""} of Applicability saved
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full max-w-xs">
          <MdOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
          <input
            type="text"
            placeholder="Search by business name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse rounded-[20px] p-5 dark:bg-navy-800">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-gray-100 dark:bg-white/5" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 rounded bg-gray-100 dark:bg-white/5" />
                  <div className="h-3 w-32 rounded bg-gray-100 dark:bg-white/5" />
                </div>
                <div className="flex gap-2">
                  <div className="h-9 w-16 rounded-xl bg-gray-100 dark:bg-white/5" />
                  <div className="h-9 w-16 rounded-xl bg-gray-100 dark:bg-white/5" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Cards list */}
      {!loading && (
        <div className="space-y-3">
          {filtered.map((r, idx) => (
            <Card
              key={r.id}
              className="group rounded-[20px] p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-navy-800"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {/* Left — icon + name + dates */}
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lightPrimary text-brand-500 transition-transform duration-200 group-hover:scale-110 dark:bg-white/5 dark:text-white">
                    <MdOutlineFolderOpen className="text-xl" />
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-700 dark:text-white">
                      {r.business_name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                      <span className="flex items-center gap-1">
                        <MdOutlineAddCircleOutline />
                        Created {formatDate(r.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MdOutlineAccessTime />
                        Updated {formatDate(r.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right — actions */}
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    onClick={() => navigate(`/admin/saved-soas/${r.id}`)}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition-all hover:bg-brand-600 hover:shadow-brand-500/40"
                    type="button"
                  >
                    View
                    <MdOutlineArrowForward className="text-base" />
                  </button>

                  <a
                    href={`${API_BASE}/api/soa-records/${r.id}/export/pdf`}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-all hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                  >
                    <MdOutlinePictureAsPdf className="text-base" />
                    PDF
                  </a>

                  <a
                    href={`${API_BASE}/api/soa-records/${r.id}/export/xlsx`}
                    className="flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition-all hover:bg-green-100 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20"
                  >
                    <MdOutlineGridOn className="text-base" />
                    XLSX
                  </a>
                </div>
              </div>
            </Card>
          ))}

          {filtered.length === 0 && !loading && (
            <Card className="rounded-[20px] p-10 text-center dark:bg-navy-800">
              <MdOutlineDescription className="mx-auto mb-3 text-4xl text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                {search ? "No SoAs match your search." : "No saved SoAs yet."}
              </p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-2 text-xs text-brand-500 hover:underline"
                >
                  Clear search
                </button>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

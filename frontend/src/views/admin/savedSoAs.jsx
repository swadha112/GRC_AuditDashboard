import React, { useEffect, useState } from "react";
import axios from "axios";
import Card from "components/card";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:5001";

export default function SavedSoAs() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/soa-records`);
      setRecords(res.data?.records || []);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to load saved SoAs.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mt-5 grid grid-cols-1 gap-5">
      <Card className="p-6">
        <div>
          <h2 className="text-xl font-bold text-navy-700 dark:text-white">Saved SoAs</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            View saved Statements of Applicability by business name.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="min-w-[980px] w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
                  Business Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
                  Updated
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-t border-gray-200 dark:border-white/10">
                  <td className="px-4 py-3 text-sm font-semibold text-navy-700 dark:text-white">
                    {r.business_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {r.updated_at ? new Date(r.updated_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => navigate(`/admin/saved-soas/${r.id}`)}
                        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                        type="button"
                      >
                        View
                      </button>

                      <a
                        href={`${API_BASE}/api/soa-records/${r.id}/export/pdf`}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
                      >
                        PDF
                      </a>

                      <a
                        href={`${API_BASE}/api/soa-records/${r.id}/export/xlsx`}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 dark:border-white/10 dark:text-white"
                      >
                        XLSX
                      </a>
                    </div>
                  </td>
                </tr>
              ))}

              {records.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-sm text-gray-600 dark:text-gray-300">
                    No saved SoAs yet.
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
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useYield } from '@/hooks/useYield';
import { calculateYield, lookupStandardYield, calculateYieldDifference } from '@/lib/yieldChart';

export default function YieldReportPage() {
  const { isSubUser } = useAuth();
  
  const TODAY = new Date().toISOString().split('T')[0];
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const [selectedDate, setSelectedDate] = useState(TODAY);

  // For sub-users, restrict the date selector to today or yesterday
  useEffect(() => {
    if (isSubUser && selectedDate !== TODAY && selectedDate !== YESTERDAY) {
      setSelectedDate(TODAY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubUser, selectedDate]);

  const { entries, loading, fetchYieldEntries } = useYield();

  useEffect(() => {
    if (selectedDate) {
      fetchYieldEntries(selectedDate);
    }
  }, [selectedDate, fetchYieldEntries]);

  // Calculate totals
  const { totalHon, totalHl } = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.totalHon += Number(entry.hon_kgs) || 0;
        acc.totalHl += Number(entry.hl_kgs) || 0;
        return acc;
      },
      { totalHon: 0, totalHl: 0 }
    );
  }, [entries]);

  const totalYieldPct = calculateYield(totalHon, totalHl);

  return (
    <div className="animate-fade-in pb-20 lg:pb-6">
      <PageHeader title="Daily Report" />

      <div className="px-4 mt-2 space-y-4">
        {/* Date Selector */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Report Date</label>
          {isSubUser ? (
            <input
              type="date"
              value={selectedDate}
              min={YESTERDAY}
              max={TODAY}
              onChange={(e) => {
                const val = e.target.value;
                if (val === TODAY || val === YESTERDAY) setSelectedDate(val);
              }}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500"
            />
          ) : (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500"
            />
          )}
        </div>

        {/* Report Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 mb-3 text-teal-600 text-xl">
                📊
              </div>
              <p className="text-sm font-semibold text-gray-900">No Data Available</p>
              <p className="text-sm text-gray-500 mt-1">
                There are no yield entries for {selectedDate}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 z-10 shadow-[1px_0_0_0_#f3f4f6]">
                      Batch ID
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Count
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                      HON (KGS)
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                      HL (KGS)
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                      Yield %
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                      Std Yield
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                      Difference
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Location
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Grader Name
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((entry) => {
                    const honNum = Number(entry.hon_kgs) || 0;
                    const hlNum = Number(entry.hl_kgs) || 0;
                    const yieldPct = calculateYield(honNum, hlNum);
                    const stdYield = lookupStandardYield(entry.count_text);
                    const diff = calculateYieldDifference(yieldPct, stdYield);

                    return (
                      <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white group-hover:bg-gray-50 z-10 shadow-[1px_0_0_0_#f3f4f6]">
                          {entry.batch_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {entry.count_text}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">
                          {honNum.toFixed(3)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">
                          {hlNum.toFixed(3)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-bold">
                          {yieldPct !== null ? `${yieldPct.toFixed(2)}%` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-bold">
                          {stdYield !== null ? `${stdYield.toFixed(2)}%` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                          {diff !== null ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                diff >= 0
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {entry.location?.name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {entry.grader_name}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Total Row */}
                <tfoot>
                  <tr className="bg-teal-50/50 border-t-2 border-teal-100">
                    <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap sticky left-0 bg-teal-50 z-10 shadow-[1px_0_0_0_#ccfbf1]">
                      TOTALS
                    </td>
                    <td className="px-4 py-3 text-sm text-teal-800 whitespace-nowrap">
                      {entries.length} batches
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">
                      {totalHon.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">
                      {totalHl.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">
                      {totalYieldPct !== null ? `${totalYieldPct.toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

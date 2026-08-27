'use client';

import React, { useMemo, useState } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useYield } from '@/hooks/useYield';
import { useHlVa } from '@/hooks/useHlVa';
import { calculateYield, standardForYieldEntry, calculateYieldDifference } from '@/lib/yieldChart';
import { standardForHlVaEntry, lookupHlVaCountRange } from '@/lib/hlVa';

/**
 * Look one Batch ID up across every date and show both processing stages side
 * by side. Self-contained: it owns the batch-search half of the yield hooks,
 * which only hit the network once a search is actually run.
 */
export default function BatchPipeline() {
  const { batchEntries: honHlBatch, batchLoading: honHlBatchLoading, fetchByBatch: fetchYieldByBatch } = useYield();
  const { batchEntries: hlVaBatch, batchLoading: hlVaBatchLoading, fetchByBatch: fetchHlVaByBatch } = useHlVa();

  const [batchSearch, setBatchSearch] = useState('');
  const [batchQuery, setBatchQuery] = useState('');

  const runBatchSearch = () => {
    const q = batchSearch.trim();
    setBatchQuery(q);
    if (q) {
      fetchYieldByBatch(q);
      fetchHlVaByBatch(q);
    }
  };

  const honHlBatchTotals = useMemo(() => {
    return honHlBatch.reduce(
      (acc, e) => {
        acc.hon += Number(e.hon_kgs) || 0;
        acc.hl += Number(e.hl_kgs) || 0;
        return acc;
      },
      { hon: 0, hl: 0 }
    );
  }, [honHlBatch]);
  const honHlBatchYield = calculateYield(honHlBatchTotals.hon, honHlBatchTotals.hl);

  const hlVaBatchTotals = useMemo(() => {
    return hlVaBatch.reduce(
      (acc, e) => {
        acc.hl += Number(e.hl_kgs) || 0;
        acc.va += Number(e.va_kgs) || 0;
        return acc;
      },
      { hl: 0, va: 0 }
    );
  }, [hlVaBatch]);
  const hlVaBatchYield = calculateYield(hlVaBatchTotals.hl, hlVaBatchTotals.va);

  return (
    <>
      {/* The Analytics section strip already titles this, so only the hint is repeated */}
      <div className="space-y-4 mb-8">
        <p className="text-sm text-gray-500">
          Search a Batch ID to see all its HON→HL and HL→VA entries across every date.
        </p>

        {/* Search box */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <form onSubmit={(e) => { e.preventDefault(); runBatchSearch(); }} className="flex gap-2">
            <input
              type="text"
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              placeholder="Enter Batch ID (e.g. 26F04/3) and press Enter"
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap"
            >
              Search
            </button>
          </form>
        </div>

        {batchQuery === '' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-3 text-indigo-600 text-xl">🔎</div>
            <p className="text-sm font-semibold text-gray-900">Search a Batch</p>
            <p className="text-sm text-gray-500 mt-1">Enter a Batch ID above to view its full pipeline history.</p>
          </div>
        ) : (
          <>
            {/* HON → HL table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-700">HON → HL</span>
                <span className="text-sm text-gray-500">Batch <span className="font-semibold text-gray-900">{batchQuery}</span></span>
              </div>
              {honHlBatchLoading ? (
                <div className="p-8 flex justify-center"><LoadingSpinner /></div>
              ) : honHlBatch.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-semibold text-gray-900">No HON→HL Entries</p>
                  <p className="text-sm text-gray-500 mt-1">No HON→HL records found for batch {batchQuery}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Batch ID</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Count</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HON (KGS)</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL (KGS)</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-teal-500 uppercase tracking-wider whitespace-nowrap text-right">Yield</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-purple-500 uppercase tracking-wider whitespace-nowrap text-right">Std Yield</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Diff</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Grader</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {honHlBatch.map((entry) => {
                        const honNum = Number(entry.hon_kgs) || 0;
                        const hlNum = Number(entry.hl_kgs) || 0;
                        const yieldPct = calculateYield(honNum, hlNum);
                        const stdYield = standardForYieldEntry(entry);
                        const diff = calculateYieldDifference(yieldPct, stdYield);
                        return (
                          <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/80 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">{entry.batch_id}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.work_date}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.count_text}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{honNum.toFixed(3)}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{hlNum.toFixed(3)}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-bold">{yieldPct !== null ? `${yieldPct.toFixed(2)}%` : '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-bold">{stdYield !== null ? `${stdYield.toFixed(2)}%` : '-'}</td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                              {diff !== null ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                  {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.location?.name || 'Unknown'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.grader_name}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
                        <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap sticky left-0 sticky-col-teal z-10 shadow-[1px_0_0_0_#ccfbf1] dark:shadow-[1px_0_0_0_#0f766e]">TOTALS</td>
                        <td className="px-4 py-3 text-sm text-teal-800 whitespace-nowrap">{honHlBatch.length} entries</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{honHlBatchTotals.hon.toFixed(3)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{honHlBatchTotals.hl.toFixed(3)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{honHlBatchYield !== null ? `${honHlBatchYield.toFixed(2)}%` : '-'}</td>
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

            {/* HL → VA table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700">HL → VA</span>
                <span className="text-sm text-gray-500">Batch <span className="font-semibold text-gray-900">{batchQuery}</span></span>
              </div>
              {hlVaBatchLoading ? (
                <div className="p-8 flex justify-center"><LoadingSpinner /></div>
              ) : hlVaBatch.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-semibold text-gray-900">No HL→VA Entries</p>
                  <p className="text-sm text-gray-500 mt-1">No HL→VA records found for batch {batchQuery}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Batch ID</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Count</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Variety</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL (KGS)</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">VA (KGS)</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap">Grade</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-teal-500 uppercase tracking-wider whitespace-nowrap text-right">Yield</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-purple-500 uppercase tracking-wider whitespace-nowrap text-right">Std %</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {hlVaBatch.map((entry) => {
                        const hlNum = Number(entry.hl_kgs) || 0;
                        const vaNum = Number(entry.va_kgs) || 0;
                        const yieldPct = calculateYield(hlNum, vaNum);
                        const stdYield = standardForHlVaEntry(entry);
                        const diff = calculateYieldDifference(yieldPct, stdYield);
                        const grade = entry.grade || lookupHlVaCountRange(entry.count_text) || '-';
                        return (
                          <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/80 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">{entry.batch_id}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.work_date}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.count_text}</td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">{entry.variety || '-'}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{hlNum.toFixed(3)}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{vaNum.toFixed(3)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.location?.name || 'Unknown'}</td>
                            <td className="px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap">{grade}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-bold">{yieldPct !== null ? `${yieldPct.toFixed(2)}%` : '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-bold">{stdYield !== null ? `${stdYield.toFixed(2)}%` : '-'}</td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                              {diff !== null ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                  {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-indigo-50 dark:bg-indigo-900/30 border-t-2 border-indigo-100 dark:border-indigo-800">
                        <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap sticky left-0 sticky-col-indigo z-10 shadow-[1px_0_0_0_#e0e7ff] dark:shadow-[1px_0_0_0_#3730a3]">TOTALS</td>
                        <td className="px-4 py-3 text-sm text-indigo-800 dark:text-indigo-300 whitespace-nowrap">{hlVaBatch.length} entries</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right">{hlVaBatchTotals.hl.toFixed(3)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right">{hlVaBatchTotals.va.toFixed(3)}</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right">{hlVaBatchYield !== null ? `${hlVaBatchYield.toFixed(2)}%` : '-'}</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

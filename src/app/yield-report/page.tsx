'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useYield } from '@/hooks/useYield';
import { useNonLocalLadies } from '@/hooks/useNonLocalLadies';
import { calculateYield, lookupStandardYield, calculateYieldDifference } from '@/lib/yieldChart';

const SALARY_BASIC = 350;

export default function YieldReportPage() {
  const { isSubUser } = useAuth();
  
  const TODAY = new Date().toISOString().split('T')[0];
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const [selectedDate, setSelectedDate] = useState(TODAY);

  // ── HON to HL Yields filters ───────────────────────────────────────────────
  const [diffFilter, setDiffFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [graderFilter, setGraderFilter] = useState('All');

  // ── Non Local Ladies filter ────────────────────────────────────────────────
  const [nllBatchFilter, setNllBatchFilter] = useState('All');

  // For sub-users, restrict the date selector to today or yesterday
  useEffect(() => {
    if (isSubUser && selectedDate !== TODAY && selectedDate !== YESTERDAY) {
      setSelectedDate(TODAY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubUser, selectedDate]);

  // ── HON to HL Yields data ─────────────────────────────────────────────────
  const { entries, loading, fetchYieldEntries } = useYield();

  useEffect(() => {
    if (selectedDate) {
      fetchYieldEntries(selectedDate);
    }
  }, [selectedDate, fetchYieldEntries]);

  // Derive filter options
  const { locations, graders } = useMemo(() => {
    const locSet = new Set<string>();
    const gradSet = new Set<string>();
    entries.forEach((entry) => {
      if (entry.location?.name) locSet.add(entry.location.name);
      if (entry.grader_name) gradSet.add(entry.grader_name);
    });
    return {
      locations: Array.from(locSet).sort(),
      graders: Array.from(gradSet).sort(),
    };
  }, [entries]);

  // Apply filters
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (locationFilter !== 'All' && (entry.location?.name || 'Unknown') !== locationFilter) return false;
      if (graderFilter !== 'All' && entry.grader_name !== graderFilter) return false;
      if (diffFilter !== 'All') {
        const honNum = Number(entry.hon_kgs) || 0;
        const hlNum = Number(entry.hl_kgs) || 0;
        const yieldPct = calculateYield(honNum, hlNum);
        const stdYield = lookupStandardYield(entry.count_text);
        const diff = calculateYieldDifference(yieldPct, stdYield);
        if (diff === null) return false;
        if (diffFilter === 'Positive' && diff < 0) return false;
        if (diffFilter === 'Negative' && diff >= 0) return false;
      }
      return true;
    });
  }, [entries, diffFilter, locationFilter, graderFilter]);

  const { totalHon, totalHl } = useMemo(() => {
    return filteredEntries.reduce(
      (acc, entry) => {
        acc.totalHon += Number(entry.hon_kgs) || 0;
        acc.totalHl += Number(entry.hl_kgs) || 0;
        return acc;
      },
      { totalHon: 0, totalHl: 0 }
    );
  }, [filteredEntries]);

  const totalYieldPct = calculateYield(totalHon, totalHl);

  // ── Non Local Ladies data ──────────────────────────────────────────────────
  const { entries: nllEntries, loading: nllLoading, fetchEntries: fetchNllEntries } = useNonLocalLadies();

  useEffect(() => {
    if (selectedDate) {
      fetchNllEntries(selectedDate);
    }
  }, [selectedDate, fetchNllEntries]);

  // Derive batch name options
  const nllBatchNames = useMemo(() => {
    return Array.from(new Set(nllEntries.map((e) => e.batch_name))).sort();
  }, [nllEntries]);

  // Apply batch filter
  const filteredNllEntries = useMemo(() => {
    if (nllBatchFilter === 'All') return nllEntries;
    return nllEntries.filter((e) => e.batch_name === nllBatchFilter);
  }, [nllEntries, nllBatchFilter]);

  // Non Local Ladies totals
  const nllTotals = useMemo(() => {
    return filteredNllEntries.reduce(
      (acc, entry) => {
        const noLadies = Number(entry.no_of_ladies) || 0;
        const hlQty = Number(entry.hl_qty) || 0;
        const pdQty = Number(entry.pd_qty) || 0;
        const perHead = Number(entry.per_head_amount) || 0;
        const totalQty = hlQty + pdQty;
        const diff = perHead - SALARY_BASIC;
        const pnl = diff * noLadies;

        acc.totalLadies += noLadies;
        acc.totalHlQty += hlQty;
        acc.totalPdQty += pdQty;
        acc.totalQty += totalQty;
        acc.totalPnl += pnl;
        acc.totalSalaryPaid += noLadies * perHead;
        return acc;
      },
      { totalLadies: 0, totalHlQty: 0, totalPdQty: 0, totalQty: 0, totalPnl: 0, totalSalaryPaid: 0 }
    );
  }, [filteredNllEntries]);

  // Cost Per KG = Total Salary Paid / Total HL QTY
  const costPerKg = nllTotals.totalHlQty > 0
    ? nllTotals.totalSalaryPaid / nllTotals.totalHlQty
    : null;

  return (
    <div className="animate-fade-in pb-20 lg:pb-6">
      <PageHeader title="Daily Report" />

      <div className="px-4 mt-2 space-y-6">

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: HON TO HL YIELDS
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="pt-2 pb-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">HON to HL yields</h2>
          </div>

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

          {/* HON to HL Filters */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Difference</label>
              <select
                value={diffFilter}
                onChange={(e) => setDiffFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              >
                <option value="All">All</option>
                <option value="Positive">Positive (+)</option>
                <option value="Negative">Negative (-)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Location</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              >
                <option value="All">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
                <option value="Unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Grader Name</label>
              <select
                value={graderFilter}
                onChange={(e) => setGraderFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              >
                <option value="All">All Graders</option>
                {graders.map((grader) => (
                  <option key={grader} value={grader}>{grader}</option>
                ))}
              </select>
            </div>
          </div>

          {/* HON to HL Report Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="p-8 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 mb-3 text-teal-600 text-xl">📊</div>
                <p className="text-sm font-semibold text-gray-900">No Data Available</p>
                <p className="text-sm text-gray-500 mt-1">There are no yield entries for {selectedDate}.</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 mb-3 text-teal-600 text-xl">🔍</div>
                <p className="text-sm font-semibold text-gray-900">No Matches Found</p>
                <p className="text-sm text-gray-500 mt-1">Try adjusting your filters to see more results.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Batch ID</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Count</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HON (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Yield %</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Std Yield</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Difference</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Grader Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredEntries.map((entry) => {
                      const honNum = Number(entry.hon_kgs) || 0;
                      const hlNum = Number(entry.hl_kgs) || 0;
                      const yieldPct = calculateYield(honNum, hlNum);
                      const stdYield = lookupStandardYield(entry.count_text);
                      const diff = calculateYieldDifference(yieldPct, stdYield);
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/80 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">{entry.batch_id}</td>
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
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap sticky left-0 bg-teal-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#ccfbf1] dark:shadow-[1px_0_0_0_#0f766e]">TOTALS</td>
                      <td className="px-4 py-3 text-sm text-teal-800 whitespace-nowrap">{filteredEntries.length} batches</td>
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{totalHon.toFixed(3)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{totalHl.toFixed(3)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{totalYieldPct !== null ? `${totalYieldPct.toFixed(2)}%` : '-'}</td>
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

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2: NON LOCAL LADIES
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="pt-2 pb-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Non Local Ladies</h2>
          </div>

          {/* Batch Name Filter */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="max-w-xs">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Batch Name</label>
              <select
                value={nllBatchFilter}
                onChange={(e) => setNllBatchFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              >
                <option value="All">All Batches</option>
                {nllBatchNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Non Local Ladies Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {nllLoading ? (
              <div className="p-8 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : nllEntries.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-3 text-amber-600 text-xl">👩</div>
                <p className="text-sm font-semibold text-gray-900">No Data Available</p>
                <p className="text-sm text-gray-500 mt-1">There are no non-local ladies entries for {selectedDate}.</p>
              </div>
            ) : filteredNllEntries.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-3 text-amber-600 text-xl">🔍</div>
                <p className="text-sm font-semibold text-gray-900">No Matches Found</p>
                <p className="text-sm text-gray-500 mt-1">Try adjusting the batch filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Batch Name</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">No. of Ladies</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL QTY</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">PD QTY</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Total QTY</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap text-right bg-amber-50/60 dark:bg-amber-900/20">Per Head Amt</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Salary Basic</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Difference</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Profit & Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredNllEntries.map((entry) => {
                      const noLadies = Number(entry.no_of_ladies) || 0;
                      const hlQty = Number(entry.hl_qty) || 0;
                      const pdQty = Number(entry.pd_qty) || 0;
                      const perHead = Number(entry.per_head_amount) || 0;
                      const totalQty = hlQty + pdQty;
                      const diff = perHead - SALARY_BASIC;
                      const pnl = diff * noLadies;
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/80 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">{entry.batch_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{noLadies}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{hlQty.toFixed(0)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{pdQty.toFixed(0)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-bold">{totalQty.toFixed(0)}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap text-right font-bold text-amber-600 bg-amber-50/40 dark:bg-amber-900/10">{perHead.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-right">{SALARY_BASIC.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                            <span className={`font-bold text-sm ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-100 dark:border-amber-800">
                      <td className="px-4 py-3 text-sm font-bold text-amber-900 dark:text-amber-400 whitespace-nowrap sticky left-0 bg-amber-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#fef3c7] dark:shadow-[1px_0_0_0_#92400e]">TOTAL</td>
                      <td className="px-4 py-3 text-sm font-bold text-amber-900 dark:text-amber-400 whitespace-nowrap text-right">{nllTotals.totalLadies}</td>
                      <td className="px-4 py-3 text-sm font-bold text-amber-900 dark:text-amber-400 whitespace-nowrap text-right">{nllTotals.totalHlQty.toFixed(0)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-amber-900 dark:text-amber-400 whitespace-nowrap text-right">{nllTotals.totalPdQty.toFixed(0)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-amber-900 dark:text-amber-400 whitespace-nowrap text-right">{nllTotals.totalQty.toFixed(0)}</td>
                      <td className="px-4 py-3 bg-amber-50/40 dark:bg-amber-900/10"></td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total P&amp;L</span>
                      </td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-sm font-bold whitespace-nowrap text-right">
                        <span className={`font-bold text-base ${nllTotals.totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {nllTotals.totalPnl >= 0 ? '+' : ''}{nllTotals.totalPnl.toFixed(0)}
                        </span>
                      </td>
                    </tr>
                    {/* Cost Per KG row */}
                    <tr className="bg-amber-100/60 dark:bg-amber-900/30 border-t border-amber-200 dark:border-amber-700">
                      <td className="px-4 py-2 text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-amber-100/60 dark:bg-gray-900 z-10" colSpan={3}>
                        Cost Per KG (Approx)
                      </td>
                      <td className="px-4 py-2" colSpan={2}></td>
                      <td className="px-4 py-2 text-sm font-bold text-amber-800 dark:text-amber-400 text-right" colSpan={4}>
                        {costPerKg !== null ? costPerKg.toFixed(2) : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

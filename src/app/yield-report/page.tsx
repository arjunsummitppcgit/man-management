'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useYield } from '@/hooks/useYield';
import { useNonLocalLadies } from '@/hooks/useNonLocalLadies';
import { useGradesVa } from '@/hooks/useGradesVa';
import { calculateYield, lookupStandardYield, calculateYieldDifference } from '@/lib/yieldChart';
import { VA_GRADES, VA_COLUMNS, formatVaQty, type VaColumnKey } from '@/lib/gradesVa';

const SALARY_BASIC = 350;

export default function YieldReportPage() {
  const { isSubUser } = useAuth();
  
  const TODAY = new Date().toISOString().split('T')[0];
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  // Default to yesterday — the Daily Report recaps the previous day's work
  const [selectedDate, setSelectedDate] = useState(YESTERDAY);

  // ── HON to HL Yields filters ───────────────────────────────────────────────
  const [diffFilter, setDiffFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [graderFilter, setGraderFilter] = useState('All');


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

  // Non Local Ladies totals
  const nllTotals = useMemo(() => {
    return nllEntries.reduce(
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
  }, [nllEntries]);

  // Cost Per KG = Total Salary Paid / Total HL QTY
  const costPerKg = nllTotals.totalHlQty > 0
    ? nllTotals.totalSalaryPaid / nllTotals.totalHlQty
    : null;

  // ── Grades vs V/A data ─────────────────────────────────────────────────────
  const MONTH_START = TODAY.slice(0, 8) + '01';
  const [gvaFrom, setGvaFrom] = useState(YESTERDAY);
  const [gvaTo, setGvaTo] = useState(YESTERDAY);
  const [gvaGradeFilter, setGvaGradeFilter] = useState<string[]>([]);      // empty = all grades
  const [gvaColFilter, setGvaColFilter] = useState<VaColumnKey[]>([]);     // empty = all columns
  const [gvaMinTotal, setGvaMinTotal] = useState('');                       // min total KGS threshold
  const [gvaShowDaily, setGvaShowDaily] = useState(false);

  // Follow the Daily Report date navigation: whenever the shared report date
  // changes (header arrows / Report Date picker), snap the V/A range to that
  // same single day. Presets and manual pickers can still override afterward.
  useEffect(() => {
    setGvaFrom(selectedDate);
    setGvaTo(selectedDate);
  }, [selectedDate]);

  // Sub-users: clamp range to yesterday–today
  useEffect(() => {
    if (isSubUser) {
      if (gvaFrom < YESTERDAY) setGvaFrom(YESTERDAY);
      if (gvaTo > TODAY) setGvaTo(TODAY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubUser, gvaFrom, gvaTo]);

  const { rangeEntries: gvaEntries, rangeLoading: gvaLoading, fetchRange: fetchGvaRange } = useGradesVa();

  useEffect(() => {
    if (gvaFrom && gvaTo && gvaFrom <= gvaTo) {
      fetchGvaRange(gvaFrom, gvaTo);
    }
  }, [gvaFrom, gvaTo, fetchGvaRange]);

  // Active columns = selected or all
  const activeVaColumns = useMemo(
    () => (gvaColFilter.length === 0 ? [...VA_COLUMNS] : VA_COLUMNS.filter((c) => gvaColFilter.includes(c.key))),
    [gvaColFilter]
  );

  // Aggregate range entries by grade (over active columns only)
  const gvaByGrade = useMemo(() => {
    const map = new Map<string, Record<VaColumnKey, number> & { total: number; days: number }>();
    VA_GRADES.forEach((g) => {
      map.set(g, { pd: 0, pud: 0, pdto: 0, ezpl: 0, pvpd: 0, pvpdto: 0, total: 0, days: 0 });
    });
    gvaEntries.forEach((e) => {
      let agg = map.get(e.grade);
      if (!agg) {
        agg = { pd: 0, pud: 0, pdto: 0, ezpl: 0, pvpd: 0, pvpdto: 0, total: 0, days: 0 };
        map.set(e.grade, agg);
      }
      agg.pd += Number(e.pd) || 0;
      agg.pud += Number(e.pud) || 0;
      agg.pdto += Number(e.pdto) || 0;
      agg.ezpl += Number(e.ezpl) || 0;
      agg.pvpd += Number(e.pvpd) || 0;
      agg.pvpdto += Number(e.pvpdto) || 0;
      agg.days += 1;
    });
    // Total = sum of ACTIVE columns only (so column filter drives the total)
    map.forEach((agg) => {
      agg.total = activeVaColumns.reduce((sum, col) => sum + agg[col.key], 0);
    });
    return map;
  }, [gvaEntries, activeVaColumns]);

  // Grade rows after grade + min-total filters (keeps register order, includes extra grades from DB)
  const gvaRows = useMemo(() => {
    const knownGrades = [...VA_GRADES] as string[];
    const extraGrades = Array.from(gvaByGrade.keys()).filter((g) => !knownGrades.includes(g)).sort();
    const orderedGrades = [...knownGrades, ...extraGrades];
    const minTotal = parseFloat(gvaMinTotal) || 0;

    return orderedGrades
      .filter((g) => gvaGradeFilter.length === 0 || gvaGradeFilter.includes(g))
      .map((g) => ({ grade: g, ...gvaByGrade.get(g)! }))
      .filter((r) => r.total > 0)
      .filter((r) => r.total >= minTotal);
  }, [gvaByGrade, gvaGradeFilter, gvaMinTotal]);

  // Column totals + per-column highest grade (for highlights & summary)
  const gvaColumnStats = useMemo(() => {
    const stats = {} as Record<VaColumnKey, { total: number; maxGrade: string | null; maxValue: number }>;
    VA_COLUMNS.forEach((col) => {
      let total = 0;
      let maxGrade: string | null = null;
      let maxValue = 0;
      gvaRows.forEach((r) => {
        const v = r[col.key];
        total += v;
        if (v > maxValue) {
          maxValue = v;
          maxGrade = r.grade;
        }
      });
      stats[col.key] = { total, maxGrade, maxValue };
    });
    return stats;
  }, [gvaRows]);

  const gvaGrandTotal = useMemo(
    () => gvaRows.reduce((sum, r) => sum + r.total, 0),
    [gvaRows]
  );

  const gvaTopGrade = useMemo(() => {
    let top: { grade: string; total: number } | null = null;
    gvaRows.forEach((r) => {
      if (!top || r.total > top.total) top = { grade: r.grade, total: r.total };
    });
    return top as { grade: string; total: number } | null;
  }, [gvaRows]);

  // Daily breakdown rows (date-wise, respecting grade filter)
  const gvaDailyRows = useMemo(() => {
    if (!gvaShowDaily) return [];
    return gvaEntries
      .filter((e) => gvaGradeFilter.length === 0 || gvaGradeFilter.includes(e.grade))
      .map((e) => {
        const total = activeVaColumns.reduce((sum, col) => sum + (Number(e[col.key]) || 0), 0);
        return { ...e, computedTotal: total };
      })
      .filter((e) => e.computedTotal > 0);
  }, [gvaShowDaily, gvaEntries, gvaGradeFilter, activeVaColumns]);

  const toggleGvaGrade = (grade: string) => {
    setGvaGradeFilter((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
    );
  };

  const toggleGvaCol = (key: VaColumnKey) => {
    setGvaColFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Quick range presets
  const applyGvaPreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth') => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().split('T')[0];
    if (preset === 'today') {
      setGvaFrom(TODAY); setGvaTo(TODAY);
    } else if (preset === 'yesterday') {
      setGvaFrom(YESTERDAY); setGvaTo(YESTERDAY);
    } else if (preset === 'last7') {
      setGvaFrom(iso(new Date(Date.now() - 6 * 86400000))); setGvaTo(TODAY);
    } else if (preset === 'thisMonth') {
      setGvaFrom(MONTH_START); setGvaTo(TODAY);
    } else if (preset === 'lastMonth') {
      const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endLast = new Date(now.getFullYear(), now.getMonth(), 0);
      // Use UTC-safe manual formatting to avoid timezone shifts
      const pad = (n: number) => String(n).padStart(2, '0');
      setGvaFrom(`${firstLast.getFullYear()}-${pad(firstLast.getMonth() + 1)}-${pad(firstLast.getDate())}`);
      setGvaTo(`${endLast.getFullYear()}-${pad(endLast.getMonth() + 1)}-${pad(endLast.getDate())}`);
    }
  };

  // Report Date navigation (Sections 1 & 2) — shift selectedDate by ±1 day.
  // Stays in local calendar fields throughout (no toISOString) so the date
  // doesn't shift across the UTC boundary for timezones ahead of UTC.
  const shiftDate = (dateStr: string, days: number) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  const handlePrevDate = () => {
    const prev = shiftDate(selectedDate, -1);
    if (isSubUser && prev !== TODAY && prev !== YESTERDAY) return;
    setSelectedDate(prev);
  };
  const handleNextDate = () => {
    const next = shiftDate(selectedDate, 1);
    if (isSubUser && next !== TODAY && next !== YESTERDAY) return;
    setSelectedDate(next);
  };

  // Which quick preset (if any) the current Grades V/A range matches, plus a
  // human-readable label — so it's obvious the section is showing "Yesterday".
  const PRESET_LABELS: Record<string, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    last7: 'Last 7 Days',
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
  };
  const gvaMeta = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const last7From = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
    const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLast = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthFrom = `${firstLast.getFullYear()}-${pad(firstLast.getMonth() + 1)}-${pad(firstLast.getDate())}`;
    const lastMonthTo = `${endLast.getFullYear()}-${pad(endLast.getMonth() + 1)}-${pad(endLast.getDate())}`;

    let preset: string | null = null;
    if (gvaFrom === gvaTo && gvaFrom === TODAY) preset = 'today';
    else if (gvaFrom === gvaTo && gvaFrom === YESTERDAY) preset = 'yesterday';
    else if (gvaFrom === last7From && gvaTo === TODAY) preset = 'last7';
    else if (gvaFrom === MONTH_START && gvaTo === TODAY) preset = 'thisMonth';
    else if (gvaFrom === lastMonthFrom && gvaTo === lastMonthTo) preset = 'lastMonth';

    const fmt = (s: string) => {
      try {
        return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch {
        return s;
      }
    };
    const label = gvaFrom === gvaTo ? fmt(gvaFrom) : `${fmt(gvaFrom)} – ${fmt(gvaTo)}`;
    return { preset, label };
  }, [gvaFrom, gvaTo, TODAY, YESTERDAY, MONTH_START]);

  return (
    <div className="animate-fade-in pb-20 lg:pb-6">
      <PageHeader
        title="Daily Report"
        rightAction={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevDate}
              disabled={isSubUser && selectedDate === YESTERDAY}
              aria-label="Previous day"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-650 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200"
            >
              ◀
            </button>
            {/* Header shows the report day; the sections below cover the previous day's work */}
            <span className="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">
              {new Date(shiftDate(selectedDate, 1) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
            <button
              type="button"
              onClick={handleNextDate}
              disabled={isSubUser && selectedDate === TODAY}
              aria-label="Next day"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-650 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200"
            >
              ▶
            </button>
          </div>
        }
      />

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
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Per Head Amt</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Salary Basic</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Difference</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Profit & Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {nllEntries.map((entry) => {
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
                          <td className={`px-4 py-3 text-sm whitespace-nowrap text-right font-bold ${perHead >= 300 ? 'text-emerald-600 bg-emerald-50/40 dark:bg-emerald-900/10' : 'text-rose-600 bg-rose-50/40 dark:bg-rose-900/10'}`}>{perHead.toFixed(2)}</td>
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

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: GRADES VS VALUE ADDITION (V/A)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="pt-2 pb-1 flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Grades vs V/A</h2>
            {gvaMeta.preset && (
              <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-wide">
                {PRESET_LABELS[gvaMeta.preset]}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{gvaMeta.label}</span>
          </div>

          {/* Date Range + Presets */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">From Date</label>
                <input
                  type="date"
                  value={gvaFrom}
                  min={isSubUser ? YESTERDAY : undefined}
                  max={isSubUser ? TODAY : gvaTo}
                  onChange={(e) => setGvaFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">To Date</label>
                <input
                  type="date"
                  value={gvaTo}
                  min={isSubUser ? YESTERDAY : gvaFrom}
                  max={isSubUser ? TODAY : undefined}
                  onChange={(e) => setGvaTo(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500"
                />
              </div>
            </div>
            {/* Quick presets */}
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'today', label: 'Today' },
                { key: 'yesterday', label: 'Yesterday' },
                ...(!isSubUser ? [
                  { key: 'last7', label: 'Last 7 Days' },
                  { key: 'thisMonth', label: 'This Month' },
                  { key: 'lastMonth', label: 'Last Month' },
                ] : []),
              ] as { key: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth'; label: string }[]).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyGvaPreset(p.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    gvaMeta.preset === p.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters: Columns + Grades + Min KGS */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
            {/* Column filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">V/A Columns</label>
                {gvaColFilter.length > 0 && (
                  <button type="button" onClick={() => setGvaColFilter([])} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    Show All
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {VA_COLUMNS.map((col) => {
                  const active = gvaColFilter.length === 0 || gvaColFilter.includes(col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleGvaCol(col.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {col.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Tap a column to select only specific columns. Totals recalculate using only the selected columns.</p>
            </div>

            {/* Grade filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Grades</label>
                {gvaGradeFilter.length > 0 && (
                  <button type="button" onClick={() => setGvaGradeFilter([])} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    All Grades
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VA_GRADES.map((grade) => {
                  const active = gvaGradeFilter.length === 0 || gvaGradeFilter.includes(grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => toggleGvaGrade(grade)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors border ${
                        active
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {grade}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Min total + daily breakdown toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Min Total (KGS)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={gvaMinTotal}
                  onChange={(e) => setGvaMinTotal(e.target.value)}
                  placeholder="e.g. 1000 — show grades above this qty"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setGvaShowDaily((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  gvaShowDaily
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {gvaShowDaily ? '✓ Day-wise Breakdown ON' : 'Show Day-wise Breakdown'}
              </button>
            </div>
          </div>

          {/* Summary cards */}
          {!gvaLoading && gvaRows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-3 border border-indigo-200">
                <p className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wide">Total V/A (QTY)</p>
                <p className="text-lg font-bold text-indigo-800 mt-0.5">{formatVaQty(gvaGrandTotal)}</p>
              </div>
              {gvaTopGrade && (
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-3 border border-emerald-200">
                  <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">🏆 Top Grade</p>
                  <p className="text-lg font-bold text-emerald-800 mt-0.5">{gvaTopGrade.grade}</p>
                  <p className="text-[11px] text-emerald-600 font-medium">{formatVaQty(gvaTopGrade.total)} kg</p>
                </div>
              )}
              {activeVaColumns.slice(0, 2).map((col) => {
                const stat = gvaColumnStats[col.key];
                return (
                  <div key={col.key} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Highest {col.label}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{stat.maxGrade ?? '—'}</p>
                    <p className="text-[11px] text-gray-500 font-medium">{stat.maxValue > 0 ? `${formatVaQty(stat.maxValue)} kg` : 'No data'}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Grade Summary Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {gvaLoading ? (
              <div className="p-8 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : gvaEntries.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-3 text-indigo-600 text-xl">📦</div>
                <p className="text-sm font-semibold text-gray-900">No Data Available</p>
                <p className="text-sm text-gray-500 mt-1">There are no Grades V/A entries between {gvaFrom} and {gvaTo}.</p>
              </div>
            ) : gvaRows.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-3 text-indigo-600 text-xl">🔍</div>
                <p className="text-sm font-semibold text-gray-900">No Matches Found</p>
                <p className="text-sm text-gray-500 mt-1">Try adjusting your grade, column, or min-KGS filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Grade</th>
                      {activeVaColumns.map((col) => (
                        <th key={col.key} className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">{col.label}</th>
                      ))}
                      <th className="px-4 py-3 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap text-right">Total (QTY)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {gvaRows.map((row) => (
                      <tr key={row.grade} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/80 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">{row.grade}</td>
                        {activeVaColumns.map((col) => {
                          const isMax = gvaColumnStats[col.key].maxGrade === row.grade && row[col.key] > 0;
                          return (
                            <td key={col.key} className={`px-4 py-3 text-sm whitespace-nowrap text-right font-medium ${isMax ? 'text-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/10 font-bold' : 'text-gray-900'}`}>
                              {row[col.key] > 0 ? formatVaQty(row[col.key]) : '-'}
                              {isMax && <span className="ml-1">🏆</span>}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap text-right">{formatVaQty(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50 dark:bg-indigo-900/30 border-t-2 border-indigo-100 dark:border-indigo-800">
                      <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap sticky left-0 bg-indigo-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#e0e7ff] dark:shadow-[1px_0_0_0_#3730a3]">TOTAL</td>
                      {activeVaColumns.map((col) => (
                        <td key={col.key} className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right">
                          {gvaColumnStats[col.key].total > 0 ? formatVaQty(gvaColumnStats[col.key].total) : '-'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right bg-indigo-100/70 dark:bg-indigo-900/40">{formatVaQty(gvaGrandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Day-wise Breakdown Table */}
          {gvaShowDaily && !gvaLoading && gvaDailyRows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 pt-4 pb-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Day-wise Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Date</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Grade</th>
                      {activeVaColumns.map((col) => (
                        <th key={col.key} className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">{col.label}</th>
                      ))}
                      <th className="px-4 py-3 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {gvaDailyRows.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/80 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">{entry.work_date}</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">{entry.grade}</td>
                        {activeVaColumns.map((col) => (
                          <td key={col.key} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">
                            {Number(entry[col.key]) > 0 ? formatVaQty(Number(entry[col.key])) : '-'}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap text-right">{formatVaQty(entry.computedTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

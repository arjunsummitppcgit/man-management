'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ColumnFilter from '@/components/ui/ColumnFilter';
import PrintButton from '@/components/ui/PrintButton';
import { useAuth } from '@/hooks/useAuth';
import { useYield } from '@/hooks/useYield';
import { useNonLocalLadies } from '@/hooks/useNonLocalLadies';
import { useHlVa } from '@/hooks/useHlVa';
import { calculateYield, lookupStandardYield, calculateYieldDifference } from '@/lib/yieldChart';
import { formatVaQty, lookupHlVaStandardYield, lookupHlVaCountRange } from '@/lib/hlVa';
import GradeVaReport from '@/components/reports/GradeVaReport';
import LabourBreakdownReport from '@/components/reports/LabourBreakdownReport';
import GradingDataReport from '@/components/reports/GradingDataReport';
import { useGrading } from '@/hooks/useGrading';

const SALARY_BASIC = 350;

export default function YieldReportPage() {
  const { isSubUser } = useAuth();
  
  const TODAY = new Date().toISOString().split('T')[0];
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  // Default to today — header date and all report sections show the same date
  const [selectedDate, setSelectedDate] = useState(TODAY);

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

  // ── HL to VA data ──────────────────────────────────────────────────────────
  const [hvFrom, setHvFrom] = useState(YESTERDAY);
  const [hvTo, setHvTo] = useState(YESTERDAY);

  // Column-header filters for the HL to VA table (multi-select per column)
  const [hvBatchFilter, setHvBatchFilter] = useState<string[]>([]);
  const [hvCountFilter, setHvCountFilter] = useState<string[]>([]);
  const [hvVarietyFilter, setHvVarietyFilter] = useState<string[]>([]);
  const [hvGradeFilter, setHvGradeFilter] = useState<string[]>([]);

  // Follow the Daily Report date navigation: whenever the shared report date
  // changes (header arrows / Report Date picker), snap the HL to VA range to
  // that same single day. Presets and manual pickers can still override afterward.
  useEffect(() => {
    setHvFrom(selectedDate);
    setHvTo(selectedDate);
  }, [selectedDate]);

  // Sub-users: clamp range to yesterday–today
  useEffect(() => {
    if (isSubUser) {
      if (hvFrom < YESTERDAY) setHvFrom(YESTERDAY);
      if (hvTo > TODAY) setHvTo(TODAY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubUser, hvFrom, hvTo]);

  const { rangeEntries: hvEntries, rangeLoading: hvLoading, fetchRange: fetchHvRange } = useHlVa();

  // Separate single-date fetch for the Grade Vs VA Report
  const { entries: gradeVaEntries, fetchEntries: fetchGradeVaEntries } = useHlVa();

  useEffect(() => {
    if (selectedDate) fetchGradeVaEntries(selectedDate);
  }, [selectedDate, fetchGradeVaEntries]);

  // ── Grading register data ──────────────────────────────────────────────────
  const { entries: gradingEntries, fetchEntries: fetchGradingEntries } = useGrading();

  useEffect(() => {
    if (selectedDate) fetchGradingEntries(selectedDate);
  }, [selectedDate, fetchGradingEntries]);

  useEffect(() => {
    if (hvFrom && hvTo && hvFrom <= hvTo) {
      fetchHvRange(hvFrom, hvTo);
    }
  }, [hvFrom, hvTo, fetchHvRange]);

  // Clear column filters whenever the date range changes (avoids stale
  // selections that no longer exist in the newly fetched data set). Done by
  // comparing against the previous render's range — React's recommended
  // alternative to a state-syncing effect.
  const hvRangeKey = `${hvFrom}|${hvTo}`;
  const [hvPrevRangeKey, setHvPrevRangeKey] = useState(hvRangeKey);
  if (hvRangeKey !== hvPrevRangeKey) {
    setHvPrevRangeKey(hvRangeKey);
    setHvBatchFilter([]);
    setHvCountFilter([]);
    setHvVarietyFilter([]);
    setHvGradeFilter([]);
  }

  // ── Combined location-wise summary for the selected date ──
  // HON to HL column = HL kgs produced (HON→HL output)
  // HL to VA  column = VA kgs produced (HL→VA output)
  const combinedLocationSummary = useMemo(() => {
    const map = new Map<string, { honToHl: number; hlToVa: number }>();
    const bucket = (loc: string) => {
      let agg = map.get(loc);
      if (!agg) {
        agg = { honToHl: 0, hlToVa: 0 };
        map.set(loc, agg);
      }
      return agg;
    };

    entries.forEach((e) => {
      bucket(e.location?.name || 'Unknown').honToHl += Number(e.hl_kgs) || 0;
    });
    gradeVaEntries.forEach((e) => {
      bucket(e.location?.name || 'Unknown').hlToVa += Number(e.va_kgs) || 0;
    });

    const rows = Array.from(map.entries())
      .map(([location, v]) => ({ location, honToHl: v.honToHl, hlToVa: v.hlToVa }))
      .sort((a, b) => a.location.localeCompare(b.location));
    const totals = rows.reduce(
      (acc, r) => {
        acc.honToHl += r.honToHl;
        acc.hlToVa += r.hlToVa;
        return acc;
      },
      { honToHl: 0, hlToVa: 0 }
    );
    return { rows, totals };
  }, [entries, gradeVaEntries]);

  // Distinct values for the HL→VA column-header filter dropdowns
  const hvColumnOptions = useMemo(() => {
    const batch = new Set<string>();
    const count = new Set<string>();
    const variety = new Set<string>();
    const grade = new Set<string>();
    hvEntries.forEach((e) => {
      if (e.batch_id) batch.add(String(e.batch_id));
      if (e.count_text) count.add(String(e.count_text));
      if (e.variety) variety.add(String(e.variety));
      const g = e.grade || lookupHlVaCountRange(e.count_text);
      if (g) grade.add(String(g));
    });
    const natural = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    return {
      batch: Array.from(batch).sort(natural),
      count: Array.from(count).sort(natural),
      variety: Array.from(variety).sort(natural),
      grade: Array.from(grade).sort(natural),
    };
  }, [hvEntries]);

  // HL→VA entries after applying the column-header filters
  const hvFiltered = useMemo(() => {
    if (!hvBatchFilter.length && !hvCountFilter.length && !hvVarietyFilter.length && !hvGradeFilter.length) {
      return hvEntries;
    }
    return hvEntries.filter((e) => {
      if (hvBatchFilter.length && !hvBatchFilter.includes(String(e.batch_id ?? ''))) return false;
      if (hvCountFilter.length && !hvCountFilter.includes(String(e.count_text ?? ''))) return false;
      if (hvVarietyFilter.length && !hvVarietyFilter.includes(String(e.variety ?? ''))) return false;
      if (hvGradeFilter.length) {
        const g = String(e.grade || lookupHlVaCountRange(e.count_text) || '');
        if (!hvGradeFilter.includes(g)) return false;
      }
      return true;
    });
  }, [hvEntries, hvBatchFilter, hvCountFilter, hvVarietyFilter, hvGradeFilter]);

  // Totals over entries
  const hvTotals = useMemo(() => {
    return hvFiltered.reduce(
      (acc, entry) => {
        acc.totalHl += Number(entry.hl_kgs) || 0;
        acc.totalVa += Number(entry.va_kgs) || 0;
        return acc;
      },
      { totalHl: 0, totalVa: 0 }
    );
  }, [hvFiltered]);

  const hvTotalYieldPct = calculateYield(hvTotals.totalHl, hvTotals.totalVa);

  // Top grade by VA quantity (for summary card)
  const hvTopGrade = useMemo(() => {
    const byGrade = new Map<string, number>();
    hvFiltered.forEach((e) => {
      const g = e.grade || lookupHlVaCountRange(e.count_text) || 'Unknown';
      byGrade.set(g, (byGrade.get(g) || 0) + (Number(e.va_kgs) || 0));
    });
    let top: { grade: string; total: number } | null = null;
    byGrade.forEach((total, grade) => {
      if (!top || total > top.total) top = { grade, total };
    });
    return top as { grade: string; total: number } | null;
  }, [hvFiltered]);

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

  // Human-readable label for the current HL to VA date range.
  const hvMeta = useMemo(() => {
    const fmt = (s: string) => {
      try {
        return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch {
        return s;
      }
    };
    const label = hvFrom === hvTo ? fmt(hvFrom) : `${fmt(hvFrom)} – ${fmt(hvTo)}`;
    return { label };
  }, [hvFrom, hvTo]);

  // Full date for the printed masthead — the on-screen chip is abbreviated
  const printDateLabel = useMemo(() => {
    try {
      return new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // The filter boxes don't print, so a narrowed HON→HL table says so on paper instead
  const printFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (diffFilter !== 'All') parts.push(`Difference: ${diffFilter}`);
    if (locationFilter !== 'All') parts.push(`Location: ${locationFilter}`);
    if (graderFilter !== 'All') parts.push(`Grader: ${graderFilter}`);
    return parts.join(' · ');
  }, [diffFilter, locationFilter, graderFilter]);

  return (
    <div className="animate-fade-in pb-20 lg:pb-6">
      {/* Screen header carries date navigation; paper gets its own masthead below */}
      <div className="print:hidden">
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
            {/* Header shows the exact date all report sections below are showing */}
            <span className="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
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
      </div>

      <div className="px-4 mt-2 space-y-6">

        {/* Paper-only masthead — the on-screen header is dropped when printing */}
        <div className="hidden print:block border-b-2 border-teal-600 pb-2 mb-2">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Daily Report</h1>
              <p className="text-xs text-gray-600">{printDateLabel}</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-teal-700">PPC Manager</div>
              <div className="text-[10px] text-gray-500">Prawn Processing Control</div>
            </div>
          </div>
        </div>

        {/* Print the whole report — offered again at the foot of the page */}
        <div className="flex justify-end print:hidden">
          <PrintButton label="Print full report / Save as PDF" />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            LOCATION-WISE SUMMARY: HON→HL & HL→VA (selected date)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-center gap-2">
            <span className="text-lg">📍</span>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Location-wise Summary (HON→HL &amp; HL→VA)</h3>
          </div>
          {loading ? (
            <div className="p-6 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : combinedLocationSummary.rows.length === 0 ? (
            <div className="px-4 pb-5 text-center text-sm text-gray-400">No entries for this date.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-teal-500 uppercase tracking-wider whitespace-nowrap text-right">HON to HL (KGS)</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap text-right">HL to VA (KGS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {combinedLocationSummary.rows.map((row) => (
                    <tr key={row.location} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{row.location}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{formatVaQty(row.honToHl)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{formatVaQty(row.hlToVa)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
                    <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">TOTAL</td>
                    <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{formatVaQty(combinedLocationSummary.totals.honToHl)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{formatVaQty(combinedLocationSummary.totals.hlToVa)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: HON TO HL YIELDS
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="pt-2 pb-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">HON to HL yields</h2>
            {printFilterLabel && (
              <p className="hidden print:block text-[10px] font-semibold text-gray-600 mt-0.5">
                Filtered — {printFilterLabel}
              </p>
            )}
          </div>

          {/* Date Selector — a screen control, the printed masthead carries the date */}
          <div className="print:hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
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

          {/* HON to HL Filters — screen only; the print run shows what they narrowed to */}
          <div className="print:hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
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
            SECTION 3: HL TO VA
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="pt-2 pb-1 flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">HL to VA</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{hvMeta.label}</span>
          </div>

          {/* Date Range + Presets — screen only; the section heading carries the range */}
          <div className="print:hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">From Date</label>
                <input
                  type="date"
                  value={hvFrom}
                  min={isSubUser ? YESTERDAY : undefined}
                  max={isSubUser ? TODAY : hvTo}
                  onChange={(e) => setHvFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">To Date</label>
                <input
                  type="date"
                  value={hvTo}
                  min={isSubUser ? YESTERDAY : hvFrom}
                  max={isSubUser ? TODAY : undefined}
                  onChange={(e) => setHvTo(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Summary cards */}
          {!hvLoading && hvFiltered.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-3 border border-indigo-200">
                <p className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wide">Total HL (KGS)</p>
                <p className="text-lg font-bold text-indigo-800 mt-0.5">{formatVaQty(hvTotals.totalHl)}</p>
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-3 border border-indigo-200">
                <p className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wide">Total VA (KGS)</p>
                <p className="text-lg font-bold text-indigo-800 mt-0.5">{formatVaQty(hvTotals.totalVa)}</p>
              </div>
              <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-2xl p-3 border border-teal-200">
                <p className="text-[10px] text-teal-600 font-semibold uppercase tracking-wide">Overall Yield</p>
                <p className="text-lg font-bold text-teal-800 mt-0.5">{hvTotalYieldPct !== null ? `${hvTotalYieldPct.toFixed(2)}%` : '—'}</p>
              </div>
              {hvTopGrade && (
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-3 border border-emerald-200">
                  <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">🏆 Top Grade</p>
                  <p className="text-lg font-bold text-emerald-800 mt-0.5">{hvTopGrade.grade}</p>
                  <p className="text-[11px] text-emerald-600 font-medium">{formatVaQty(hvTopGrade.total)} kg VA</p>
                </div>
              )}
            </div>
          )}

          {/* HL to VA Report Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {hvLoading ? (
              <div className="p-8 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : hvEntries.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-3 text-indigo-600 text-xl">📦</div>
                <p className="text-sm font-semibold text-gray-900">No Data Available</p>
                <p className="text-sm text-gray-500 mt-1">There are no HL to VA entries between {hvFrom} and {hvTo}.</p>
              </div>
            ) : hvFiltered.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-3 text-indigo-600 text-xl">🔍</div>
                <p className="text-sm font-semibold text-gray-900">No Matches Found</p>
                <p className="text-sm text-gray-500 mt-1">No batches match the selected column filters.</p>
                <button
                  type="button"
                  onClick={() => { setHvBatchFilter([]); setHvCountFilter([]); setHvVarietyFilter([]); setHvGradeFilter([]); }}
                  className="mt-3 text-sm font-semibold text-indigo-600 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Date</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <ColumnFilter
                          label="Batch ID"
                          options={hvColumnOptions.batch}
                          selected={hvBatchFilter}
                          onChange={setHvBatchFilter}
                        />
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <ColumnFilter
                          label="Count"
                          options={hvColumnOptions.count}
                          selected={hvCountFilter}
                          onChange={setHvCountFilter}
                        />
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <ColumnFilter
                          label="Variety"
                          options={hvColumnOptions.variety}
                          selected={hvVarietyFilter}
                          onChange={setHvVarietyFilter}
                        />
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">VA (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap">
                        <ColumnFilter
                          label="Grade"
                          options={hvColumnOptions.grade}
                          selected={hvGradeFilter}
                          onChange={setHvGradeFilter}
                        />
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Grader Name</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-teal-500 uppercase tracking-wider whitespace-nowrap text-right">Yield</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-purple-500 uppercase tracking-wider whitespace-nowrap text-right">Std %</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {hvFiltered.map((entry) => {
                      const hlNum = Number(entry.hl_kgs) || 0;
                      const vaNum = Number(entry.va_kgs) || 0;
                      const yieldPct = calculateYield(hlNum, vaNum);
                      const stdYield = lookupHlVaStandardYield(entry.count_text, entry.variety);
                      const diff = calculateYieldDifference(yieldPct, stdYield);
                      const grade = entry.grade || lookupHlVaCountRange(entry.count_text) || '-';
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/80 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">{entry.work_date}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{entry.batch_id}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.count_text}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">{entry.variety || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{hlNum.toFixed(3)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{vaNum.toFixed(3)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.location?.name || 'Unknown'}</td>
                          <td className="px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap">{grade}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{entry.grader_name}</td>
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
                      <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap sticky left-0 bg-indigo-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#e0e7ff] dark:shadow-[1px_0_0_0_#3730a3]">TOTALS</td>
                      <td className="px-4 py-3 text-sm text-indigo-800 dark:text-indigo-300 whitespace-nowrap">{hvFiltered.length} batches</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right">{hvTotals.totalHl.toFixed(3)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right">{hvTotals.totalVa.toFixed(3)}</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-sm font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap text-right">{hvTotalYieldPct !== null ? `${hvTotalYieldPct.toFixed(2)}%` : '-'}</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ─── Grade Vs VA Report ─────────────────────────────────────── */}
        <div className="mb-8">
          <GradeVaReport
            entries={gradeVaEntries}
            date={selectedDate}
          />
        </div>

        {/* ─── All PPC's Grading Data ─────────────────────────────────── */}
        <div className="mb-8">
          <GradingDataReport entries={gradingEntries} date={selectedDate} />
        </div>

        {/* ─── Labour Breakdown ───────────────────────────────────────── */}
        <div className="mb-8">
          <LabourBreakdownReport date={selectedDate} />
        </div>

        {/* Same action as the top of the page, for whoever has scrolled this far */}
        <div className="flex justify-end pb-4 print:hidden">
          <PrintButton label="Print full report / Save as PDF" />
        </div>

        {/* Paper-only footer */}
        <div className="hidden print:block border-t border-gray-300 pt-2 text-[9px] text-gray-500 text-center">
          Generated by PPC Manager — {printDateLabel}
        </div>

      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useYield } from '@/hooks/useYield';
import { useNonLocalLadies } from '@/hooks/useNonLocalLadies';
import { useHlVa } from '@/hooks/useHlVa';
import { calculateYield, lookupStandardYield, calculateYieldDifference } from '@/lib/yieldChart';
import { VA_VARIETIES, formatVaQty, lookupHlVaStandardYield, lookupHlVaCountRange } from '@/lib/hlVa';
import GradeVaReport from '@/components/reports/GradeVaReport';

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

  // ── Location-wise summary of the day's HON→HL entries (all entries, unfiltered) ──
  const locationSummary = useMemo(() => {
    const map = new Map<string, { batches: number; hon: number; hl: number; stdWeighted: number; honWithStd: number }>();
    entries.forEach((e) => {
      const loc = e.location?.name || 'Unknown';
      let agg = map.get(loc);
      if (!agg) {
        agg = { batches: 0, hon: 0, hl: 0, stdWeighted: 0, honWithStd: 0 };
        map.set(loc, agg);
      }
      const hon = Number(e.hon_kgs) || 0;
      const hl = Number(e.hl_kgs) || 0;
      agg.batches += 1;
      agg.hon += hon;
      agg.hl += hl;
      const std = lookupStandardYield(e.count_text);
      if (std !== null && hon > 0) {
        agg.stdWeighted += std * hon;
        agg.honWithStd += hon;
      }
    });
    return Array.from(map.entries())
      .map(([location, a]) => {
        const yieldPct = a.hon > 0 ? (a.hl / a.hon) * 100 : null;
        const stdPct = a.honWithStd > 0 ? a.stdWeighted / a.honWithStd : null;
        const diff = yieldPct !== null && stdPct !== null ? yieldPct - stdPct : null;
        return { location, batches: a.batches, hon: a.hon, hl: a.hl, yieldPct, stdPct, diff };
      })
      .sort((x, y) => x.location.localeCompare(y.location));
  }, [entries]);

  const summaryTotals = useMemo(() => {
    const hon = locationSummary.reduce((s, r) => s + r.hon, 0);
    const hl = locationSummary.reduce((s, r) => s + r.hl, 0);
    const batches = locationSummary.reduce((s, r) => s + r.batches, 0);
    const yieldPct = hon > 0 ? (hl / hon) * 100 : null;
    return { hon, hl, batches, yieldPct };
  }, [locationSummary]);

  // Open a styled, print-ready window (user can "Save as PDF" from the print dialog)
  const handlePrintSummary = () => {
    if (locationSummary.length === 0) return;
    const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const pct = (v: number | null) => (v !== null ? `${v.toFixed(2)}%` : '-');
    const diffBadge = (v: number | null) =>
      v !== null
        ? `<span class="badge ${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`
        : '-';

    const rowsHtml = locationSummary
      .map(
        (r, i) => `
        <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
          <td class="loc">${r.location}</td>
          <td class="num">${r.batches}</td>
          <td class="num">${fmt(r.hon)}</td>
          <td class="num">${fmt(r.hl)}</td>
          <td class="num bold teal">${pct(r.yieldPct)}</td>
          <td class="num bold purple">${pct(r.stdPct)}</td>
          <td class="num">${diffBadge(r.diff)}</td>
        </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>HON to HL Yields — ${dateLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 28px; background: #fff; }
  .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 55%, #115e59 100%); color: #fff; border-radius: 16px; padding: 22px 26px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 21px; letter-spacing: 0.3px; }
  .header .sub { font-size: 12px; opacity: 0.85; margin-top: 4px; }
  .header .brand { text-align: right; }
  .header .brand .name { font-size: 14px; font-weight: 700; }
  .header .brand .tag { font-size: 10px; opacity: 0.8; }
  .chips { display: flex; gap: 12px; margin: 18px 0; }
  .chip { flex: 1; border-radius: 14px; padding: 14px 16px; border: 1px solid #e5e7eb; }
  .chip .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }
  .chip .value { font-size: 20px; font-weight: 800; margin-top: 4px; }
  .chip.hon { background: #f0fdfa; border-color: #99f6e4; } .chip.hon .label { color: #0d9488; } .chip.hon .value { color: #115e59; }
  .chip.hl { background: #eef2ff; border-color: #c7d2fe; } .chip.hl .label { color: #4f46e5; } .chip.hl .value { color: #3730a3; }
  .chip.yield { background: #ecfdf5; border-color: #a7f3d0; } .chip.yield .label { color: #059669; } .chip.yield .value { color: #065f46; }
  .chip.batches { background: #fffbeb; border-color: #fde68a; } .chip.batches .label { color: #d97706; } .chip.batches .value { color: #92400e; }
  table { width: 100%; border-collapse: collapse; border-radius: 14px; overflow: hidden; box-shadow: 0 0 0 1px #e5e7eb; }
  thead th { background: #0d9488; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; padding: 11px 14px; text-align: right; }
  thead th:first-child { text-align: left; }
  td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
  td.loc { font-weight: 700; color: #111827; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.bold { font-weight: 700; }
  td.teal { color: #0f766e; }
  td.purple { color: #6d28d9; }
  tr.even td { background: #fafafa; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; }
  .badge.pos { background: #d1fae5; color: #047857; }
  .badge.neg { background: #ffe4e6; color: #be123c; }
  tfoot td { background: #ccfbf1; font-weight: 800; color: #134e4a; border-top: 2px solid #5eead4; padding: 12px 14px; }
  .footer { margin-top: 20px; font-size: 10px; color: #9ca3af; text-align: center; }
  @page { size: A4; margin: 12mm; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>HON to HL Yields — Location-wise Summary</h1>
      <div class="sub">${dateLabel}</div>
    </div>
    <div class="brand">
      <div class="name">PPC Manager</div>
      <div class="tag">Prawn Processing Control</div>
    </div>
  </div>
  <div class="chips">
    <div class="chip batches"><div class="label">Batches</div><div class="value">${summaryTotals.batches}</div></div>
    <div class="chip hon"><div class="label">Total HON (KGS)</div><div class="value">${fmt(summaryTotals.hon)}</div></div>
    <div class="chip hl"><div class="label">Total HL (KGS)</div><div class="value">${fmt(summaryTotals.hl)}</div></div>
    <div class="chip yield"><div class="label">Overall Yield</div><div class="value">${pct(summaryTotals.yieldPct)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Location</th><th>Batches</th><th>HON (KGS)</th><th>HL (KGS)</th><th>Yield %</th><th>Std %</th><th>Difference</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL</td>
        <td class="num">${summaryTotals.batches}</td>
        <td class="num">${fmt(summaryTotals.hon)}</td>
        <td class="num">${fmt(summaryTotals.hl)}</td>
        <td class="num">${pct(summaryTotals.yieldPct)}</td>
        <td class="num"></td>
        <td class="num"></td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">Generated by PPC Manager on ${new Date().toLocaleString('en-IN')}</div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      alert('Please allow pop-ups for this site to print the summary.');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
  };

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
  const MONTH_START = TODAY.slice(0, 8) + '01';
  const [hvFrom, setHvFrom] = useState(YESTERDAY);
  const [hvTo, setHvTo] = useState(YESTERDAY);
  const [hvDiffFilter, setHvDiffFilter] = useState('All');
  const [hvLocationFilter, setHvLocationFilter] = useState('All');
  const [hvGraderFilter, setHvGraderFilter] = useState('All');
  const [hvVarietyFilter, setHvVarietyFilter] = useState<string[]>([]);   // empty = all varieties

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

  useEffect(() => {
    if (hvFrom && hvTo && hvFrom <= hvTo) {
      fetchHvRange(hvFrom, hvTo);
    }
  }, [hvFrom, hvTo, fetchHvRange]);

  // Derive filter options
  const { hvLocations, hvGraders } = useMemo(() => {
    const locSet = new Set<string>();
    const gradSet = new Set<string>();
    hvEntries.forEach((entry) => {
      if (entry.location?.name) locSet.add(entry.location.name);
      if (entry.grader_name) gradSet.add(entry.grader_name);
    });
    return {
      hvLocations: Array.from(locSet).sort(),
      hvGraders: Array.from(gradSet).sort(),
    };
  }, [hvEntries]);

  // Apply filters
  const hvFiltered = useMemo(() => {
    return hvEntries.filter((entry) => {
      if (hvLocationFilter !== 'All' && (entry.location?.name || 'Unknown') !== hvLocationFilter) return false;
      if (hvGraderFilter !== 'All' && entry.grader_name !== hvGraderFilter) return false;
      if (hvVarietyFilter.length > 0 && !hvVarietyFilter.includes(entry.variety)) return false;
      if (hvDiffFilter !== 'All') {
        const hlNum = Number(entry.hl_kgs) || 0;
        const vaNum = Number(entry.va_kgs) || 0;
        const yieldPct = calculateYield(hlNum, vaNum);
        const stdYield = lookupHlVaStandardYield(entry.count_text, entry.variety);
        const diff = calculateYieldDifference(yieldPct, stdYield);
        if (diff === null) return false;
        if (hvDiffFilter === 'Positive' && diff < 0) return false;
        if (hvDiffFilter === 'Negative' && diff >= 0) return false;
      }
      return true;
    });
  }, [hvEntries, hvDiffFilter, hvLocationFilter, hvGraderFilter, hvVarietyFilter]);

  // Totals over filtered entries
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

  const toggleHvVariety = (variety: string) => {
    setHvVarietyFilter((prev) =>
      prev.includes(variety) ? prev.filter((v) => v !== variety) : [...prev, variety]
    );
  };

  // Quick range presets
  const applyHvPreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth') => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().split('T')[0];
    if (preset === 'today') {
      setHvFrom(TODAY); setHvTo(TODAY);
    } else if (preset === 'yesterday') {
      setHvFrom(YESTERDAY); setHvTo(YESTERDAY);
    } else if (preset === 'last7') {
      setHvFrom(iso(new Date(Date.now() - 6 * 86400000))); setHvTo(TODAY);
    } else if (preset === 'thisMonth') {
      setHvFrom(MONTH_START); setHvTo(TODAY);
    } else if (preset === 'lastMonth') {
      const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endLast = new Date(now.getFullYear(), now.getMonth(), 0);
      // Use UTC-safe manual formatting to avoid timezone shifts
      const pad = (n: number) => String(n).padStart(2, '0');
      setHvFrom(`${firstLast.getFullYear()}-${pad(firstLast.getMonth() + 1)}-${pad(firstLast.getDate())}`);
      setHvTo(`${endLast.getFullYear()}-${pad(endLast.getMonth() + 1)}-${pad(endLast.getDate())}`);
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

  // Which quick preset (if any) the current HL to VA range matches, plus a
  // human-readable label — so it's obvious the section is showing "Yesterday".
  const PRESET_LABELS: Record<string, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    last7: 'Last 7 Days',
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
  };
  const hvMeta = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const last7From = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
    const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLast = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthFrom = `${firstLast.getFullYear()}-${pad(firstLast.getMonth() + 1)}-${pad(firstLast.getDate())}`;
    const lastMonthTo = `${endLast.getFullYear()}-${pad(endLast.getMonth() + 1)}-${pad(endLast.getDate())}`;

    let preset: string | null = null;
    if (hvFrom === hvTo && hvFrom === TODAY) preset = 'today';
    else if (hvFrom === hvTo && hvFrom === YESTERDAY) preset = 'yesterday';
    else if (hvFrom === last7From && hvTo === TODAY) preset = 'last7';
    else if (hvFrom === MONTH_START && hvTo === TODAY) preset = 'thisMonth';
    else if (hvFrom === lastMonthFrom && hvTo === lastMonthTo) preset = 'lastMonth';

    const fmt = (s: string) => {
      try {
        return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch {
        return s;
      }
    };
    const label = hvFrom === hvTo ? fmt(hvFrom) : `${fmt(hvFrom)} – ${fmt(hvTo)}`;
    return { preset, label };
  }, [hvFrom, hvTo, TODAY, YESTERDAY, MONTH_START]);

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

          {/* Location-wise Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-lg">📍</span>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Location-wise Summary</h3>
              </div>
              <button
                type="button"
                onClick={handlePrintSummary}
                disabled={loading || locationSummary.length === 0}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold rounded-xl shadow-sm shadow-teal-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                🖨️ Print / Save as PDF
              </button>
            </div>
            {loading ? (
              <div className="p-6 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : locationSummary.length === 0 ? (
              <div className="px-4 pb-5 text-center text-sm text-gray-400">No yield entries for this date.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Batches</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HON (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-teal-500 uppercase tracking-wider whitespace-nowrap text-right">Yield %</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-purple-500 uppercase tracking-wider whitespace-nowrap text-right">Std %</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {locationSummary.map((row) => (
                      <tr key={row.location} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{row.location}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-right">{row.batches}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{row.hon.toFixed(3)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{row.hl.toFixed(3)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap text-right">{row.yieldPct !== null ? `${row.yieldPct.toFixed(2)}%` : '-'}</td>
                        <td className="px-4 py-3 text-sm font-bold text-purple-700 dark:text-purple-400 whitespace-nowrap text-right">{row.stdPct !== null ? `${row.stdPct.toFixed(2)}%` : '-'}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                          {row.diff !== null ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${row.diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {row.diff >= 0 ? '+' : ''}{row.diff.toFixed(2)}%
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">TOTAL</td>
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{summaryTotals.batches}</td>
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{summaryTotals.hon.toFixed(3)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{summaryTotals.hl.toFixed(3)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{summaryTotals.yieldPct !== null ? `${summaryTotals.yieldPct.toFixed(2)}%` : '-'}</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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
            SECTION 3: HL TO VA
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="pt-2 pb-1 flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">HL to VA</h2>
            {hvMeta.preset && (
              <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-wide">
                {PRESET_LABELS[hvMeta.preset]}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{hvMeta.label}</span>
          </div>

          {/* Date Range + Presets */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
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
                  onClick={() => applyHvPreset(p.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    hvMeta.preset === p.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters: Variety + Difference / Location / Grader */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
            {/* Variety filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Variety</label>
                {hvVarietyFilter.length > 0 && (
                  <button type="button" onClick={() => setHvVarietyFilter([])} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    Show All
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {VA_VARIETIES.map((v) => {
                  const active = hvVarietyFilter.length === 0 || hvVarietyFilter.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleHvVariety(v)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Tap a variety to filter the table to specific varieties only.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Difference</label>
                <select
                  value={hvDiffFilter}
                  onChange={(e) => setHvDiffFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="All">All</option>
                  <option value="Positive">Positive (+)</option>
                  <option value="Negative">Negative (-)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Location</label>
                <select
                  value={hvLocationFilter}
                  onChange={(e) => setHvLocationFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="All">All Locations</option>
                  {hvLocations.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Grader Name</label>
                <select
                  value={hvGraderFilter}
                  onChange={(e) => setHvGraderFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="All">All Graders</option>
                  {hvGraders.map((grader) => (
                    <option key={grader} value={grader}>{grader}</option>
                  ))}
                </select>
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
                <p className="text-sm text-gray-500 mt-1">Try adjusting your filters to see more results.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[1px_0_0_0_#f3f4f6] dark:shadow-[1px_0_0_0_#374151]">Date</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Batch ID</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Count</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Variety</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">VA (KGS)</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap">Grade</th>
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

      </div>
    </div>
  );
}

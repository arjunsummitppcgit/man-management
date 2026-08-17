'use client';

import React, { useEffect, useState } from 'react';
import { format, subDays, startOfMonth } from 'date-fns';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import HeadWasteReport from '@/components/reports/HeadWasteReport';
import { useYield } from '@/hooks/useYield';
import { useHlVa } from '@/hooks/useHlVa';

/**
 * Head Waste Statement on the Analytics page. It owns its own From/To pickers
 * rather than using the shared range filter (see IGNORES_FILTERS on the
 * analytics page), because it reads yield_entries / hl_va_entries directly
 * instead of the daily_processing aggregates useAnalytics loads — that way the
 * figures match the copy on the Daily Report page exactly.
 *
 * A single day is still the common case, so the range starts as today → today
 * and the presets below cover the usual spans.
 */
const today = () => format(new Date(), 'yyyy-MM-dd');

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => [today(), today()] },
  { label: '7 Days', range: () => [format(subDays(new Date(), 6), 'yyyy-MM-dd'), today()] },
  { label: '30 Days', range: () => [format(subDays(new Date(), 29), 'yyyy-MM-dd'), today()] },
  { label: 'This Month', range: () => [format(startOfMonth(new Date()), 'yyyy-MM-dd'), today()] },
];

export default function HeadWasteSection() {
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const { rangeEntries: yieldEntries, rangeLoading: yieldLoading, fetchRange: fetchYieldRange } = useYield();
  const { rangeEntries: hlVaEntries, rangeLoading: hlVaLoading, fetchRange: fetchHlVaRange } = useHlVa();

  useEffect(() => {
    if (!fromDate || !toDate) return;
    // Tolerate a picker left the wrong way round rather than querying an empty span
    const [from, to] = fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];
    fetchYieldRange(from, to);
    fetchHlVaRange(from, to);
  }, [fromDate, toDate, fetchYieldRange, fetchHlVaRange]);

  const loading = yieldLoading || hlVaLoading;
  const activePreset = PRESETS.find((p) => {
    const [f, t] = p.range();
    return f === fromDate && t === toDate;
  })?.label;

  const dateInput =
    'px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white';

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Stands in for the shared filter bar, which this section doesn't use */}
      <div className="ana-filterbar no-print bg-white rounded-2xl p-3 lg:p-3.5 shadow-sm border border-gray-100 flex flex-wrap items-center gap-2.5">
        <label
          htmlFor="head-waste-from"
          className="text-[11px] font-bold text-gray-500 uppercase tracking-wider"
        >
          From
        </label>
        <input
          id="head-waste-from"
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => e.target.value && setFromDate(e.target.value)}
          className={dateInput}
        />

        <label
          htmlFor="head-waste-to"
          className="text-[11px] font-bold text-gray-500 uppercase tracking-wider"
        >
          To
        </label>
        <input
          id="head-waste-to"
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => e.target.value && setToDate(e.target.value)}
          className={dateInput}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const [f, t] = p.range();
                setFromDate(f);
                setToDate(t);
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                activePreset === p.label
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                  : 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-gray-400 font-medium">
          {fromDate === toDate
            ? 'a single day — head waste is a daily register'
            : 'waste totalled across the selected dates'}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <HeadWasteReport
          yieldEntries={yieldEntries}
          hlVaEntries={hlVaEntries}
          fromDate={fromDate}
          toDate={toDate}
        />
      )}
    </div>
  );
}

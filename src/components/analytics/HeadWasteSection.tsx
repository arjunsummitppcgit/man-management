'use client';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import HeadWasteReport from '@/components/reports/HeadWasteReport';
import { useYield } from '@/hooks/useYield';
import { useHlVa } from '@/hooks/useHlVa';

/**
 * Head Waste Statement on the Analytics page. Deliberately single-date rather
 * than range-based: the statement is a daily register and reads that way, so it
 * owns its own date picker and the shared range filter is hidden for this
 * section (see IGNORES_FILTERS on the analytics page).
 *
 * It also reads yield_entries / hl_va_entries directly rather than the
 * daily_processing aggregates useAnalytics loads, so the figures match the copy
 * on the Daily Report page exactly.
 */
export default function HeadWasteSection() {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const { entries: yieldEntries, loading: yieldLoading, fetchYieldEntries } = useYield();
  const { entries: hlVaEntries, loading: hlVaLoading, fetchEntries: fetchHlVaEntries } = useHlVa();

  useEffect(() => {
    if (date) {
      fetchYieldEntries(date);
      fetchHlVaEntries(date);
    }
  }, [date, fetchYieldEntries, fetchHlVaEntries]);

  const loading = yieldLoading || hlVaLoading;

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Stands in for the shared filter bar, which doesn't apply to a daily statement */}
      <div className="ana-filterbar bg-white rounded-2xl p-3 lg:p-3.5 shadow-sm border border-gray-100 flex flex-wrap items-center gap-2.5">
        <label
          htmlFor="head-waste-date"
          className="text-[11px] font-bold text-gray-500 uppercase tracking-wider"
        >
          Statement Date
        </label>
        <input
          id="head-waste-date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white"
        />
        <span className="text-[11px] text-gray-400 font-medium">
          one day at a time — head waste is a daily register
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <HeadWasteReport yieldEntries={yieldEntries} hlVaEntries={hlVaEntries} date={date} />
      )}
    </div>
  );
}

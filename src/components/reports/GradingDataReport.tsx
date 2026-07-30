'use client';

import React, { useMemo } from 'react';
import {
  GRADING_UNITS,
  formatTime,
  runningHours,
  formatHours,
} from '@/lib/grading';
import type { GradingEntry } from '@/types';

interface GradingDataReportProps {
  entries: GradingEntry[];
  date: string;
}

const fmtQty = (value: number | null): string =>
  value !== null && value > 0
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '-';

/** Graded kg per hour the unit actually ran — the productivity read. */
const perHour = (qty: number | null, hours: number | null): string => {
  if (qty === null || qty <= 0 || hours === null || hours <= 0) return '-';
  return (qty / hours).toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

export default function GradingDataReport({ entries, date }: GradingDataReportProps) {
  const byUnit = useMemo(() => {
    const map = new Map<string, GradingEntry>();
    entries.forEach((e) => map.set(e.unit_key, e));
    return map;
  }, [entries]);

  const rows = useMemo(
    () =>
      GRADING_UNITS.map((unit) => {
        const entry = byUnit.get(unit.key);
        const start = entry?.start_time ?? null;
        const stop = entry?.stop_time ?? null;
        const qty = entry?.total_grading_qty ?? null;
        const hours = unit.kind === 'machine' ? runningHours(start, stop) : null;
        return {
          unit,
          start,
          stop,
          qty: qty !== null ? Number(qty) : null,
          hours,
          note: entry?.note?.trim() || '',
        };
      }),
    [byUnit]
  );

  const machineRows = rows.filter((r) => r.unit.kind === 'machine');
  const totalQty = machineRows.reduce((s, r) => s + (r.qty || 0), 0);
  const totalHours = machineRows.reduce((s, r) => s + (r.hours || 0), 0);

  // Nothing entered at all — don't print an empty grid
  const hasAnyData = rows.some(
    (r) => r.start || r.stop || (r.qty !== null && r.qty > 0) || r.note
  );

  const dateLabel = useMemo(() => {
    try {
      return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return date;
    }
  }, [date]);

  return (
    <div className="space-y-4">
      <div className="pt-2 pb-1">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          All PPC&apos;s Grading Data
          <span className="ml-2 text-sm font-semibold text-gray-400">Machine running hours</span>
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Start and stop times on {dateLabel}, with the hours each unit actually ran.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {!hasAnyData ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sky-50 mb-3 text-sky-600 text-xl">
              ⚙️
            </div>
            <p className="text-sm font-semibold text-gray-900">No grading data on this date</p>
            <p className="text-sm text-gray-500 mt-1">
              Nothing was entered for {dateLabel} on the Grading tab of the Daily Entry page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    PPC Name
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center border-l border-gray-200 dark:border-gray-700">
                    Start Time
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">
                    Stop Time
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-sky-600 uppercase tracking-wider whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">
                    Running Hours
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                    Total Grading Qty
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                    Kg / Hr
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.unit.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{r.unit.label}</td>

                    {r.unit.kind === 'note' ? (
                      // Boys timing lines carry one free-text value across the
                      // time columns and have no quantity, as on the paper sheet
                      <td
                        className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 text-center border-l border-gray-100 dark:border-gray-800"
                        colSpan={5}
                      >
                        {r.note || '-'}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-center font-medium border-l border-gray-100 dark:border-gray-800">
                          {formatTime(r.start) || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-center font-medium">
                          {formatTime(r.stop) || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-sky-700 dark:text-sky-400 whitespace-nowrap text-right border-l border-gray-100 dark:border-gray-800">
                          {formatHours(r.hours) || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">
                          {fmtQty(r.qty)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-right font-medium">
                          {perHour(r.qty, r.hours)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                {/* .dark .text-sky-900 is lightened in globals.css */}
                <tr className="bg-sky-50 dark:bg-sky-900/30 border-t-2 border-sky-100 dark:border-sky-800">
                  <td className="px-4 py-3 text-sm font-bold text-sky-900 whitespace-nowrap">TOTAL</td>
                  <td className="px-4 py-3 border-l border-gray-200 dark:border-gray-700"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-sm font-bold text-sky-900 whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">
                    {formatHours(totalHours) || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-sky-900 whitespace-nowrap text-right">
                    {fmtQty(totalQty)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-sky-900 whitespace-nowrap text-right">
                    {perHour(totalQty, totalHours > 0 ? totalHours : null)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {hasAnyData && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-1">
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold">Running Hours</span> is stop time minus start time —
              how long the unit was actually working, not the length of the shift.
            </p>
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold">Kg / Hr</span> is graded quantity divided by running
              hours, so a short run and a long run can be compared directly.
            </p>
            <p className="text-[11px] text-gray-500">
              The <span className="font-semibold">TOTAL</span> hours add up machine time across
              units that ran in parallel, so it is total machine-hours worked, not elapsed time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

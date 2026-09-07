'use client';

import React, { useMemo } from 'react';
import { formatVaQty } from '@/lib/hlVa';
import { buildGradeVaMatrix, REPORT_VARIETIES, type GradeVaEntry } from '@/lib/gradeVa';

interface GradeVaReportProps {
  entries: GradeVaEntry[];
  /** The single day the sheet covers. Ignored when `dateLabel` is given. */
  date: string;
  /**
   * Overrides the date badge — for the Analytics copy, which runs the sheet
   * across a whole range rather than one day.
   */
  dateLabel?: string;
  /** Controls for the header strip, e.g. the PDF / Excel buttons. */
  actions?: React.ReactNode;
}

export default function GradeVaReport({ entries, date, dateLabel, actions }: GradeVaReportProps) {
  const { rows, varietyTotals, grandTotal } = useMemo(() => buildGradeVaMatrix(entries), [entries]);

  // Format date for the header
  const formattedDate = useMemo(() => {
    if (dateLabel) return dateLabel;
    try {
      const parts = date.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return date;
    }
  }, [date, dateLabel]);

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-white">
          📊 Grade Vs VA Report
        </h3>
        <div className="flex items-center gap-2">
          {actions}
          <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-full text-[10px] font-bold">
            DATE : {formattedDate}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-xs border-collapse">
          {/* Sub-header: GRADES VS (V/A) */}
          <thead>
            <tr>
              <th
                colSpan={REPORT_VARIETIES.length + 2}
                className="bg-indigo-100 text-indigo-950 text-center py-2 px-3 font-bold text-sm tracking-wide border-b border-indigo-200"
              >
                GRADES VS (V/A)
              </th>
            </tr>
            <tr className="bg-indigo-200 text-indigo-950">
              <th className="text-left px-3 py-2.5 font-bold min-w-[90px] tracking-wide border-r border-indigo-300/60">
                GRADES
              </th>
              {REPORT_VARIETIES.map((v) => (
                <th
                  key={v}
                  className="text-center px-2 py-2.5 font-bold whitespace-nowrap min-w-[80px] border-r border-indigo-300/60"
                >
                  {v}
                </th>
              ))}
              <th className="text-center px-2 py-2.5 font-bold whitespace-nowrap min-w-[90px]">
                TOTAL
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => {
              const hasData = row.total > 0;
              const rowBg = idx % 2 === 0
                ? 'bg-white dark:bg-gray-800/30'
                : 'bg-gray-50/50 dark:bg-gray-800/10';

              return (
                <tr
                  key={row.grade}
                  className={`${rowBg} ${hasData ? '' : 'opacity-70'} hover:bg-amber-50/30 dark:hover:bg-amber-900/5 transition-colors border-b border-gray-100 dark:border-gray-700/50`}
                >
                  {/* Grade label */}
                  <td className="px-3 py-2.5 font-bold text-gray-900 dark:text-white border-r border-gray-100 dark:border-gray-700/50">
                    {row.grade}
                  </td>

                  {/* Variety columns */}
                  {REPORT_VARIETIES.map((v, ci) => {
                    const val = row.cells[ci];
                    return (
                      <td
                        key={v}
                        className={`text-center px-2 py-2.5 font-semibold border-r border-gray-100 dark:border-gray-700/50 ${
                          val > 0
                            ? 'text-gray-800 dark:text-amber-300'
                            : 'text-gray-300 dark:text-gray-600'
                        }`}
                      >
                        {val > 0 ? formatVaQty(val) : '-'}
                      </td>
                    );
                  })}

                  {/* Row total */}
                  <td className={`text-center px-2 py-2.5 font-bold ${
                    row.total > 0
                      ? 'text-gray-900 dark:text-amber-200'
                      : 'text-gray-300 dark:text-gray-600'
                  }`}>
                    {row.total > 0 ? formatVaQty(row.total) : '-'}
                  </td>
                </tr>
              );
            })}

            {/* TOTAL Row */}
            <tr className="font-bold border-t-2 bg-amber-50 dark:bg-gray-900 border-amber-400 dark:border-amber-600 text-gray-900 dark:text-gray-100">
              <td className="px-3 py-3 font-extrabold border-r border-gray-200 dark:border-gray-700/50">
                TOTAL
              </td>
              {REPORT_VARIETIES.map((v, ci) => {
                const colTotal = varietyTotals[ci];
                return (
                  <td
                    key={v}
                    className={`text-center px-2 py-3 font-bold border-r border-gray-200 dark:border-gray-700/50 ${
                      colTotal > 0
                        ? 'text-gray-900 dark:text-amber-300'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    {colTotal > 0 ? formatVaQty(colTotal) : '-'}
                  </td>
                );
              })}
              {/* Grand total — highlighted */}
              <td className="text-center px-2 py-3 font-extrabold bg-amber-200/60 dark:bg-amber-700/30 text-amber-900 dark:text-amber-200">
                {grandTotal > 0 ? formatVaQty(grandTotal) : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

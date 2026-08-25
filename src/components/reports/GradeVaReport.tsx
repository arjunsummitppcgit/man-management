'use client';

import React, { useMemo } from 'react';
import { formatVaQty, HLVA_YIELD_CHART, normaliseVariety } from '@/lib/hlVa';

// ─── Fixed grade row labels matching the Pre-Processing register ────────────
// Derived from the HL→VA standard yield chart (single source of truth) so the
// register rows always match the grades that entries are auto-tagged with,
// wrapped with the jumbo (8/12) boundary and the 111/ABOVE + MIX catch-all rows.
const REPORT_GRADE_ORDER = [
  '8/12',
  ...HLVA_YIELD_CHART.map((e) => e.label),
  '111/ABOVE',
  'MIX',
] as const;

// VA variety columns to show in the report, in register order. Covers every
// entry variety, so the columns add up to the TOTAL column.
const REPORT_VARIETIES = ['PD', 'PDTO', 'PVPD', 'PVPDTO', 'EZPL', 'PUD', 'BTFY'] as const;

interface GradeVaReportProps {
  entries: { grade?: string; variety?: string; va_kgs?: number | string }[];
  date: string;
}

export default function GradeVaReport({ entries, date }: GradeVaReportProps) {
  // Build the aggregation: grade → variety → sum(va_kgs)
  const { gradeVarietyMap, allGrades, varietyTotals, grandTotal } = useMemo(() => {
    const map = new Map<string, Map<string, number>>();

    // Seed fixed grades so they always appear
    for (const g of REPORT_GRADE_ORDER) {
      map.set(g, new Map());
    }

    // Aggregate entries
    for (const entry of entries) {
      const grade = (entry.grade || '').trim() || 'MIX';
      // Normalised, so rows saved under the old 'BTFLY' spelling land in the
      // BTFY column instead of falling outside the fixed column list — which
      // would quietly stop the columns adding up to TOTAL.
      const variety = normaliseVariety(entry.variety || '');
      const vaKgs = Number(entry.va_kgs) || 0;

      if (vaKgs <= 0) continue;

      if (!map.has(grade)) {
        map.set(grade, new Map());
      }
      const varietyMap = map.get(grade)!;
      varietyMap.set(variety, (varietyMap.get(variety) || 0) + vaKgs);
    }

    // Determine final grade list: fixed order first, then any extras
    const fixedSet = new Set<string>(REPORT_GRADE_ORDER);
    const extras: string[] = [];
    for (const g of map.keys()) {
      if (!fixedSet.has(g)) extras.push(g);
    }
    extras.sort();
    const allGrades = [...REPORT_GRADE_ORDER, ...extras];

    // Column totals
    const varietyTotals = new Map<string, number>();
    let grandTotal = 0;
    for (const [, varietyMap] of map) {
      for (const [v, qty] of varietyMap) {
        varietyTotals.set(v, (varietyTotals.get(v) || 0) + qty);
        grandTotal += qty;
      }
    }

    return { gradeVarietyMap: map, allGrades, varietyTotals, grandTotal };
  }, [entries]);

  // Format date for the header
  const formattedDate = useMemo(() => {
    try {
      const parts = date.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return date;
    }
  }, [date]);

  // Row total for a given grade
  const getRowTotal = (grade: string): number => {
    const varietyMap = gradeVarietyMap.get(grade);
    if (!varietyMap) return 0;
    let total = 0;
    for (const [, qty] of varietyMap) {
      total += qty;
    }
    return total;
  };

  // Cell value for a given grade + variety
  const getCellValue = (grade: string, variety: string): number => {
    return gradeVarietyMap.get(grade)?.get(variety) || 0;
  };

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-white">
          📊 Grade Vs VA Report
        </h3>
        <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-full text-[10px] font-bold">
          DATE : {formattedDate}
        </span>
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
            {allGrades.map((grade, idx) => {
              const rowTotal = getRowTotal(grade);
              const hasData = rowTotal > 0;
              const rowBg = idx % 2 === 0
                ? 'bg-white dark:bg-gray-800/30'
                : 'bg-gray-50/50 dark:bg-gray-800/10';

              return (
                <tr
                  key={grade}
                  className={`${rowBg} ${hasData ? '' : 'opacity-70'} hover:bg-amber-50/30 dark:hover:bg-amber-900/5 transition-colors border-b border-gray-100 dark:border-gray-700/50`}
                >
                  {/* Grade label */}
                  <td className="px-3 py-2.5 font-bold text-gray-900 dark:text-white border-r border-gray-100 dark:border-gray-700/50">
                    {grade}
                  </td>

                  {/* Variety columns */}
                  {REPORT_VARIETIES.map((v) => {
                    const val = getCellValue(grade, v);
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
                    rowTotal > 0
                      ? 'text-gray-900 dark:text-amber-200'
                      : 'text-gray-300 dark:text-gray-600'
                  }`}>
                    {rowTotal > 0 ? formatVaQty(rowTotal) : '-'}
                  </td>
                </tr>
              );
            })}

            {/* TOTAL Row */}
            <tr className="font-bold border-t-2 bg-amber-50 dark:bg-gray-900 border-amber-400 dark:border-amber-600 text-gray-900 dark:text-gray-100">
              <td className="px-3 py-3 font-extrabold border-r border-gray-200 dark:border-gray-700/50">
                TOTAL
              </td>
              {REPORT_VARIETIES.map((v) => {
                const colTotal = varietyTotals.get(v) || 0;
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

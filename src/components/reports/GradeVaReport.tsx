'use client';

import React, { useMemo } from 'react';
import { formatVaQty } from '@/lib/hlVa';
import type { HlVaEntry } from '@/types';

// ─── Fixed grade row labels matching the Pre-Processing register ────────────
// These are the industry-standard shrimp count grades.
// The report will show ALL these rows (even if empty for the date),
// plus any extra grades found in data that aren't in this list.
const REPORT_GRADE_ORDER = [
  '8/12',
  '13/15',
  '16/20',
  '21/25',
  '26/30',
  '31/35',
  '31/40',
  '41/50',
  '51/60',
  '61/70',
  '71/90',
  '91/110',
  '111/ABOVE',
  'MIX',
] as const;

// VA variety columns to show in the report (matches the register, excludes PUD)
const REPORT_VARIETIES = ['PD', 'PDTO', 'PVPD', 'PVPDTO', 'EZPL'] as const;

interface GradeVaReportProps {
  entries: { grade?: string; variety?: string; va_kgs?: number | string }[];
  date: string;
  isDark?: boolean;
}

export default function GradeVaReport({ entries, date, isDark = false }: GradeVaReportProps) {
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
      const variety = (entry.variety || '').trim().toUpperCase();
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
    <div className={`rounded-2xl overflow-hidden shadow-sm border ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} flex items-center justify-between`}>
        <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-700'}`}>
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
                className="bg-amber-400 text-gray-900 text-center py-2 px-3 font-bold text-sm tracking-wide border-b border-amber-500"
              >
                GRADES VS (V/A)
              </th>
            </tr>
            <tr className="bg-red-600 text-white">
              <th className="text-left px-3 py-2.5 font-bold min-w-[90px] tracking-wide border-r border-red-500/40">
                GRADES
              </th>
              {REPORT_VARIETIES.map((v) => (
                <th
                  key={v}
                  className="text-center px-2 py-2.5 font-bold whitespace-nowrap min-w-[80px] border-r border-red-500/40"
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
                ? (isDark ? 'bg-gray-800/30' : 'bg-white')
                : (isDark ? 'bg-gray-800/10' : 'bg-gray-50/50');

              return (
                <tr
                  key={grade}
                  className={`${rowBg} ${hasData ? '' : 'opacity-70'} hover:bg-amber-50/30 dark:hover:bg-amber-900/5 transition-colors border-b ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}
                >
                  {/* Grade label */}
                  <td className={`px-3 py-2.5 font-bold ${isDark ? 'text-white' : 'text-gray-900'} border-r ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}>
                    {grade}
                  </td>

                  {/* Variety columns */}
                  {REPORT_VARIETIES.map((v) => {
                    const val = getCellValue(grade, v);
                    return (
                      <td
                        key={v}
                        className={`text-center px-2 py-2.5 font-semibold border-r ${isDark ? 'border-gray-700/50' : 'border-gray-100'} ${
                          val > 0
                            ? (isDark ? 'text-amber-300' : 'text-gray-800')
                            : (isDark ? 'text-gray-600' : 'text-gray-300')
                        }`}
                      >
                        {val > 0 ? formatVaQty(val) : '-'}
                      </td>
                    );
                  })}

                  {/* Row total */}
                  <td className={`text-center px-2 py-2.5 font-bold ${
                    rowTotal > 0
                      ? (isDark ? 'text-amber-200' : 'text-gray-900')
                      : (isDark ? 'text-gray-600' : 'text-gray-300')
                  }`}>
                    {rowTotal > 0 ? formatVaQty(rowTotal) : '-'}
                  </td>
                </tr>
              );
            })}

            {/* TOTAL Row */}
            <tr className={`font-bold border-t-2 ${isDark ? 'bg-gray-900 border-amber-600 text-gray-100' : 'bg-amber-50 border-amber-400 text-gray-900'}`}>
              <td className={`px-3 py-3 font-extrabold border-r ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`}>
                TOTAL
              </td>
              {REPORT_VARIETIES.map((v) => {
                const colTotal = varietyTotals.get(v) || 0;
                return (
                  <td
                    key={v}
                    className={`text-center px-2 py-3 font-bold border-r ${isDark ? 'border-gray-700/50' : 'border-gray-200'} ${
                      colTotal > 0
                        ? (isDark ? 'text-amber-300' : 'text-gray-900')
                        : (isDark ? 'text-gray-600' : 'text-gray-300')
                    }`}
                  >
                    {colTotal > 0 ? formatVaQty(colTotal) : '-'}
                  </td>
                );
              })}
              {/* Grand total — highlighted */}
              <td className={`text-center px-2 py-3 font-extrabold ${
                isDark ? 'bg-amber-700/30 text-amber-200' : 'bg-amber-200/60 text-amber-900'
              }`}>
                {grandTotal > 0 ? formatVaQty(grandTotal) : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

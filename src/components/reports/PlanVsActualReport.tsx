'use client';

import React, { useMemo } from 'react';
import { buildPlanVsActual, variance, kg, signed } from '@/lib/dailyPlan';
import type {
  DailyPlanHonHlEntry,
  DailyPlanHlVaEntry,
  YieldEntry,
  HlVaEntry,
} from '@/types';

interface PlanVsActualReportProps {
  planHonHl: DailyPlanHonHlEntry[];
  planHlVa: DailyPlanHlVaEntry[];
  yieldEntries: YieldEntry[];
  hlVaEntries: HlVaEntry[];
}

/** A shortfall is red, an overshoot green, an unplanned location neither. */
function Variance({ planned, actual }: { planned: number; actual: number }) {
  const diff = variance(planned, actual);
  if (diff === null) return <span className="text-gray-300">—</span>;
  const tone = diff < 0 ? 'text-rose-600' : 'text-emerald-600';
  return <span className={`font-bold ${tone}`}>{signed(diff)}</span>;
}

/**
 * The day's plan next to what the registers recorded against it.
 *
 * Both sides compare stage *inputs* — planned HON against the HON that went
 * into de-heading, planned HL against the HL that went into VA. Comparing a
 * plan against a stage's output would mix the day's yield into the variance and
 * read as a planning miss when it was a yield one.
 */
export default function PlanVsActualReport({
  planHonHl,
  planHlVa,
  yieldEntries,
  hlVaEntries,
}: PlanVsActualReportProps) {
  const { rows, totals } = useMemo(
    () => buildPlanVsActual(planHonHl, planHlVa, yieldEntries, hlVaEntries),
    [planHonHl, planHlVa, yieldEntries, hlVaEntries]
  );

  const hasPlan = planHonHl.length > 0 || planHlVa.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Plan vs Actual</h3>
      </div>

      {!hasPlan ? (
        <div className="px-4 pb-5 text-center text-sm text-gray-400">
          No plan was entered for this date.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" rowSpan={2}>
                  Location
                </th>
                <th className="px-4 py-2 text-[10px] font-semibold text-teal-500 uppercase tracking-wider text-center border-l border-gray-100 dark:border-gray-800" colSpan={3}>
                  HON to HL (HON KGS)
                </th>
                <th className="px-4 py-2 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider text-center border-l border-gray-100 dark:border-gray-800" colSpan={3}>
                  HL to VA (HL KGS)
                </th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap border-l border-gray-100 dark:border-gray-800">Planned</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Actual</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Diff</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap border-l border-gray-100 dark:border-gray-800">Planned</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Actual</th>
                <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row) => (
                <tr key={row.location} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                  <td className="px-4 py-2.5 text-sm font-bold text-gray-900 whitespace-nowrap">{row.location}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap text-right border-l border-gray-50 dark:border-gray-800">
                    {row.plannedHon > 0 ? kg(row.plannedHon) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900 whitespace-nowrap text-right">{kg(row.actualHon)}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap text-right">
                    <Variance planned={row.plannedHon} actual={row.actualHon} />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap text-right border-l border-gray-50 dark:border-gray-800">
                    {row.plannedHl > 0 ? kg(row.plannedHl) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900 whitespace-nowrap text-right">{kg(row.actualHl)}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap text-right">
                    <Variance planned={row.plannedHl} actual={row.actualHl} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
                <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">TOTAL</td>
                <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{kg(totals.plannedHon)}</td>
                <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{kg(totals.actualHon)}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                  <Variance planned={totals.plannedHon} actual={totals.actualHon} />
                </td>
                <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{kg(totals.plannedHl)}</td>
                <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right">{kg(totals.actualHl)}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap text-right">
                  <Variance planned={totals.plannedHl} actual={totals.actualHl} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {hasPlan && (
        <p className="px-4 pb-3 pt-2 text-[11px] text-gray-500">
          Both sides compare what went <em>into</em> the stage: planned HON against HON de-headed, planned
          HL against HL taken for VA. A location with no plan shows no difference.
        </p>
      )}
    </div>
  );
}

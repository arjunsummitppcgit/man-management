'use client';

import React, { useMemo } from 'react';
import {
  buildHeadWasteStatement,
  HEAD_WASTE_RATE,
  VA_WASTE_RATE,
  type HeadWasteRow,
} from '@/lib/headWaste';
import type { YieldEntry, HlVaEntry } from '@/types';

interface HeadWasteReportProps {
  yieldEntries: YieldEntry[];
  hlVaEntries: HlVaEntry[];
  date: string;
}

// Indian-style grouping to match the rest of the register; blank cells read as '-'
const fmt = (value: number): string =>
  value > 0
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '-';

const pct = (rate: number) => `${(rate * 100).toFixed(0)}%`;

export default function HeadWasteReport({ yieldEntries, hlVaEntries, date }: HeadWasteReportProps) {
  const statement = useMemo(
    () => buildHeadWasteStatement(yieldEntries, hlVaEntries),
    [yieldEntries, hlVaEntries]
  );

  const { inHouseRows, inHouseTotal, outside, outsideLocations, grandTotal } = statement;
  const hasOutside = outside.hon > 0 || outside.va > 0 || outside.hlUsed > 0 || outside.hlEzpl > 0;
  const hasAnyData = grandTotal.hon > 0 || grandTotal.va > 0;
  const ezplTotal = grandTotal.hlEzpl;

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
          Head Waste Statement
          <span className="ml-2 text-sm font-semibold text-gray-400">In-house locations</span>
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Waste generated on {dateLabel} — heads at {pct(HEAD_WASTE_RATE)} of HON processed,
          shell/vein at {pct(VA_WASTE_RATE)} of HL consumed.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {!hasAnyData ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-3 text-amber-600 text-xl">
              🗑️
            </div>
            <p className="text-sm font-semibold text-gray-900">No processing on this date</p>
            <p className="text-sm text-gray-500 mt-1">
              Head waste is derived from HON→HL and HL→VA entries; there are none for {dateLabel}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {/* Grouped header mirrors the register: an HL block and a VA block */}
                <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" rowSpan={2}>
                    Location
                  </th>
                  <th
                    className="px-4 py-2 text-[10px] font-semibold text-teal-600 uppercase tracking-wider whitespace-nowrap text-center border-l border-gray-200 dark:border-gray-700"
                    colSpan={3}
                  >
                    HON → HL
                  </th>
                  <th
                    className="px-4 py-2 text-[10px] font-semibold text-indigo-600 uppercase tracking-wider whitespace-nowrap text-center border-l border-gray-200 dark:border-gray-700"
                    colSpan={3}
                  >
                    HL → VA
                  </th>
                  <th
                    className="px-4 py-2 text-[10px] font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700"
                    rowSpan={2}
                  >
                    Total Waste
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">HON</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">HL</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-teal-500 uppercase tracking-wider whitespace-nowrap text-right">Waste {pct(HEAD_WASTE_RATE)}</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">HL Used</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">VA</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap text-right">Waste {pct(VA_WASTE_RATE)}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {inHouseRows.map((row) => (
                  <DataRow key={row.key} row={row} />
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
                  <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">{inHouseTotal.label}</td>
                  <TotalCells row={inHouseTotal} tone="teal" />
                </tr>

                {hasOutside && (
                  <tr className="bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-600">{outside.label}</span>
                      {outsideLocations.length > 0 && (
                        <span className="block text-[10px] text-gray-400 font-medium mt-0.5">
                          {outsideLocations.join(', ')}
                        </span>
                      )}
                    </td>
                    <TotalCells row={outside} tone="gray" />
                  </tr>
                )}

                {hasOutside && (
                  <tr className="bg-amber-50 dark:bg-amber-900/30 border-t-2 border-amber-100 dark:border-amber-800">
                    <td className="px-4 py-3 text-sm font-bold text-amber-900 whitespace-nowrap">{grandTotal.label}</td>
                    <TotalCells row={grandTotal} tone="amber" />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}

        {/* Rules that aren't obvious from the numbers alone */}
        {hasAnyData && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-1">
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold">HL Used</span> is the HL consumed by HL→VA batches and
              is the base for the {pct(VA_WASTE_RATE)} waste — it is not the HL produced in the
              first block, which may be processed on a different date.
            </p>
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold text-indigo-600">EZPL</span> is easy-peel and carries no
              meaningful waste, so its HL is excluded from the {pct(VA_WASTE_RATE)} base
              {ezplTotal > 0 ? (
                <> — <span className="font-semibold">{fmt(ezplTotal)} kg</span> excluded on this date</>
              ) : (
                <> (none on this date)</>
              )}
              . Its VA output still counts in the VA column.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DataRow({ row }: { row: HeadWasteRow }) {
  const idle = row.hon === 0 && row.va === 0 && row.hlUsed === 0;
  return (
    <tr className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${idle ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{row.label}</td>
      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium border-l border-gray-100 dark:border-gray-800">{fmt(row.hon)}</td>
      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.hl)}</td>
      <td className="px-4 py-3 text-sm font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap text-right">{fmt(row.headWaste)}</td>
      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium border-l border-gray-100 dark:border-gray-800">
        {fmt(row.hlUsed)}
        {row.hlEzpl > 0 && (
          <span className="block text-[10px] text-indigo-500 font-semibold">
            +{fmt(row.hlEzpl)} EZPL
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.va)}</td>
      <td className="px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap text-right">{fmt(row.vaWaste)}</td>
      <td className="px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap text-right border-l border-gray-100 dark:border-gray-800">{fmt(row.totalWaste)}</td>
    </tr>
  );
}

function TotalCells({ row, tone }: { row: HeadWasteRow; tone: 'teal' | 'amber' | 'gray' }) {
  const text =
    tone === 'teal' ? 'text-teal-900' : tone === 'amber' ? 'text-amber-900' : 'text-gray-700';
  const cell = `px-4 py-3 text-sm font-bold ${text} whitespace-nowrap text-right`;
  const divider = 'border-l border-gray-200 dark:border-gray-700';
  return (
    <>
      <td className={`${cell} ${divider}`}>{fmt(row.hon)}</td>
      <td className={cell}>{fmt(row.hl)}</td>
      <td className={cell}>{fmt(row.headWaste)}</td>
      <td className={`${cell} ${divider}`}>
        {fmt(row.hlUsed)}
        {row.hlEzpl > 0 && (
          <span className="block text-[10px] text-indigo-500 font-semibold">
            +{fmt(row.hlEzpl)} EZPL
          </span>
        )}
      </td>
      <td className={cell}>{fmt(row.va)}</td>
      <td className={cell}>{fmt(row.vaWaste)}</td>
      <td className={`${cell} ${divider}`}>{fmt(row.totalWaste)}</td>
    </>
  );
}

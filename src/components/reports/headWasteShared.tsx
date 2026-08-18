'use client';

import React from 'react';
import type { HeadWasteRow } from '@/lib/headWaste';
import type { ExportCell } from '@/lib/export';

/**
 * Pieces shared by the two Head Waste views — the by-location statement and the
 * date-wise one. Both render the same nine quantity columns, so the cells live
 * here rather than being written twice and drifting apart.
 */

// Indian-style grouping to match the rest of the register; blank cells read as '-'
export const fmt = (value: number): string =>
  value > 0
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '-';

export const pct = (rate: number) => `${(rate * 100).toFixed(0)}%`;

/**
 * The same quantity as a real number for the spreadsheet. Rounded at three
 * decimals so a float artefact (79118.62400000001) never reaches the sheet, and
 * blank rather than 0 for an idle column so it reads like the printed page.
 */
export const num = (value: number): ExportCell => (value > 0 ? Number(value.toFixed(3)) : null);

/** Indian digit grouping, applied to the numeric cells of the Excel export. */
export const EXCEL_NUMBER_FORMAT = '##,##,##0.000';

/**
 * One statement row as flat cells for the exports. HL EZPL rides along as its
 * own column here — on screen it is a footnote under HL Used, but a spreadsheet
 * has nowhere to put a footnote.
 */
export const exportRowText = (row: HeadWasteRow): ExportCell[] => [
  fmt(row.hon),
  fmt(row.hl),
  fmt(row.headWaste),
  fmt(row.headWasteX),
  fmt(row.hlUsed),
  fmt(row.hlEzpl),
  fmt(row.va),
  fmt(row.vaWaste),
  fmt(row.vaWasteX),
  fmt(row.totalWaste),
  fmt(row.totalWasteX),
];

export const exportRowNum = (row: HeadWasteRow): ExportCell[] => [
  num(row.hon),
  num(row.hl),
  num(row.headWaste),
  num(row.headWasteX),
  num(row.hlUsed),
  num(row.hlEzpl),
  num(row.va),
  num(row.vaWaste),
  num(row.vaWasteX),
  num(row.totalWaste),
  num(row.totalWasteX),
];

/** Column labels for the quantity block, shared by both exports. */
export const quantityHeaders = (
  headRate: number,
  vaRate: number,
  multiplier: number
): string[] => [
  'HON',
  'HL',
  `Head Waste ${pct(headRate)}`,
  `Head Waste × ${multiplier}`,
  'HL Used',
  'HL EZPL (excluded)',
  'VA',
  `VA Waste ${pct(vaRate)}`,
  `VA Waste × ${multiplier}`,
  'Total Waste',
  `Total Waste × ${multiplier}`,
];

/**
 * `data` is an ordinary location line, `subtotal` a day's own total inside the
 * date-wise view, `total` the closing line of either statement. Only the
 * emphasis changes — the figures and their order are the same in all three.
 */
export type CellTone = 'data' | 'subtotal' | 'total';

const divider = 'border-l border-gray-100 dark:border-gray-800';
const dividerStrong = 'border-l border-gray-200 dark:border-gray-700';

/**
 * The nine quantity cells of a row. Kept as a fragment so each table can put
 * whatever leading cells it needs (location, or date + location) in front.
 */
export function WasteCells({
  row,
  multiplier,
  tone = 'data',
}: {
  row: HeadWasteRow;
  multiplier: number;
  tone?: CellTone;
}) {
  if (tone === 'data') {
    return (
      <>
        <td className={`px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium ${divider}`}>{fmt(row.hon)}</td>
        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.hl)}</td>
        <td className="px-4 py-3 text-sm font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap text-right">{fmt(row.headWaste)}</td>
        <td className="px-4 py-3 text-sm font-bold text-teal-600 dark:text-teal-300 whitespace-nowrap text-right">{fmt(row.headWasteX)}</td>
        <td className={`px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium ${divider}`}>
          {fmt(row.hlUsed)}
          <EzplNote value={row.hlEzpl} />
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.va)}</td>
        <td className="px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap text-right">{fmt(row.vaWaste)}</td>
        <td className="px-4 py-3 text-sm font-bold text-indigo-600 dark:text-indigo-300 whitespace-nowrap text-right">{fmt(row.vaWasteX)}</td>
        <td className={`px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap text-right ${divider}`}>
          {fmt(row.totalWaste)}
          <MultipliedNote row={row} multiplier={multiplier} className="text-amber-500" />
        </td>
      </>
    );
  }

  // .dark .text-teal-900 / .dark .text-amber-900 in globals.css lighten these
  // enough to stay readable on the dark card
  const text = tone === 'total' ? 'text-teal-900' : 'text-amber-900';
  const cell = `px-4 py-3 text-sm font-bold ${text} whitespace-nowrap text-right`;
  return (
    <>
      <td className={`${cell} ${dividerStrong}`}>{fmt(row.hon)}</td>
      <td className={cell}>{fmt(row.hl)}</td>
      <td className={cell}>{fmt(row.headWaste)}</td>
      <td className={cell}>{fmt(row.headWasteX)}</td>
      <td className={`${cell} ${dividerStrong}`}>
        {fmt(row.hlUsed)}
        <EzplNote value={row.hlEzpl} />
      </td>
      <td className={cell}>{fmt(row.va)}</td>
      <td className={cell}>{fmt(row.vaWaste)}</td>
      <td className={cell}>{fmt(row.vaWasteX)}</td>
      <td className={`${cell} ${dividerStrong}`}>
        {fmt(row.totalWaste)}
        <MultipliedNote row={row} multiplier={multiplier} className="opacity-70" />
      </td>
    </>
  );
}

/** HL that carried no waste, shown under the base it was left out of. */
function EzplNote({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span className="block text-[10px] text-indigo-500 font-semibold">+{fmt(value)} EZPL</span>
  );
}

function MultipliedNote({
  row,
  multiplier,
  className,
}: {
  row: HeadWasteRow;
  multiplier: number;
  className: string;
}) {
  if (row.totalWaste <= 0) return null;
  return (
    <span className={`block text-[10px] font-semibold ${className}`}>
      × {multiplier} = {fmt(row.totalWasteX)}
    </span>
  );
}

/**
 * The two-tier header both statements use: an HON → HL block, an HL → VA block
 * and the total. `leading` is whatever identity columns the table puts first.
 */
export function WasteHeader({
  leading,
  headRate,
  vaRate,
  multiplier,
}: {
  leading: { label: string; className?: string }[];
  headRate: number;
  vaRate: number;
  multiplier: number;
}) {
  const group =
    'px-4 py-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-center';
  const sub =
    'px-4 py-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-right';
  return (
    <thead>
      <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
        {leading.map((col) => (
          <th
            key={col.label}
            className={`px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
            rowSpan={2}
          >
            {col.label}
          </th>
        ))}
        <th className={`${group} text-teal-600 ${dividerStrong}`} colSpan={4}>
          HON → HL
        </th>
        <th className={`${group} text-indigo-600 ${dividerStrong}`} colSpan={4}>
          HL → VA
        </th>
        <th className={`${sub} text-amber-600 ${dividerStrong}`} rowSpan={2}>
          Total Waste
        </th>
      </tr>
      <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
        <th className={`${sub} text-gray-500 ${dividerStrong}`}>HON</th>
        <th className={`${sub} text-gray-500`}>HL</th>
        <th className={`${sub} text-teal-500`}>Waste {pct(headRate)}</th>
        <th className={`${sub} text-teal-500`}>Waste × {multiplier}</th>
        <th className={`${sub} text-gray-500 ${dividerStrong}`}>HL Used</th>
        <th className={`${sub} text-gray-500`}>VA</th>
        <th className={`${sub} text-indigo-500`}>Waste {pct(vaRate)}</th>
        <th className={`${sub} text-indigo-500`}>Waste × {multiplier}</th>
      </tr>
    </thead>
  );
}

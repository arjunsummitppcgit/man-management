'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  buildHeadWasteStatement,
  HEAD_WASTE_RATE,
  VA_WASTE_RATE,
  DEFAULT_WASTE_MULTIPLIER,
  WASTE_MULTIPLIER_KEY,
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
  // The factor applied to both waste columns. Editable, and remembered on this
  // device so the choice survives a reload without touching the database.
  const [multiplier, setMultiplier] = useState(DEFAULT_WASTE_MULTIPLIER);
  const [draft, setDraft] = useState(String(DEFAULT_WASTE_MULTIPLIER));

  // Read after mount — localStorage isn't available during SSR
  useEffect(() => {
    const saved = Number(localStorage.getItem(WASTE_MULTIPLIER_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      setMultiplier(saved);
      setDraft(String(saved));
    }
  }, []);

  // Apply what was typed, or snap back if it isn't a usable number
  const commitMultiplier = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(String(multiplier));
      return;
    }
    setMultiplier(next);
    setDraft(String(next));
    try {
      localStorage.setItem(WASTE_MULTIPLIER_KEY, String(next));
    } catch {
      // storage blocked — the value still applies for this session
    }
  };

  const statement = useMemo(
    () => buildHeadWasteStatement(yieldEntries, hlVaEntries, multiplier),
    [yieldEntries, hlVaEntries, multiplier]
  );

  const { inHouseRows, inHouseTotal } = statement;
  const hasAnyData = inHouseTotal.hon > 0 || inHouseTotal.va > 0;
  const ezplTotal = inHouseTotal.hlEzpl;

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
      <div className="pt-2 pb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Head Waste Statement
            <span className="ml-2 text-sm font-semibold text-gray-400">In-house locations</span>
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Waste generated on {dateLabel} — heads at {pct(HEAD_WASTE_RATE)} of HON processed,
            shell/vein at {pct(VA_WASTE_RATE)} of HL consumed.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
          <label
            htmlFor="waste-multiplier"
            className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
          >
            Multiplier
          </label>
          <span className="text-sm font-bold text-gray-400">×</span>
          <input
            id="waste-multiplier"
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commitMultiplier(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm font-bold text-right text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {multiplier !== DEFAULT_WASTE_MULTIPLIER && (
            <button
              type="button"
              onClick={() => commitMultiplier(String(DEFAULT_WASTE_MULTIPLIER))}
              className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 uppercase tracking-wider whitespace-nowrap"
            >
              Reset {DEFAULT_WASTE_MULTIPLIER}
            </button>
          )}
        </div>
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
                    colSpan={4}
                  >
                    HON → HL
                  </th>
                  <th
                    className="px-4 py-2 text-[10px] font-semibold text-indigo-600 uppercase tracking-wider whitespace-nowrap text-center border-l border-gray-200 dark:border-gray-700"
                    colSpan={4}
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
                  <th className="px-4 py-2 text-[10px] font-semibold text-teal-500 uppercase tracking-wider whitespace-nowrap text-right">Waste × {multiplier}</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">HL Used</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">VA</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap text-right">Waste {pct(VA_WASTE_RATE)}</th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider whitespace-nowrap text-right">Waste × {multiplier}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {inHouseRows.map((row) => (
                  <DataRow key={row.key} row={row} multiplier={multiplier} />
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
                  <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">{inHouseTotal.label}</td>
                  <TotalCells row={inHouseTotal} multiplier={multiplier} />
                </tr>
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
            <p className="text-[11px] text-gray-500">
              Only <span className="font-semibold">PPC 1, PPC 2 and SME</span> are counted — hired
              outside locations are excluded, so these totals will not match the register.
            </p>
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold text-amber-600">Waste × {multiplier}</span> applies the
              multiplier set above to both waste columns. It is saved on this device and reused next
              time; it does not change the {pct(HEAD_WASTE_RATE)} / {pct(VA_WASTE_RATE)} waste itself.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DataRow({ row, multiplier }: { row: HeadWasteRow; multiplier: number }) {
  const idle = row.hon === 0 && row.va === 0 && row.hlUsed === 0;
  return (
    <tr className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${idle ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{row.label}</td>
      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium border-l border-gray-100 dark:border-gray-800">{fmt(row.hon)}</td>
      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.hl)}</td>
      <td className="px-4 py-3 text-sm font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap text-right">{fmt(row.headWaste)}</td>
      <td className="px-4 py-3 text-sm font-bold text-teal-600 dark:text-teal-300 whitespace-nowrap text-right">{fmt(row.headWasteX)}</td>
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
      <td className="px-4 py-3 text-sm font-bold text-indigo-600 dark:text-indigo-300 whitespace-nowrap text-right">{fmt(row.vaWasteX)}</td>
      <td className="px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap text-right border-l border-gray-100 dark:border-gray-800">
        {fmt(row.totalWaste)}
        {row.totalWaste > 0 && (
          <span className="block text-[10px] text-amber-500 font-semibold">
            × {multiplier} = {fmt(row.totalWasteX)}
          </span>
        )}
      </td>
    </tr>
  );
}

function TotalCells({ row, multiplier }: { row: HeadWasteRow; multiplier: number }) {
  // .dark .text-teal-900 in globals.css lightens this for dark mode
  const cell = 'px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap text-right';
  const divider = 'border-l border-gray-200 dark:border-gray-700';
  return (
    <>
      <td className={`${cell} ${divider}`}>{fmt(row.hon)}</td>
      <td className={cell}>{fmt(row.hl)}</td>
      <td className={cell}>{fmt(row.headWaste)}</td>
      <td className={cell}>{fmt(row.headWasteX)}</td>
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
      <td className={cell}>{fmt(row.vaWasteX)}</td>
      <td className={`${cell} ${divider}`}>
        {fmt(row.totalWaste)}
        {row.totalWaste > 0 && (
          <span className="block text-[10px] font-semibold opacity-70">
            × {multiplier} = {fmt(row.totalWasteX)}
          </span>
        )}
      </td>
    </>
  );
}

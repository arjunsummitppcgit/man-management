'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  buildHeadWasteStatement,
  buildHeadWasteByDate,
  HEAD_WASTE_RATE,
  VA_WASTE_RATE,
  DEFAULT_WASTE_MULTIPLIER,
  WASTE_MULTIPLIER_KEY,
  type HeadWasteRow,
} from '@/lib/headWaste';
import { ExportButtons } from '@/components/analytics/shared';
import PrintButton from '@/components/ui/PrintButton';
import HeadWasteByDateTable from '@/components/reports/HeadWasteByDateTable';
import {
  fmt,
  pct,
  exportRowText,
  exportRowNum,
  quantityHeaders,
  EXCEL_NUMBER_FORMAT,
  WasteCells,
  WasteHeader,
} from '@/components/reports/headWasteShared';
import type { ExportCell } from '@/lib/export';
import type { YieldEntry, HlVaEntry } from '@/types';

/** Which way the statement is cut: by location across the range, or day by day. */
export type HeadWasteView = 'location' | 'date';

interface HeadWasteReportProps {
  yieldEntries: YieldEntry[];
  hlVaEntries: HlVaEntry[];
  fromDate: string;
  toDate: string;
  view?: HeadWasteView;
}

export default function HeadWasteReport({
  yieldEntries,
  hlVaEntries,
  fromDate,
  toDate,
  view = 'location',
}: HeadWasteReportProps) {
  // The factor applied to both waste columns. Editable, and remembered on this
  // device so the choice survives a reload without touching the database. Both
  // views read the same value — the same waste can't be worth two things.
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

  // Built off the same entries, so its grand total ties out to inHouseTotal
  const byDate = useMemo(
    () => buildHeadWasteByDate(yieldEntries, hlVaEntries, multiplier),
    [yieldEntries, hlVaEntries, multiplier]
  );

  const { inHouseRows, inHouseTotal } = statement;
  const isByDate = view === 'date';
  const hasAnyData = inHouseTotal.hon > 0 || inHouseTotal.va > 0;
  const ezplTotal = inHouseTotal.hlEzpl;

  // 'on 17 Aug 2026' for a single day, '17 Aug 2026 – 24 Aug 2026' for a span
  const dateLabel = useMemo(() => {
    const day = (value: string) => {
      try {
        return new Date(value + 'T00:00:00').toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
      } catch {
        return value;
      }
    };
    return fromDate === toDate ? day(fromDate) : `${day(fromDate)} – ${day(toDate)}`;
  }, [fromDate, toDate]);

  const isRange = fromDate !== toDate;

  // ── PDF / Excel ──────────────────────────────────────────────────────────
  // One flat table — the grouped header on screen can't survive a spreadsheet,
  // so each column carries its stage in the label instead. The PDF takes the
  // same formatted strings the table shows, so file and page always agree;
  // Excel takes the raw numbers so the columns can be summed and pivoted.
  const exportHeaders = useMemo(() => {
    const quantities = quantityHeaders(HEAD_WASTE_RATE, VA_WASTE_RATE, multiplier);
    return isByDate ? ['Date', 'Location', ...quantities] : ['Location', ...quantities];
  }, [isByDate, multiplier]);

  const buildExportRows = React.useCallback(
    (cells: (row: HeadWasteRow) => ExportCell[]): ExportCell[][] => {
      if (!hasAnyData) return [];
      if (!isByDate) {
        return [...inHouseRows.map((r) => [r.label, ...cells(r)]), [inHouseTotal.label, ...cells(inHouseTotal)]];
      }
      // The date repeats on every line, subtotals included — on paper it is
      // written once per group, but a sheet has to survive being sorted or
      // filtered, and a blank date column would fall apart the moment it is.
      return [
        ...byDate.days.flatMap((day) => [
          ...day.rows.map((r) => [day.date, r.label, ...cells(r)]),
          [day.date, day.total.label, ...cells(day.total)],
        ]),
        ['', byDate.grandTotal.label, ...cells(byDate.grandTotal)],
      ];
    },
    [hasAnyData, isByDate, inHouseRows, inHouseTotal, byDate]
  );

  const exportRows = useMemo(() => buildExportRows(exportRowText), [buildExportRows]);
  const excelRows = useMemo(() => buildExportRows(exportRowNum), [buildExportRows]);

  const exportTitle = `Head Waste Statement${isByDate ? ' (Date-wise)' : ''} — ${dateLabel}`;
  const exportFilename = `head-waste${isByDate ? '-daily' : ''}-${
    isRange ? `${fromDate}-to-${toDate}` : fromDate
  }`;

  return (
    <div className="space-y-4">
      <div className="pt-2 pb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Head Waste Statement
            <span className="ml-2 text-sm font-semibold text-gray-400">
              {isByDate ? 'Date-wise, in-house locations' : 'In-house locations'}
            </span>
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Waste generated {isRange ? 'over' : 'on'} {dateLabel}
            {isByDate ? ', broken down by work date' : ''} — heads at {pct(HEAD_WASTE_RATE)} of HON
            processed, shell/vein at {pct(VA_WASTE_RATE)} of HL consumed.
          </p>
        </div>

        {/* Controls, not content — the multiplier they set is already spelt out
            in the column headers, so none of this belongs on the sheet. */}
        <div className="no-print flex flex-wrap items-center gap-2">
          <ExportButtons
            title={exportTitle}
            headers={exportHeaders}
            rows={exportRows}
            excelRows={excelRows}
            excelNumberFormat={EXCEL_NUMBER_FORMAT}
            // Twelve numeric columns never fit the short edge of A4
            pdfOrientation="landscape"
            filename={exportFilename}
          />
          <PrintButton label="Print / PDF" className="!px-3 !py-1.5 !rounded-lg !text-[11px] !font-bold" />

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
      </div>

      {/* print-landscape turns the sheet on its side — see the @page rule in
          globals.css. Both views carry the same twelve columns. */}
      <div className="print-landscape bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {!hasAnyData ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-3 text-amber-600 text-xl">
              🗑️
            </div>
            <p className="text-sm font-semibold text-gray-900">
              No processing {isRange ? 'in this range' : 'on this date'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Head waste is derived from HON→HL and HL→VA entries; there are none for {dateLabel}.
            </p>
          </div>
        ) : isByDate ? (
          <HeadWasteByDateTable byDate={byDate} multiplier={multiplier} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              {/* Grouped header mirrors the register: an HL block and a VA block */}
              <WasteHeader
                leading={[{ label: 'Location' }]}
                headRate={HEAD_WASTE_RATE}
                vaRate={VA_WASTE_RATE}
                multiplier={multiplier}
              />

              <tbody className="divide-y divide-gray-50">
                {inHouseRows.map((row) => (
                  <DataRow key={row.key} row={row} multiplier={multiplier} />
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
                  <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">{inHouseTotal.label}</td>
                  <WasteCells row={inHouseTotal} multiplier={multiplier} tone="total" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Rules that aren't obvious from the numbers alone */}
        {hasAnyData && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-1">
            {isByDate && (
              <p className="text-[11px] text-gray-500">
                <span className="font-semibold text-amber-600">Each figure sits on the date it was
                generated</span> — head waste on the date the HON was de-headed, shell/vein waste on
                the date the HL was consumed. A day can therefore show VA waste with no HON, or the
                other way round, when a batch is carried over. Dates with no in-house processing are
                left out.
              </p>
            )}
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold">HL Used</span> is the HL consumed by HL→VA batches and
              is the base for the {pct(VA_WASTE_RATE)} waste — it is not the HL produced in the
              first block, which may be processed on a date outside this
              {isRange ? ' range' : ' date'}.
            </p>
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold text-indigo-600">EZPL</span> is easy-peel and carries no
              meaningful waste, so its HL is excluded from the {pct(VA_WASTE_RATE)} base
              {ezplTotal > 0 ? (
                <>
                  {' '}— <span className="font-semibold">{fmt(ezplTotal)} kg</span> excluded
                  {isRange ? ' over this range' : ' on this date'}
                </>
              ) : (
                <> (none {isRange ? 'in this range' : 'on this date'})</>
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
      <WasteCells row={row} multiplier={multiplier} />
    </tr>
  );
}

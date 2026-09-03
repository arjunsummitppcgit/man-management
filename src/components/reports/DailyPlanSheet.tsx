'use client';

import React, { useMemo, useRef, useState } from 'react';
import { ExportButtons } from '@/components/analytics/shared';
import { buildPlanSheet, planAsText, kg, type PlanSheet } from '@/lib/dailyPlan';
import type { ExportCell } from '@/lib/export';
import type { DailyPlanHonHlEntry, DailyPlanHlVaEntry } from '@/types';

const HEADERS = ['Location', 'Batch', 'Count', 'HON to HL (KGS)', 'Boxes', 'HL to VA (KGS)'];

/**
 * One flat table for PDF and Excel: every batch row, a subtotal under each
 * location, and the day's total at the foot. `numeric` gives Excel real numbers
 * so the sheet still sums; the PDF takes the formatted strings so the paper
 * matches the screen.
 */
function buildRows(sheet: PlanSheet, numeric: boolean): ExportCell[][] {
  const out: ExportCell[][] = [];
  const qty = (n: number): ExportCell => (numeric ? n : kg(n));

  sheet.locations.forEach((loc) => {
    if (loc.batches.length === 0) {
      // VA-only location — nothing was planned into de-heading here
      out.push([loc.location, '—', '', numeric ? 0 : '', numeric ? 0 : '', qty(loc.hlVaQty ?? 0)]);
      return;
    }
    loc.batches.forEach((b, idx) => {
      out.push([
        idx === 0 ? loc.location : '',
        b.batch_name,
        b.count_text,
        qty(b.planned_qty),
        b.boxes,
        // The VA figure belongs to the location, not the batch, so it sits on
        // the first row rather than being repeated down the block.
        idx === 0 && loc.hlVaQty !== null ? qty(loc.hlVaQty) : null,
      ]);
    });
    out.push([
      `${loc.location} total`,
      '',
      '',
      qty(loc.honQty),
      loc.honBoxes,
      loc.hlVaQty !== null ? qty(loc.hlVaQty) : null,
    ]);
  });

  out.push([
    'TOTAL',
    '',
    '',
    qty(sheet.totals.honQty),
    sheet.totals.honBoxes,
    qty(sheet.totals.hlVaQty),
  ]);
  return out;
}

interface DailyPlanSheetProps {
  honHl: DailyPlanHonHlEntry[];
  hlVa: DailyPlanHlVaEntry[];
  /** Human-readable date for the sheet heading and the exported file name. */
  dateLabel: string;
  /** yyyy-mm-dd — used for the file name only, so it sorts. */
  date: string;
}

/**
 * The plan as it goes out to the floor: one block per location, listing the
 * batches that location de-heads and the HL it feeds into VA. Built from what
 * was just saved, so what is exported is what is stored.
 */
export default function DailyPlanSheet({ honHl, hlVa, dateLabel, date }: DailyPlanSheetProps) {
  const sheet = useMemo(() => buildPlanSheet(honHl, hlVa), [honHl, hlVa]);
  const [copied, setCopied] = useState(false);
  // What the PDF is a photograph of: the sheet as it stands on screen.
  const sheetRef = useRef<HTMLDivElement>(null);

  const exportRows = useMemo(() => buildRows(sheet, false), [sheet]);
  const excelRows = useMemo(() => buildRows(sheet, true), [sheet]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(planAsText(sheet, dateLabel));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context — nothing to recover
      // from, the PDF and Excel buttons still work.
      setCopied(false);
    }
  };

  if (sheet.locations.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        Nothing planned for this date yet.
      </p>
    );
  }

  return (
    <div className="space-y-4" ref={sheetRef}>
      {/* Day totals */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-4 border border-indigo-200">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🗓️</span>
          <div>
            <h3 className="text-sm font-bold text-indigo-800">Daily Plan</h3>
            <p className="text-[11px] text-indigo-600">{dateLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/70 rounded-xl px-2 py-2.5 text-center">
            <p className="text-[10px] text-indigo-600 font-medium uppercase tracking-wide">HON to HL</p>
            <p className="text-base font-bold text-indigo-900">{kg(sheet.totals.honQty)}</p>
            <p className="text-[10px] text-indigo-500">{sheet.totals.batches} batches · {sheet.totals.honBoxes} boxes</p>
          </div>
          <div className="bg-white/70 rounded-xl px-2 py-2.5 text-center">
            <p className="text-[10px] text-indigo-600 font-medium uppercase tracking-wide">HL to VA</p>
            <p className="text-base font-bold text-indigo-900">{kg(sheet.totals.hlVaQty)}</p>
            <p className="text-[10px] text-indigo-500">kg of HL</p>
          </div>
          <div className="bg-white/70 rounded-xl px-2 py-2.5 text-center">
            <p className="text-[10px] text-indigo-600 font-medium uppercase tracking-wide">Locations</p>
            <p className="text-base font-bold text-indigo-900">{sheet.locations.length}</p>
            <p className="text-[10px] text-indigo-500">on the plan</p>
          </div>
        </div>
      </div>

      {/* Share row. `data-export-hide` keeps it out of the PDF: the buttons are
          how you ask for the file, not part of the document you asked for. */}
      <div className="flex items-center justify-between gap-2" data-export-hide="true">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-teal-50 text-teal-600 hover:bg-teal-100 active:scale-95 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
          </svg>
          {copied ? 'Copied!' : 'Copy for WhatsApp'}
        </button>
        <ExportButtons
          title={`Daily Plan — ${dateLabel}`}
          headers={HEADERS}
          rows={exportRows}
          excelRows={excelRows}
          excelNumberFormat="##,##,##0.000"
          filename={`daily-plan-${date}`}
          captureRef={sheetRef}
        />
      </div>

      {/* One block per location */}
      {sheet.locations.map((loc) => (
        <div key={loc.location} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">📍 {loc.location}</span>
            <span className="text-[11px] font-bold text-gray-500">
              {loc.batches.length > 0 && `${kg(loc.honQty)} kg HON`}
              {loc.batches.length > 0 && loc.hlVaQty !== null && ' · '}
              {loc.hlVaQty !== null && `${kg(loc.hlVaQty)} kg HL→VA`}
            </span>
          </div>

          {loc.batches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Batch</th>
                    <th className="px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Count</th>
                    <th className="px-2 py-2 text-[10px] font-semibold text-teal-500 uppercase tracking-wider text-right">Qty (kg)</th>
                    <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Boxes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loc.batches.map((b, idx) => (
                    <tr key={`${b.batch_name}-${idx}`}>
                      <td className="px-4 py-2 text-xs font-semibold text-gray-900">{b.batch_name}</td>
                      <td className="px-2 py-2 text-xs text-gray-600">{b.count_text || '—'}</td>
                      <td className="px-2 py-2 text-xs font-bold text-teal-700 text-right">{kg(b.planned_qty)}</td>
                      <td className="px-4 py-2 text-xs text-gray-700 text-right">{b.boxes || '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-teal-50/60">
                    <td className="px-4 py-2 text-[11px] font-bold text-teal-700 uppercase tracking-wider" colSpan={2}>Total</td>
                    <td className="px-2 py-2 text-xs font-extrabold text-teal-800 text-right">{kg(loc.honQty)}</td>
                    <td className="px-4 py-2 text-xs font-extrabold text-teal-800 text-right">{loc.honBoxes || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {loc.hlVaQty !== null && (
            <div className="px-4 py-2.5 flex items-center justify-between border-t border-gray-100">
              <span className="text-xs font-semibold text-indigo-700">HL to VA</span>
              <span className="text-sm font-bold text-indigo-800">{kg(loc.hlVaQty)} kg</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

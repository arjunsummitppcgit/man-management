'use client';

import React, { useState } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { exportStyledHtmlToPDF } from '@/lib/export';
import { formatHours, formatTime, runningHours } from '@/lib/grading';
import {
  bsRatio,
  formatBsRatio,
  formatGradingKg,
  gradingBatchKey,
  gradingTotals,
  groupGradingBatches,
  particularsLabel,
  sheetDate,
  signedKg,
  type GradingBatch,
} from '@/lib/gradingReport';
import { gradingReportSheetHtml } from '@/lib/gradingReportPdf';
import type { GradingReport, YieldEntry } from '@/types';

// ─── Batch Pipeline: the grading step ────────────────────────────────────────
// Sits between HON → HL and HL → VA, the order the batch actually moves in.
// Each sheet is read against the HONS TO HL lines of its own date, so the
// difference and grading yield match what the Grading Report tab showed.

interface Props {
  batchQuery: string;
  reports: GradingReport[];
  loading: boolean;
  /** The batch's HONS TO HL lines on every date, as Batch Pipeline fetched them. */
  honHlEntries: YieldEntry[];
  honHlLoading: boolean;
}

const th = 'px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap';
const td = 'px-4 py-3 text-sm whitespace-nowrap';

const kgOrDash = (v: number | null | undefined) =>
  v === null || v === undefined ? '-' : formatGradingKg(Number(v));

export default function BatchPipelineGrading({ batchQuery, reports, loading, honHlEntries, honHlLoading }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-700 dark:text-sky-300">
          GRADING REPORT
        </span>
        <span className="text-sm text-gray-500">
          Batch <span className="font-semibold text-gray-900">{batchQuery}</span>
        </span>
      </div>
      {loading ? (
        <div className="p-8 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : reports.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-semibold text-gray-900">No Grading Report</p>
          <p className="text-sm text-gray-500 mt-1">
            No grading report saved for batch {batchQuery}. It is entered on the Grading Report tab
            of Daily Entry.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {reports.map((report) => {
            const batch =
              groupGradingBatches(honHlEntries.filter((e) => e.work_date === report.work_date)).find(
                (b) => b.key === gradingBatchKey(report.batch_id)
              ) ?? null;
            return (
              <Sheet
                key={report.id}
                report={report}
                batch={batch}
                batchLoading={honHlLoading}
                showDate={reports.length > 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Sheet({
  report,
  batch,
  batchLoading,
  showDate,
}: {
  report: GradingReport;
  batch: GradingBatch | null;
  /** HON → HL still loading — its figures aren't missing yet, just not here. */
  batchLoading: boolean;
  showDate: boolean;
}) {
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);

  const lines = [...report.lines].sort((a, b) => a.line_no - b.line_no);
  const defects = [...report.defects].sort((a, b) => a.line_no - b.line_no);
  const totals = gradingTotals(
    lines.map((l) => (l.total_kgs === null ? null : Number(l.total_kgs))),
    batch
  );
  const hours = runningHours(report.start_time, report.end_time);
  const time =
    report.start_time || report.end_time
      ? `${formatTime(report.start_time) || '?'} – ${formatTime(report.end_time) || '?'}${
          hours !== null ? ` (${formatHours(hours)})` : ''
        }`
      : '';

  const facts: [string, string][] = [
    ['HONS TO HL', sheetDate(report.work_date)],
    ['Grading Date', sheetDate(report.grading_date)],
    ['R/M Date', sheetDate(report.rm_date)],
    ['Grader', report.grader_name],
    ['Time', time],
    ['Checking Count', report.checking_count],
    ['Remarks', report.remarks],
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const safeBatch = report.batch_id.replace(/[\\/:*?"<>|]+/g, '-');
      await exportStyledHtmlToPDF(
        gradingReportSheetHtml({ report, batch }),
        `Grading Report ${safeBatch} ${report.work_date}`
      );
    } catch (error) {
      console.error('Grading report PDF failed:', error);
      showToast('Could not create the PDF. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const vs = totals.vsTheoretical;

  return (
    <div>
      {/* Who graded it, when */}
      <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {facts
            .filter(([, v]) => v && v.trim())
            .map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{k}</p>
                <p className="text-sm font-semibold text-gray-900">{v}</p>
              </div>
            ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 disabled:opacity-50 whitespace-nowrap"
        >
          {exporting ? 'Preparing…' : showDate ? `PDF (${sheetDate(report.work_date)})` : 'PDF'}
        </button>
      </div>

      {/* Grade lines */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-y border-gray-100 dark:border-gray-800">
              <th className={th}>Grade</th>
              <th className={th}>Count</th>
              <th className={th}>Particulars</th>
              <th className={`${th} text-right`}>Total (KGS)</th>
              <th className={th}>Remarks</th>
              <th className={`${th} text-right text-sky-600`}>Big</th>
              <th className={`${th} text-right text-sky-600`}>Small</th>
              <th className={`${th} text-right text-sky-600`}>B/S</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className={`${td} text-gray-500`}>
                  No grade lines on this sheet.
                </td>
              </tr>
            ) : (
              lines.map((l) => {
                const big = l.big_weight === null ? null : Number(l.big_weight);
                const small = l.small_weight === null ? null : Number(l.small_weight);
                return (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <td className={`${td} font-bold text-gray-900`}>{l.grade || '-'}</td>
                    <td className={`${td} text-gray-600`}>{l.count_text || '-'}</td>
                    <td className={td}>
                      {l.particulars ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-sky-50 text-sky-700 dark:text-sky-300">
                          {particularsLabel(l.particulars)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className={`${td} text-right font-medium text-gray-900`}>{kgOrDash(l.total_kgs)}</td>
                    <td className={`${td} text-gray-600`}>{l.remarks || '-'}</td>
                    <td className={`${td} text-right text-gray-600`}>{kgOrDash(big)}</td>
                    <td className={`${td} text-right text-gray-600`}>{kgOrDash(small)}</td>
                    <td className={`${td} text-right font-bold text-gray-900`}>
                      {formatBsRatio(bsRatio(big, small)) || '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-sky-50 dark:bg-sky-900/30 border-t-2 border-sky-100 dark:border-sky-800">
              <td className={`${td} font-bold text-sky-900 dark:text-sky-200`}>TOTAL</td>
              <td className={`${td} text-sky-800 dark:text-sky-300`}>
                {lines.length} line{lines.length === 1 ? '' : 's'}
              </td>
              <td className="px-4 py-3"></td>
              <td className={`${td} text-right font-bold text-sky-900 dark:text-sky-200`}>
                {formatGradingKg(totals.graded) || '0'}
              </td>
              <td colSpan={4} className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* What the sheet is read for */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-gray-100 dark:border-gray-800">
        <Figure label="H/L Weighment" value={batch ? `${formatGradingKg(batch.hlKgs)} kg` : '-'} />
        <Figure label="Difference" value={totals.difference === null ? '-' : `${signedKg(totals.difference)} kg`} />
        <Figure
          label="Grading H/L Yield"
          value={totals.gradingYield === null ? '-' : `${totals.gradingYield.toFixed(2)}%`}
        />
        <Figure
          label={
            batch?.theoreticalYield != null
              ? `Vs Theoretical ${batch.theoreticalYield.toFixed(2)}%`
              : 'Vs Theoretical'
          }
          value={vs === null ? '-' : `${vs >= 0 ? '+' : ''}${vs.toFixed(2)}%`}
          tone={vs === null ? undefined : vs >= 0 ? 'text-emerald-600' : 'text-rose-600'}
        />
      </div>

      {defects.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Defects</span>
          {defects.map((d) => (
            <span
              key={d.id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700"
            >
              {d.defect}
              {d.percent !== null &&
                ` ${Number(d.percent).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`}
            </span>
          ))}
        </div>
      )}

      {!batch && !batchLoading && (
        <p className="px-4 pb-3 text-[11px] text-rose-600">
          This batch is no longer on HONS TO HL for {sheetDate(report.work_date)}, so the weighment,
          difference and yields can&apos;t be worked out.
        </p>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold ${tone ?? 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

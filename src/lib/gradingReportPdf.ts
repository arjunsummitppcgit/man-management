// ─── Grading Report: the paper layout ────────────────────────────────────────
// The client's own GRADING REPORT sheet, field for field and in its order: the
// batch block (left) beside the R/M and yield block (right), the grade lines,
// then the B/S ratios. Defects were handwritten in the margin of the sample —
// here they get a table of their own.
//
// Written against A4 (794px at 96dpi) for exportStyledHtmlToPDF, like the
// Grade Vs VA sheet: every figure `nowrap`, every column an explicit width.

import { escapeHtml } from './export';
import { formatTime, formatHours, runningHours } from './grading';
import {
  bsRatio,
  formatBsRatio,
  formatGradingKg,
  gradingTotals,
  particularsLabel,
  sheetDate,
  signedKg,
  type GradingBatch,
} from './gradingReport';
import type { GradingReport } from '@/types';

const STYLES = `
.grs { font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; color: #1f2937; background: #ffffff; padding: 26px; }
.grs * { margin: 0; padding: 0; box-sizing: border-box; }

.grs-head { background: linear-gradient(135deg, #0d9488 0%, #0f766e 55%, #115e59 100%); color: #ffffff; border-radius: 16px; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; }
.grs-head h1 { font-size: 21px; font-weight: 800; letter-spacing: 1.5px; color: #ffffff; }
.grs-head .grs-sub { font-size: 12px; color: #ccfbf1; margin-top: 5px; }
.grs-brand { text-align: right; }
.grs-brand .grs-name { font-size: 14px; font-weight: 700; color: #ffffff; }
.grs-brand .grs-tag { font-size: 10px; color: #99f6e4; margin-top: 2px; }

.grs-frame { border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; margin-top: 14px; }
.grs-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.grs-table caption { background: #e0f2fe; color: #0c4a6e; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; padding: 7px 0; }

.grs-info td { font-size: 11px; padding: 7px 10px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grs-info td.grs-k { font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #475569; background: #f8fafc; }
.grs-info td.grs-v { font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.grs-info td.grs-split { border-left: 2px solid #e2e8f0; }
.grs-info tr:last-child td { border-bottom: none; }
.grs-good { color: #047857 !important; }
.grs-bad { color: #be123c !important; }
.grs-soft { color: #64748b; font-weight: 600; }

.grs-grid thead th { background: #0d9488; color: #ffffff; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 9px 8px; text-align: left; white-space: nowrap; }
.grs-grid thead th.grs-num { text-align: right; }
.grs-grid tbody td { font-size: 11px; padding: 7px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; color: #334155; }
.grs-grid tbody td.grs-num { text-align: right; font-weight: 700; color: #0f172a; }
.grs-grid tbody td.grs-strong { font-weight: 700; color: #0f172a; }
.grs-grid tbody tr.grs-alt td { background: #f8fafc; }
.grs-grid tfoot td { background: #ccfbf1; color: #134e4a; font-size: 11.5px; font-weight: 800; padding: 9px 8px; white-space: nowrap; border-top: 2px solid #5eead4; font-variant-numeric: tabular-nums; }
.grs-grid tfoot td.grs-num { text-align: right; }
.grs-grid tfoot tr.grs-sub td { background: #f0fdfa; color: #0f766e; font-size: 10.5px; font-weight: 700; border-top: 1px solid #99f6e4; padding: 6px 8px; }

.grs-pair { display: flex; gap: 14px; align-items: flex-start; }
.grs-pair > .grs-frame { flex: 1; }

.grs-foot { margin-top: 14px; font-size: 9px; color: #94a3b8; text-align: right; }
`;

const DASH = '<span class="grs-soft">-</span>';

const text = (v: string | null | undefined) => (v && v.trim() ? escapeHtml(v.trim()) : DASH);

const pct = (v: number | null) => (v === null ? DASH : `${v.toFixed(2)}%`);

export interface GradingSheetOptions {
  report: GradingReport;
  /** The batch as HONS TO HL has it; null when it has left that register. */
  batch: GradingBatch | null;
}

/** The saved sheet as a standalone block of HTML, ready for exportStyledHtmlToPDF. */
export function gradingReportSheetHtml({ report, batch }: GradingSheetOptions): string {
  const lines = [...report.lines].sort((a, b) => a.line_no - b.line_no);
  const defects = [...report.defects].sort((a, b) => a.line_no - b.line_no);
  const totals = gradingTotals(lines.map((l) => (l.total_kgs === null ? null : Number(l.total_kgs))), batch);

  const hours = runningHours(report.start_time, report.end_time);
  const endTime = report.end_time
    ? `${formatTime(report.end_time)}${hours !== null ? ` <span class="grs-soft">(${formatHours(hours)})</span>` : ''}`
    : DASH;

  const vs = totals.vsTheoretical;
  const yieldCell =
    totals.gradingYield === null
      ? DASH
      : `${totals.gradingYield.toFixed(2)}%${
          vs === null
            ? ''
            : ` <span class="${vs >= 0 ? 'grs-good' : 'grs-bad'}">(${vs >= 0 ? '+' : ''}${vs.toFixed(2)})</span>`
        }`;

  const kgCell = (v: number | null | undefined) => (v === null || v === undefined ? DASH : formatGradingKg(v));

  // Left block is the batch (HONS TO HL), right block the R/M and yields —
  // the same two columns, in the same order, as the printed sheet
  const infoRows: [string, string, string, string][] = [
    ['Batch No.', escapeHtml(report.batch_id), 'R/M Date', text(sheetDate(report.rm_date))],
    ['HON Count', text(batch?.countText), 'R/M Grader', text(batch?.rmGrader)],
    ['HON Weight', kgCell(batch?.honKgs), 'Grading Date', text(sheetDate(report.grading_date))],
    ['Checking Count', text(report.checking_count), 'Grader Name', text(report.grader_name)],
    ['H/L Weighment', kgCell(batch?.hlKgs), 'Remarks', text(report.remarks)],
    ['Grading Starting Time', report.start_time ? formatTime(report.start_time) : DASH, 'Theoretical Yield', pct(batch?.theoreticalYield ?? null)],
    ['Grading Ending Time', endTime, 'Grading H/L Yield', yieldCell],
  ];

  const infoHtml = infoRows
    .map(
      ([k1, v1, k2, v2]) => `<tr>
        <td class="grs-k">${k1}</td><td class="grs-v">${v1}</td>
        <td class="grs-k grs-split">${k2}</td><td class="grs-v">${v2}</td>
      </tr>`
    )
    .join('');

  const lineHtml = lines.length
    ? lines
        .map(
          (l, i) => `<tr${i % 2 === 1 ? ' class="grs-alt"' : ''}>
            <td class="grs-strong">${text(l.grade)}</td>
            <td>${text(l.count_text)}</td>
            <td class="grs-strong">${text(particularsLabel(l.particulars))}</td>
            <td class="grs-num">${kgCell(l.total_kgs === null ? null : Number(l.total_kgs))}</td>
            <td>${text(l.remarks)}</td>
          </tr>`
        )
        .join('')
    : `<tr><td colspan="5" class="grs-soft">No grade lines entered.</td></tr>`;

  const diff = totals.difference;
  const weighmentLine = batch
    ? `<tr class="grs-sub">
        <td colspan="3">H/L Weighment ${formatGradingKg(batch.hlKgs)} · Difference</td>
        <td class="grs-num">${signedKg(diff)}</td>
        <td></td>
      </tr>`
    : '';

  const bsLines = lines.filter((l) => l.big_weight !== null || l.small_weight !== null);
  const bsHtml = bsLines.length
    ? `<div class="grs-frame">
        <table class="grs-table grs-grid">
          <caption>B/S RATIO</caption>
          <colgroup><col style="width:18%" /><col style="width:22%" /><col style="width:20%" /><col style="width:20%" /><col style="width:20%" /></colgroup>
          <thead><tr><th>Count</th><th>Grade</th><th class="grs-num">Big</th><th class="grs-num">Small</th><th class="grs-num">B/S Ratio</th></tr></thead>
          <tbody>${bsLines
            .map((l, i) => {
              const big = l.big_weight === null ? null : Number(l.big_weight);
              const small = l.small_weight === null ? null : Number(l.small_weight);
              const ratio = bsRatio(big, small);
              return `<tr${i % 2 === 1 ? ' class="grs-alt"' : ''}>
                <td class="grs-strong">${text(l.count_text)}</td>
                <td>${text(l.grade)}</td>
                <td class="grs-num">${kgCell(big)}</td>
                <td class="grs-num">${kgCell(small)}</td>
                <td class="grs-num">${ratio === null ? DASH : formatBsRatio(ratio)}</td>
              </tr>`;
            })
            .join('')}</tbody>
        </table>
      </div>`
    : '';

  const defectHtml = defects.length
    ? `<div class="grs-frame">
        <table class="grs-table grs-grid">
          <caption>DEFECTS</caption>
          <colgroup><col style="width:65%" /><col style="width:35%" /></colgroup>
          <thead><tr><th>Defect</th><th class="grs-num">%</th></tr></thead>
          <tbody>${defects
            .map(
              (d, i) => `<tr${i % 2 === 1 ? ' class="grs-alt"' : ''}>
                <td class="grs-strong">${escapeHtml(d.defect)}</td>
                <td class="grs-num">${d.percent === null ? DASH : `${Number(d.percent).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`}</td>
              </tr>`
            )
            .join('')}</tbody>
        </table>
      </div>`
    : '';

  const sub = [
    `HONS TO HL ${escapeHtml(sheetDate(report.work_date))}`,
    batch && batch.locations.length ? escapeHtml(batch.locations.join(' + ')) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return `<style>${STYLES}</style>
<div class="grs">
  <div class="grs-head">
    <div>
      <h1>GRADING REPORT</h1>
      <div class="grs-sub">${escapeHtml(report.batch_id)} · ${sub}</div>
    </div>
    <div class="grs-brand">
      <div class="grs-name">PPC Manager</div>
      <div class="grs-tag">Prawn Processing Control</div>
    </div>
  </div>

  <div class="grs-frame">
    <table class="grs-table grs-info">
      <colgroup><col style="width:21%" /><col style="width:29%" /><col style="width:21%" /><col style="width:29%" /></colgroup>
      <tbody>${infoHtml}</tbody>
    </table>
  </div>

  <div class="grs-frame">
    <table class="grs-table grs-grid">
      <colgroup><col style="width:15%" /><col style="width:13%" /><col style="width:24%" /><col style="width:18%" /><col style="width:30%" /></colgroup>
      <thead><tr><th>Grade</th><th>Count</th><th>Particulars</th><th class="grs-num">Total</th><th>Remarks</th></tr></thead>
      <tbody>${lineHtml}</tbody>
      <tfoot>
        <tr><td colspan="3">TOTAL</td><td class="grs-num">${formatGradingKg(totals.graded)}</td><td></td></tr>
        ${weighmentLine}
      </tfoot>
    </table>
  </div>

  ${bsHtml || defectHtml ? `<div class="grs-pair">${bsHtml}${defectHtml}</div>` : ''}

  <div class="grs-foot">Generated by PPC Manager on ${escapeHtml(new Date().toLocaleString('en-IN'))}</div>
</div>`;
}

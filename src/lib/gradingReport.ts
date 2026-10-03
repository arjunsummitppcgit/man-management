// ─── Grading Report ──────────────────────────────────────────────────────────
// After HONS TO HL, a batch's HL is machine-graded into counts and each count is
// sent on to a variety or to BLOCK. The grading report is that paper sheet, one
// per batch per HONS TO HL date (migration 040).
//
// The top of the sheet — HON count, HON weight, H/L weighment, R/M grader and
// the theoretical yield — is the HONS TO HL register itself, read live. A batch
// split between two locations there is still one sheet, with the two lines
// added together (client, 2026-09-30).

import { VA_VARIETIES } from './hlVa';
import { extractCountNumber, standardForYieldEntry } from './yieldChart';
import type {
  GradingReport,
  GradingReportForm,
  GradingReportLineForm,
  GradingReportDefectForm,
  YieldEntry,
} from '@/types';

/** A batch id as the sheet matches it — case and spaces ignored, like 039/040. */
export const gradingBatchKey = (batchId: string) => batchId.trim().toUpperCase();

/** Where a grade line's HL goes. Printed with an "HL-" in front, as on paper. */
export const GRADING_PARTICULARS = [...VA_VARIETIES, 'BLOCK'] as const;

/** Defects the floor has written up so far — suggestions only, any name goes. */
export const DEFECT_SUGGESTIONS = ['Soft', 'Segment D/C', 'Necrosis'];

/**
 * Headless commercial grades (pieces per lb). The sheet's Grade is the grade the
 * count is sold as, not an HL→VA chart band: 34c is 31/35 here but 31/40 on
 * that chart. Offered as a suggestion; whatever is typed is what is stored.
 */
const HL_GRADES: { label: string; min: number; max: number }[] = [
  { label: '8/12', min: 8, max: 12 },
  { label: '13/15', min: 13, max: 15 },
  { label: '16/20', min: 16, max: 20 },
  { label: '21/25', min: 21, max: 25 },
  { label: '26/30', min: 26, max: 30 },
  { label: '31/35', min: 31, max: 35 },
  { label: '36/40', min: 36, max: 40 },
  { label: '41/50', min: 41, max: 50 },
  { label: '51/60', min: 51, max: 60 },
  { label: '61/70', min: 61, max: 70 },
  { label: '71/90', min: 71, max: 90 },
  { label: '91/110', min: 91, max: 110 },
  { label: '111/130', min: 111, max: 130 },
  { label: '131/150', min: 131, max: 150 },
  { label: '151/200', min: 151, max: 200 },
];

export const GRADE_SUGGESTIONS = [...HL_GRADES.map((g) => g.label), 'MIX'];

/** '22c' → '21/25'. Null for a count that isn't a number ('mix'). */
export function suggestGrade(countText: string): string | null {
  const count = extractCountNumber(countText);
  if (count === null) return null;
  return HL_GRADES.find((g) => count >= g.min && count <= g.max)?.label ?? null;
}

/** 'hl-pd ' → 'PD'. The sheet writes the "HL-" itself. */
export function normaliseParticulars(value: string): string {
  return value.trim().toUpperCase().replace(/^HL\s*[-–]?\s*/, '');
}

export const particularsLabel = (value: string) => (value ? `HL-${value}` : '');

/**
 * Big ÷ small from the B/S sample (105 / 95 → 1.105). Entered, not judged —
 * the client asked for the figure alone, no uniform / not-uniform call.
 */
export function bsRatio(big: number | null, small: number | null): number | null {
  if (big === null || small === null || !(big > 0) || !(small > 0)) return null;
  return big / small;
}

/**
 * Two decimals, cut rather than rounded — the way the sheet writes them. Every
 * B/S on the client's sample is cut (82/72 = 1.139 is written 1.13), so a
 * rounded 1.14 on screen would read as the app disagreeing with the paper.
 */
export function formatBsRatio(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '';
  return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2);
}

export const parseGradingNumber = (value: string): number | null => {
  if (value.trim() === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

// ─── The batch, as HONS TO HL has it ────────────────────────────────────────

export interface GradingBatch {
  key: string;
  /** As first typed on HONS TO HL that day. */
  batchId: string;
  rows: YieldEntry[];
  locations: string[];
  /** Each location's count, when they differ: '48.3' or '48.3 / 50.1'. */
  countText: string;
  honKgs: number;
  hlKgs: number;
  rmGrader: string;
  /**
   * The HON→HL standard each line was measured against, weighted by its HON.
   * One line — the usual case — is just that line's Std %.
   */
  theoreticalYield: number | null;
}

const distinct = (values: string[]) =>
  Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));

/** The date's HONS TO HL lines as sheets: one per batch, locations added up. */
export function groupGradingBatches(entries: YieldEntry[]): GradingBatch[] {
  const byKey = new Map<string, YieldEntry[]>();
  entries.forEach((e) => {
    const key = gradingBatchKey(e.batch_id);
    if (!key) return;
    const list = byKey.get(key);
    if (list) list.push(e);
    else byKey.set(key, [e]);
  });

  return Array.from(byKey.entries()).map(([key, rows]) => {
    const honKgs = rows.reduce((s, r) => s + (Number(r.hon_kgs) || 0), 0);
    const hlKgs = rows.reduce((s, r) => s + (Number(r.hl_kgs) || 0), 0);

    // A line without a standard leaves the blend unknown, not smaller
    let theoreticalYield: number | null = null;
    const standards = rows.map((r) => standardForYieldEntry(r));
    if (standards.every((s) => s !== null)) {
      if (honKgs > 0) {
        theoreticalYield =
          rows.reduce((s, r, i) => s + (Number(r.hon_kgs) || 0) * (standards[i] as number), 0) / honKgs;
      } else if (standards.length > 0) {
        theoreticalYield = standards[0];
      }
    }

    return {
      key,
      batchId: rows[0].batch_id.trim(),
      rows,
      locations: distinct(rows.map((r) => r.location?.name ?? '')),
      countText: distinct(rows.map((r) => r.count_text)).join(' / '),
      honKgs,
      hlKgs,
      rmGrader: distinct(rows.map((r) => r.grader_name)).join(' / '),
      theoreticalYield,
    };
  });
}

/**
 * The raw-material date a batch id carries: '26I01/2' is 2026, the 9th month
 * (A = Jan … L = Dec), day 01; 'R010926/1' is 01-09-26. Checked against every
 * HONS TO HL row to Sep 2026 — 2,037 of 2,049 readable ids land 0–5 days before
 * their HONS TO HL date; the rest are typos ('R280629'). So it is offered only
 * when it lands on or up to a month before the HONS TO HL date, and is always
 * editable.
 */
export function rmDateFromBatch(batchId: string, workDate: string): string | null {
  const id = batchId.trim().toUpperCase();
  let year: number, month: number, day: number;

  let m = id.match(/^(\d{2})([A-L])\s*(\d{1,2})(?!\d)/);
  if (m) {
    year = 2000 + Number(m[1]);
    month = m[2].charCodeAt(0) - 64;
    day = Number(m[3]);
  } else if ((m = id.match(/^R\s*(\d{2})(\d{2})(\d{2})(?!\d)/))) {
    day = Number(m[1]);
    month = Number(m[2]);
    year = 2000 + Number(m[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 June and the like, which Date would roll into July
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  const iso = date.toISOString().slice(0, 10);
  const daysBefore = (Date.parse(`${workDate}T00:00:00Z`) - date.getTime()) / 86_400_000;
  return daysBefore >= 0 && daysBefore <= 31 ? iso : null;
}

// ─── The form ───────────────────────────────────────────────────────────────

export const emptyGradingLine = (): GradingReportLineForm => ({
  grade: '',
  count_text: '',
  particulars: '',
  total_kgs: '',
  remarks: '',
  big_weight: '',
  small_weight: '',
});

export const emptyDefect = (): GradingReportDefectForm => ({ defect: '', percent: '' });

const numText = (v: number | null) => (v === null || v === undefined ? '' : String(Number(v)));

/** Postgres TIME '13:00:00' → the time input's '13:00'. */
const timeText = (v: string | null) => (v ? v.slice(0, 5) : '');

/** The sheet as the form opens it: the saved report, or a fresh one. */
export function gradingFormFrom(
  report: GradingReport | null,
  batch: GradingBatch | null,
  workDate: string
): GradingReportForm {
  if (!report) {
    return {
      rm_date: (batch && rmDateFromBatch(batch.batchId, workDate)) ?? '',
      grading_date: workDate,
      grader_name: '',
      checking_count: '',
      start_time: '',
      end_time: '',
      remarks: '',
      lines: [emptyGradingLine()],
      defects: [],
    };
  }
  const lines = [...report.lines].sort((a, b) => a.line_no - b.line_no);
  const defects = [...report.defects].sort((a, b) => a.line_no - b.line_no);
  return {
    rm_date: report.rm_date ?? '',
    grading_date: report.grading_date ?? '',
    grader_name: report.grader_name,
    checking_count: report.checking_count,
    start_time: timeText(report.start_time),
    end_time: timeText(report.end_time),
    remarks: report.remarks,
    lines: lines.length
      ? lines.map((l) => ({
          grade: l.grade,
          count_text: l.count_text,
          particulars: l.particulars,
          total_kgs: numText(l.total_kgs),
          remarks: l.remarks,
          big_weight: numText(l.big_weight),
          small_weight: numText(l.small_weight),
        }))
      : [emptyGradingLine()],
    defects: defects.map((d) => ({ defect: d.defect, percent: numText(d.percent) })),
  };
}

export const lineIsBlank = (l: GradingReportLineForm) =>
  Object.values(l).every((v) => v.trim() === '');

const nonNegative = (value: string): number | null => {
  const n = parseGradingNumber(value);
  return n === null ? null : Math.max(0, n);
};

/** What save_grading_report receives. Blank lines and unnamed defects are dropped. */
export function gradingSavePayload(form: GradingReportForm) {
  return {
    report: {
      rm_date: form.rm_date || null,
      grading_date: form.grading_date || null,
      grader_name: form.grader_name.trim(),
      checking_count: form.checking_count.trim(),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      remarks: form.remarks.trim(),
    },
    lines: form.lines
      .filter((l) => !lineIsBlank(l))
      .map((l) => ({
        grade: l.grade.trim(),
        count_text: l.count_text.trim(),
        particulars: normaliseParticulars(l.particulars),
        total_kgs: nonNegative(l.total_kgs),
        remarks: l.remarks.trim(),
        big_weight: nonNegative(l.big_weight),
        small_weight: nonNegative(l.small_weight),
      })),
    defects: form.defects
      .filter((d) => d.defect.trim() !== '')
      .map((d) => ({ defect: d.defect.trim(), percent: nonNegative(d.percent) })),
  };
}

export type GradingSavePayload = ReturnType<typeof gradingSavePayload>;

// ─── The form's B/S section ─────────────────────────────────────────────────
// A sample's weights are stored on its grade line (big_weight / small_weight).
// The form shows them as rows of their own under the grade lines, each row
// pointing at its line by position in form.lines.

export const hasBsSample = (l: GradingReportLineForm) =>
  l.big_weight.trim() !== '' || l.small_weight.trim() !== '';

/** The rows a sheet opens with: one per grade line that carries a sample. */
export const bsRowsFrom = (lines: GradingReportLineForm[]) =>
  lines.flatMap((l, i) => (hasBsSample(l) ? [i] : []));

/** The rows once grade line `idx` is removed: its own goes, those below move up one. */
export const bsRowsWithoutLine = (rows: number[], idx: number) =>
  rows.filter((r) => r !== idx).map((r) => (r > idx ? r - 1 : r));

/** A sample re-pointed at another grade line — its weights move with it. */
export function moveBsWeights(lines: GradingReportLineForm[], from: number, to: number) {
  if (from === to) return lines;
  const { big_weight, small_weight } = lines[from];
  return lines.map((l, i) => {
    if (i === to) return { ...l, big_weight, small_weight };
    return i === from ? { ...l, big_weight: '', small_weight: '' } : l;
  });
}

export const clearBsWeights = (lines: GradingReportLineForm[], idx: number) =>
  lines.map((l, i) => (i === idx ? { ...l, big_weight: '', small_weight: '' } : l));

// ─── The sums at the foot of the sheet ──────────────────────────────────────

export interface GradingTotals {
  /** Every grade line's Total added up (1,394 on the client's sample). */
  graded: number;
  /** Graded − H/L weighment: the "(−6)" written beside the sample. */
  difference: number | null;
  /** Graded ÷ HON weight — the sheet's "Grading H/L Yield" (69.85%). */
  gradingYield: number | null;
  /** Grading yield − theoretical, in points. */
  vsTheoretical: number | null;
}

export function gradingTotals(
  totals: (number | null)[],
  batch: Pick<GradingBatch, 'honKgs' | 'hlKgs' | 'theoreticalYield'> | null
): GradingTotals {
  const graded = totals.reduce<number>((s, t) => s + (t ?? 0), 0);
  const gradingYield = batch && batch.honKgs > 0 ? (graded / batch.honKgs) * 100 : null;
  return {
    graded,
    difference: batch ? graded - batch.hlKgs : null,
    gradingYield,
    vsTheoretical:
      gradingYield !== null && batch?.theoreticalYield != null
        ? gradingYield - batch.theoreticalYield
        : null,
  };
}

/** Totals of a form still being typed. */
export const formLineTotals = (form: GradingReportForm) => form.lines.map((l) => parseGradingNumber(l.total_kgs));

/** '2026-09-01' → '01/09/2026', the way the sheet writes it. */
export function sheetDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** 1394 → '1,394', 1395.5 → '1,395.5' — kg as the floor writes them. */
export function formatGradingKg(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

/** −6 → '−6', 4.5 → '+4.5'. */
export function signedKg(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  const abs = formatGradingKg(Math.abs(value));
  if (Math.abs(value) < 0.0005) return '0';
  return value > 0 ? `+${abs}` : `−${abs}`;
}

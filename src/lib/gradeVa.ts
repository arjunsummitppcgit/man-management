// ─── Grade Vs VA matrix ──────────────────────────────────────────────────────
// VA kgs laid out as grade rows × variety columns — the "GRADES VS (V/A)" sheet
// the pre-processing register is read from.
//
// The aggregation lives here rather than in the report component because two
// places draw it now: the Daily Report's single-day sheet, and the Analytics
// HL → VA section, which runs it across the whole selected date range and
// exports it. Both have to agree, down to which grades get a row.

import { HLVA_YIELD_CHART, normaliseVariety } from './hlVa';

/**
 * Fixed grade row labels matching the Pre-Processing register. Derived from the
 * HL→VA standard yield chart (single source of truth) so the rows always match
 * the grades entries are auto-tagged with, wrapped with the jumbo (8/12)
 * boundary and the 111/ABOVE + MIX catch-all rows.
 */
export const REPORT_GRADE_ORDER = [
  '8/12',
  ...HLVA_YIELD_CHART.map((e) => e.label),
  '111/ABOVE',
  'MIX',
] as const;

/**
 * VA variety columns, in register order. Covers every entry variety, so the
 * columns add up to the TOTAL column.
 */
export const REPORT_VARIETIES = ['PD', 'PDTO', 'PVPD', 'PVPDTO', 'EZPL', 'PUD', 'BTFY'] as const;

/** The only fields the matrix reads — any HL→VA row shape will do. */
export interface GradeVaEntry {
  grade?: string;
  variety?: string;
  va_kgs?: number | string | null;
}

export interface GradeVaRow {
  grade: string;
  /** One figure per column of REPORT_VARIETIES, in that order. */
  cells: number[];
  total: number;
}

export interface GradeVaMatrix {
  rows: GradeVaRow[];
  /** Column totals, in REPORT_VARIETIES order. */
  varietyTotals: number[];
  grandTotal: number;
}

/**
 * Sum VA kgs into grade × variety. Grades outside the fixed list still get a
 * row — appended, sorted — so a figure can never be silently dropped from the
 * sheet just because someone typed a grade the chart doesn't know.
 */
export function buildGradeVaMatrix(entries: GradeVaEntry[]): GradeVaMatrix {
  const map = new Map<string, Map<string, number>>();

  // Seed fixed grades so they always appear, empty or not.
  for (const g of REPORT_GRADE_ORDER) map.set(g, new Map());

  for (const entry of entries) {
    const grade = (entry.grade || '').trim() || 'MIX';
    // Normalised, so rows saved under the old 'BTFLY' spelling land in the BTFY
    // column instead of falling outside the fixed column list — which would
    // quietly stop the columns adding up to TOTAL.
    const variety = normaliseVariety(entry.variety || '');
    const vaKgs = Number(entry.va_kgs) || 0;
    if (vaKgs <= 0) continue;

    let varietyMap = map.get(grade);
    if (!varietyMap) {
      varietyMap = new Map();
      map.set(grade, varietyMap);
    }
    varietyMap.set(variety, (varietyMap.get(variety) || 0) + vaKgs);
  }

  const fixed = new Set<string>(REPORT_GRADE_ORDER);
  const extras = Array.from(map.keys())
    .filter((g) => !fixed.has(g))
    .sort();
  const grades = [...REPORT_GRADE_ORDER, ...extras];

  const varietyTotals = REPORT_VARIETIES.map(() => 0);
  let grandTotal = 0;

  const rows: GradeVaRow[] = grades.map((grade) => {
    const varietyMap = map.get(grade);
    const cells = REPORT_VARIETIES.map((v) => varietyMap?.get(v) || 0);
    cells.forEach((qty, i) => {
      varietyTotals[i] += qty;
    });
    // Off-list varieties count toward the row and grand totals even though no
    // column shows them, matching the register's own arithmetic.
    let total = 0;
    if (varietyMap) for (const qty of varietyMap.values()) total += qty;
    grandTotal += total;
    return { grade, cells, total };
  });

  return { rows, varietyTotals, grandTotal };
}

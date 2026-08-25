// ─── Standard Yield Chart ─────────────────────────────────────────────────────
// Reference table mapping count ranges to standard yield percentages, used to
// auto-calculate the standard a batch is measured against.
//
// The bands below are the shipped chart. Since migration 032 an admin can edit
// the *percentages* from Daily Entry; the bands themselves stay here, because
// yield_entries.count_range is stamped from them at save time and a band whose
// bounds moved would strand those stored labels.
//
// The shipped percentages are also what pre-032 rows are read against — a row
// with no std_yield of its own has no stamp, so it is measured against whatever
// stands here. That makes this table history as much as it is a default: moving
// a number moves what every unstamped row is judged by, retrospectively.
//
// It was moved once, deliberately, in migration 033: the client's own chart
// arrived and the shipped one turned out to have been wrong all along. That is
// the bar for editing this file. To change the standard *going forward*, edit
// it in the app instead — that stamps new rows and leaves old ones alone.

export interface YieldChartEntry {
  label: string;      // Display label, e.g. "22-40"
  min: number;        // Inclusive lower bound
  max: number;        // Inclusive upper bound
  standardYield: number; // Standard yield percentage, e.g. 71.00
}

// Transcribed from the client's STANDARD YIELD chart (HON STANDARD YIELD),
// received 2026-08-25. Twelve bands covering counts 1–220; the chart the app
// shipped with stopped at 120 and grouped 22-40 and 41-60, which is why counts
// above 120 came back without a standard at all and 31-40 / 41-50 were measured
// against their neighbour's percentage.
//
// Labels carry no "C" suffix, matching the client's chart. Rows saved before
// this change keep the old labels in yield_entries.count_range — see migration
// 033 for why those are left standing.
export const YIELD_CHART: YieldChartEntry[] = [
  { label: '01-30',   min: 1,   max: 30,  standardYield: 71.00 },
  { label: '31-40',   min: 31,  max: 40,  standardYield: 70.00 },
  { label: '41-50',   min: 41,  max: 50,  standardYield: 69.00 },
  { label: '51-60',   min: 51,  max: 60,  standardYield: 68.00 },
  { label: '61-70',   min: 61,  max: 70,  standardYield: 67.50 },
  { label: '71-80',   min: 71,  max: 80,  standardYield: 67.00 },
  { label: '81-90',   min: 81,  max: 90,  standardYield: 66.50 },
  { label: '91-100',  min: 91,  max: 100, standardYield: 66.00 },
  { label: '101-110', min: 101, max: 110, standardYield: 65.00 },
  { label: '111-130', min: 111, max: 130, standardYield: 64.00 },
  { label: '131-150', min: 131, max: 150, standardYield: 63.00 },
  { label: '151-220', min: 151, max: 220, standardYield: 62.00 },
  // Added at the client's instruction (2026-08-25), beyond the pdf's last row.
  // The chart ended at 220 and counts do run past it — one batch on the
  // register is 393.3 — so without this the top of the range falls off the
  // chart exactly as everything above 120 used to.
  { label: '221+',    min: 221, max: 999999, standardYield: 61.00 },
];

/**
 * Extract a numeric count value from free-text count strings.
 *
 * Handles formats like:
 * - "37.75/40"   → extracts 40 (the number after "/")
 * - "86/90"      → extracts 90
 * - "110.4"      → extracts 110
 * - "69.33 ASP"  → extracts 69
 *
 * Strategy: if there's a "/" take the last number; otherwise take the first number
 * and round to nearest integer for range matching.
 */
export function extractCountNumber(countText: string): number | null {
  if (!countText || !countText.trim()) return null;

  const cleaned = countText.trim();

  // If it contains a "/", use the number AFTER the slash
  if (cleaned.includes('/')) {
    const afterSlash = cleaned.split('/').pop()?.trim();
    if (afterSlash) {
      const num = parseFloat(afterSlash);
      if (!isNaN(num)) return Math.round(num);
    }
  }

  // Otherwise, extract the first number from the string
  const match = cleaned.match(/[\d.]+/);
  if (match) {
    const num = parseFloat(match[0]);
    if (!isNaN(num)) return Math.round(num);
  }

  return null;
}

/**
 * Look up the standard yield % for a given count text.
 * Returns the standard yield percentage (e.g. 71.00) or null if not matched.
 *
 * `chart` defaults to the shipped bands. Pass the live chart from
 * useYieldStandards when stamping a new entry or previewing one being typed;
 * leave it off when reading a saved row that has no std_yield of its own,
 * since the shipped values are what applied to it.
 */
export function lookupStandardYield(
  countText: string,
  chart: YieldChartEntry[] = YIELD_CHART
): number | null {
  const count = extractCountNumber(countText);
  if (count === null) return null;

  const entry = chart.find((e) => count >= e.min && count <= e.max);
  return entry?.standardYield ?? null;
}

/**
 * The chart as it currently stands: shipped bands with any admin-edited
 * percentages laid over the top, keyed by band label.
 *
 * Overlaying rather than replacing is what keeps the two halves in step — an
 * override for a band that no longer exists is ignored, and a band added to
 * the code later shows its shipped percentage until someone edits it, instead
 * of appearing as a blank.
 */
export function applyYieldOverrides(
  overrides: Record<string, number> | null | undefined
): YieldChartEntry[] {
  if (!overrides) return YIELD_CHART;
  return YIELD_CHART.map((entry) => {
    const override = overrides[entry.label];
    return Number.isFinite(override) ? { ...entry, standardYield: Number(override) } : entry;
  });
}

/** Just the edited bands, so an untouched chart stores nothing at all. */
export function yieldOverridesOf(chart: YieldChartEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  const shipped = new Map(YIELD_CHART.map((e) => [e.label, e.standardYield]));
  chart.forEach((e) => {
    if (shipped.get(e.label) !== e.standardYield) out[e.label] = e.standardYield;
  });
  return out;
}

/**
 * Get the chart label (count range) for a given count text.
 * Returns e.g. "81-90C" or null if not matched.
 */
export function lookupCountRange(countText: string): string | null {
  const count = extractCountNumber(countText);
  if (count === null) return null;

  const entry = YIELD_CHART.find((e) => count >= e.min && count <= e.max);
  return entry?.label ?? null;
}

/**
 * The HON→HL standard a *saved* row was measured against.
 *
 * Prefers the value stamped on the row at save time. A row with none was saved
 * before the chart became editable (migration 032), so the shipped chart is
 * what applied to it — reading it against today's edited chart would rewrite
 * what yesterday's report said.
 */
export function standardForYieldEntry(entry: {
  std_yield?: number | string | null;
  count_text: string;
}): number | null {
  const stamped = Number(entry.std_yield);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;
  return lookupStandardYield(entry.count_text);
}

/**
 * The standard a row *on the form* is measured against — and the one a save
 * will stamp, so the two can never disagree.
 *
 * A row loaded from the database keeps the standard it was saved under, the
 * same way a day's Company Ladies rate survives a re-save (migration 026).
 * Re-opening an old date to fix a grader's name must not quietly re-measure
 * the whole day against a chart edited since. Retype the count and the stamp
 * no longer describes the row, so it is recomputed.
 */
export function standardForYieldFormRow(
  row: { count_text: string; std_yield?: number | null; stamped_count?: string },
  chart: YieldChartEntry[]
): number | null {
  const stamped = Number(row.std_yield);
  if (
    Number.isFinite(stamped) &&
    stamped > 0 &&
    (row.stamped_count ?? '').trim() === row.count_text.trim()
  ) {
    return stamped;
  }
  return lookupStandardYield(row.count_text, chart);
}

/**
 * Calculate yield percentage: (HL / HON) × 100
 */
export function calculateYield(honKgs: number, hlKgs: number): number | null {
  if (honKgs <= 0) return null;
  return (hlKgs / honKgs) * 100;
}

/**
 * Calculate yield difference: Actual Yield − Standard Yield
 */
export function calculateYieldDifference(
  yieldPercent: number | null,
  standardYield: number | null
): number | null {
  if (yieldPercent === null || standardYield === null) return null;
  return yieldPercent - standardYield;
}

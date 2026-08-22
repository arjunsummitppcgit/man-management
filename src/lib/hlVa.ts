// ─── HL to VA constants & helpers ────────────────────────────────────────────

import { extractCountNumber } from './yieldChart';

// Variety options for HL -> VA batch entries (order matches the register chips)
export const VA_VARIETIES = [
  'PD',
  'PDTO',
  'PVPD',
  'PVPDTO',
  'EZPL',
  'PUD',
  'BTFLY',
] as const;

export type VaVariety = (typeof VA_VARIETIES)[number];

// ─── HL to VA Standard Yield Chart ────────────────────────────────────────────
// Standard yield % by HL count range, split across three variety groups:
//   pd   → PD / PUD / PVPD / BTFLY
//   pdto → PDTO / PVPDTO
//   ezpl → EZPL
//
// Same arrangement as the HON→HL chart: since migration 032 admins edit the
// percentages in the app, the bands stay here (hl_va_entries.grade is stamped
// from them), and these shipped values are what pre-032 rows are read against.
export interface HlVaYieldEntry {
  label: string; // Display label, e.g. "13-15"
  min: number;   // Inclusive lower bound
  max: number;   // Inclusive upper bound
  pd: number;    // PD / PUD / PVPD / BTFLY standard yield %
  pdto: number;  // PDTO / PVPDTO standard yield %
  ezpl: number;  // EZPL standard yield %
}

export const HLVA_YIELD_CHART: HlVaYieldEntry[] = [
  { label: '13/15',  min: 13,  max: 15,  pd: 83.0, pdto: 89.0, ezpl: 99.5 },
  { label: '16/20',  min: 16,  max: 20,  pd: 83.0, pdto: 89.0, ezpl: 99.5 },
  { label: '21/25',  min: 21,  max: 25,  pd: 82.0, pdto: 88.5, ezpl: 99.5 },
  { label: '26/30',  min: 26,  max: 30,  pd: 82.0, pdto: 88.0, ezpl: 99.5 },
  { label: '31/40',  min: 31,  max: 40,  pd: 81.5, pdto: 87.0, ezpl: 99.5 },
  { label: '41/50',  min: 41,  max: 50,  pd: 81.0, pdto: 86.0, ezpl: 99.0 },
  { label: '51/60',  min: 51,  max: 60,  pd: 81.0, pdto: 85.0, ezpl: 99.0 },
  { label: '61/70',  min: 61,  max: 70,  pd: 80.0, pdto: 85.0, ezpl: 99.0 },
  { label: '71/90',  min: 71,  max: 90,  pd: 80.0, pdto: 84.0, ezpl: 99.0 },
  { label: '91/110', min: 91,  max: 110, pd: 79.0, pdto: 83.0, ezpl: 98.0 },
];

// Map a variety to its yield-chart column. Blank/unknown varieties fall back to
// the PD/PUD/PVPD column.
function varietyColumn(variety: string): 'pd' | 'pdto' | 'ezpl' {
  switch (variety) {
    case 'PDTO':
    case 'PVPDTO':
      return 'pdto';
    case 'EZPL':
      return 'ezpl';
    default: // PD, PUD, PVPD, BTFLY, and blank
      return 'pd';
  }
}

/**
 * Look up the HL→VA standard yield % for a given count text and variety.
 * Returns the standard yield percentage (e.g. 83.00) or null if the count
 * doesn't fall in any chart range.
 */
export function lookupHlVaStandardYield(
  countText: string,
  variety: string,
  chart: HlVaYieldEntry[] = HLVA_YIELD_CHART
): number | null {
  const count = extractCountNumber(countText);
  if (count === null) return null;
  const entry = chart.find((e) => count >= e.min && count <= e.max);
  if (!entry) return null;
  return entry[varietyColumn(variety)];
}

/** The three editable columns on a band. */
export type HlVaYieldColumn = 'pd' | 'pdto' | 'ezpl';

/** Which chart column a variety is measured against. */
export const hlVaColumnFor = varietyColumn;

export const HLVA_COLUMNS: { key: HlVaYieldColumn; label: string; hint: string }[] = [
  { key: 'pd', label: 'PD', hint: 'PD · PUD · PVPD · BTFLY' },
  { key: 'pdto', label: 'PDTO', hint: 'PDTO · PVPDTO' },
  { key: 'ezpl', label: 'EZPL', hint: 'EZPL' },
];

/** Shipped bands with any admin-edited percentages laid over the top. */
export function applyHlVaOverrides(
  overrides: Record<string, Partial<Record<HlVaYieldColumn, number>>> | null | undefined
): HlVaYieldEntry[] {
  if (!overrides) return HLVA_YIELD_CHART;
  return HLVA_YIELD_CHART.map((entry) => {
    const override = overrides[entry.label];
    if (!override) return entry;
    const next = { ...entry };
    HLVA_COLUMNS.forEach(({ key }) => {
      const value = override[key];
      if (Number.isFinite(value)) next[key] = Number(value);
    });
    return next;
  });
}

/** Just the edited cells, so an untouched chart stores nothing at all. */
export function hlVaOverridesOf(
  chart: HlVaYieldEntry[]
): Record<string, Partial<Record<HlVaYieldColumn, number>>> {
  const out: Record<string, Partial<Record<HlVaYieldColumn, number>>> = {};
  const shipped = new Map(HLVA_YIELD_CHART.map((e) => [e.label, e]));
  chart.forEach((e) => {
    const base = shipped.get(e.label);
    if (!base) return;
    const diff: Partial<Record<HlVaYieldColumn, number>> = {};
    HLVA_COLUMNS.forEach(({ key }) => {
      if (base[key] !== e[key]) diff[key] = e[key];
    });
    if (Object.keys(diff).length > 0) out[e.label] = diff;
  });
  return out;
}

/**
 * Get the HL→VA chart grade label (count range) for a given count text.
 * Returns e.g. "31-40" or null if not matched.
 */
export function lookupHlVaCountRange(countText: string): string | null {
  const count = extractCountNumber(countText);
  if (count === null) return null;
  const entry = HLVA_YIELD_CHART.find((e) => count >= e.min && count <= e.max);
  return entry?.label ?? null;
}

/**
 * The HL→VA standard a *saved* row was measured against — stamped value first,
 * shipped chart for rows that predate migration 032. Same reasoning as
 * standardForYieldEntry.
 */
export function standardForHlVaEntry(entry: {
  std_yield?: number | string | null;
  count_text: string;
  variety: string;
}): number | null {
  const stamped = Number(entry.std_yield);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;
  return lookupHlVaStandardYield(entry.count_text, entry.variety);
}

/**
 * The standard an HL→VA row on the form is measured against, and the one a
 * save will stamp. Variety is part of the match because it selects the column:
 * switching PD to PDTO makes the old stamp describe a different number.
 * See standardForYieldFormRow for why a loaded row keeps its stamp.
 */
export function standardForHlVaFormRow(
  row: {
    count_text: string;
    variety: string;
    std_yield?: number | null;
    stamped_count?: string;
    stamped_variety?: string;
  },
  chart: HlVaYieldEntry[]
): number | null {
  const stamped = Number(row.std_yield);
  if (
    Number.isFinite(stamped) &&
    stamped > 0 &&
    (row.stamped_count ?? '').trim() === row.count_text.trim() &&
    (row.stamped_variety ?? '') === row.variety
  ) {
    return stamped;
  }
  return lookupHlVaStandardYield(row.count_text, row.variety, chart);
}

// Indian-style grouping to match the register (e.g. 2,10,178.000)
export function formatVaQty(value: number): string {
  if (!value) return '-';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

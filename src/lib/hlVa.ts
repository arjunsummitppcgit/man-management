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
  'BTFY',
] as const;

export type VaVariety = (typeof VA_VARIETIES)[number];

/**
 * Butterfly was 'BTFLY' in the app and 'BTFY' on the client's chart; the client
 * settled on BTFY (2026-08-25). The 38 rows already saved as 'BTFLY' keep that
 * spelling — a stored variety is what the operator picked that day, and
 * rewriting it would be the same mistake as rewriting a count.
 *
 * So every read normalises instead. This must be applied anywhere a variety is
 * matched or grouped, or those 38 rows fall through to PD and get measured
 * ~7 points off — which is a milder version of the exact bug migration 033
 * exists to fix.
 */
const VARIETY_ALIASES: Record<string, VaVariety> = { BTFLY: 'BTFY' };

/** A stored variety string as the current chart names it. */
export function normaliseVariety(variety: string): string {
  const v = (variety || '').trim().toUpperCase();
  return VARIETY_ALIASES[v] ?? v;
}

// ─── HL to VA Standard Yield Chart ────────────────────────────────────────────
// Standard yield % by HL count range, one column per variety.
//
// From the client's STANDARD YIELD chart (V/A STANDARD YIELD) received
// 2026-08-25, with EZPL and BTFY per their correction the same day.
//
// It used to be three grouped columns — pd (PD/PUD/PVPD/BTFLY), pdto
// (PDTO/PVPDTO) and ezpl — and the client's chart showed two of those groupings
// to be wrong: BTFY does not track PD, and PVPDTO holds 87% at 71/90 and 91/110
// where PDTO drops to 86%. A grouping is an assertion that two varieties will
// never diverge, and it cost the 38 butterfly rows ~5 points of standard each.
// So there is no grouping now: every variety carries its own column, and a
// variety that moves on the next chart moves on its own. PD, PUD and PVPD share
// a figure at every band, but as three columns that agree, not as one column.
//
// Same arrangement as the HON→HL chart: since migration 032 admins edit the
// percentages in the app, the bands stay here (hl_va_entries.grade is stamped
// from them), and these values are what rows without a std_yield stamp are read
// against.
export type HlVaYieldColumn = VaVariety;

export type HlVaYieldEntry = {
  label: string; // Display label, e.g. "13/15"
  min: number;   // Inclusive lower bound
  max: number;   // Inclusive upper bound
} & Record<HlVaYieldColumn, number>;

const band = (
  label: string,
  min: number,
  max: number,
  pd: number,
  pdto: number,
  pvpdto: number,
  ezpl: number,
  btfy: number
): HlVaYieldEntry => ({
  label,
  min,
  max,
  // PD, PUD and PVPD are one figure on the client's chart at every band. They
  // are still three columns — same value today, independently editable.
  PD: pd,
  PUD: pd,
  PVPD: pd,
  PDTO: pdto,
  PVPDTO: pvpdto,
  EZPL: ezpl,
  BTFY: btfy,
});

// EZPL and BTFY carry the figures the client gave on 2026-08-25, which differ
// from the pdf they sent the same day: EZPL 99.5 (pdf said 99.0) and BTFY 87.0
// (pdf said 99.0). The client's later instruction wins over the pdf.
export const HLVA_YIELD_CHART: HlVaYieldEntry[] = [
  //      label     min  max     PD  PDTO  PVPDTO  EZPL  BTFY
  band('13/15',  13,  15,  83.0, 87.0, 87.0, 99.5, 87.0),
  band('16/20',  16,  20,  83.0, 87.0, 87.0, 99.5, 87.0),
  band('21/25',  21,  25,  82.0, 87.0, 87.0, 99.5, 87.0),
  band('26/30',  26,  30,  82.0, 87.0, 87.0, 99.5, 87.0),
  band('31/40',  31,  40,  81.5, 87.0, 87.0, 99.5, 87.0),
  band('41/50',  41,  50,  81.0, 87.0, 87.0, 99.5, 87.0),
  band('51/60',  51,  60,  81.0, 87.0, 87.0, 99.5, 87.0),
  band('61/70',  61,  70,  80.0, 87.0, 87.0, 99.5, 87.0),
  band('71/90',  71,  90,  80.0, 86.0, 87.0, 99.5, 87.0),
  band('91/110', 91, 110,  79.0, 86.0, 87.0, 99.5, 87.0),
];

// Which column a variety is measured against — now itself, for every variety
// the register offers. A blank or unrecognised variety still falls back to PD,
// which is what the register's own default chip is.
function varietyColumn(variety: string): HlVaYieldColumn {
  const v = normaliseVariety(variety);
  return (VA_VARIETIES as readonly string[]).includes(v) ? (v as HlVaYieldColumn) : 'PD';
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

/** Which chart column a variety is measured against. */
export const hlVaColumnFor = varietyColumn;

/** The editable columns on a band, in the register's own variety order. */
export const HLVA_COLUMNS: { key: HlVaYieldColumn; label: string; hint: string }[] =
  VA_VARIETIES.map((v) => ({ key: v, label: v, hint: `${v} standard yield` }));

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

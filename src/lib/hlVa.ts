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
//
// 111/ABOVE is the client's addition (2026-09-28), beyond the pdf — the same
// move as 221+ on the HON→HL chart. Until it existed, 115/120-count batches
// matched no band, were saved with a blank grade and landed under MIX on the
// Grade Vs VA sheet. The client gave no figures for it, so it opens on the
// 91/110 figures for admins to correct in the panel. The label is the one the
// Grade Vs VA sheet has always printed for this row, so the two can't drift.
export const HLVA_YIELD_CHART: HlVaYieldEntry[] = [
  //      label        min     max     PD  PDTO  PVPDTO  EZPL  BTFY
  band('13/15',      13,     15,  83.0, 87.0, 87.0, 99.5, 87.0),
  band('16/20',      16,     20,  83.0, 87.0, 87.0, 99.5, 87.0),
  band('21/25',      21,     25,  82.0, 87.0, 87.0, 99.5, 87.0),
  band('26/30',      26,     30,  82.0, 87.0, 87.0, 99.5, 87.0),
  band('31/40',      31,     40,  81.5, 87.0, 87.0, 99.5, 87.0),
  band('41/50',      41,     50,  81.0, 87.0, 87.0, 99.5, 87.0),
  band('51/60',      51,     60,  81.0, 87.0, 87.0, 99.5, 87.0),
  band('61/70',      61,     70,  80.0, 87.0, 87.0, 99.5, 87.0),
  band('71/90',      71,     90,  80.0, 86.0, 87.0, 99.5, 87.0),
  band('91/110',     91,    110,  79.0, 86.0, 87.0, 99.5, 87.0),
  band('111/ABOVE', 111, 999999,  79.0, 86.0, 87.0, 99.5, 87.0),
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

// ─── Rejection (RJ) batches ──────────────────────────────────────────────────
// A rejection batch is VA product sent back and re-worked. Since migration 038
// it is a tick box on the register (hl_va_entries.is_rejection), and the batch
// id stays the real batch id — so Batch Pipeline, the RZ / Summit split and the
// plan still find it — with "RJ" added only where the batch is shown.
//
// Re-work is not counted as production twice: Completed VA, VA Target, Head
// Waste and Plan vs Actual leave RJ rows out, and every report that lists them
// shows them apart. It IS measured against the same standard yield chart.

/** What the app appends to a rejection batch's id wherever it is shown. */
export const RJ_SUFFIX = 'RJ';

/**
 * The floor's own way of writing RJ before the tick box existed: "40 RJ",
 * "31/40RJ", "50R/J", "26/30RJFC" in the Count, or a Batch ID ending in RJ.
 * The marker must not follow a letter, so it can't be read out of a word.
 *
 * Same rule as hl_va_flag_rejection_marker() in migration 038, which flags
 * such a row whatever wrote it — change the two together.
 */
const COUNT_RJ_MARKER = /(^|[^A-Za-z])R\s*[/.-]?\s*J/i;
const BATCH_RJ_MARKER = /(^|[^A-Za-z])R\s*[/.-]?\s*J\s*$/i;

/** Does the typed Count or Batch ID already say this is a rejection? */
export function hasRejectionMarker(batchId: string, countText: string): boolean {
  return COUNT_RJ_MARKER.test(countText || '') || BATCH_RJ_MARKER.test(batchId || '');
}

/**
 * The batch id without a trailing RJ someone typed into it — the tick box
 * carries that now, and "26I25/6RJ" would never match "26I25/6" in a search.
 * A batch id that is nothing but "RJ" is left alone rather than saved blank.
 */
export function stripRejectionMarker(batchId: string): string {
  const stripped = (batchId || '')
    .replace(BATCH_RJ_MARKER, '$1')
    // "26I25/6-RJ" leaves its separator behind
    .replace(/[\s\-_.]+$/, '')
    .trim();
  return stripped || (batchId || '').trim();
}

/**
 * A row on the Daily Entry form is RJ when its box is ticked or its Count /
 * Batch ID carries the marker. The marker can't be unticked — the database
 * would flag the row on save regardless — so the form shows it forced on.
 */
export function hlVaRowIsRejection(row: {
  is_rejection: boolean;
  batch_id: string;
  count_text: string;
}): boolean {
  return row.is_rejection || hasRejectionMarker(row.batch_id, row.count_text);
}

/** A saved HL→VA row is a rejection exactly when its flag says so. */
export function isRejectionEntry(entry: { is_rejection?: boolean | null }): boolean {
  return entry.is_rejection === true;
}

/** The batch as the register shows it: "26I25/6 RJ" for a rejection. */
export function hlVaBatchLabel(batchId: string, isRejection: boolean | null | undefined): string {
  const id = (batchId || '').trim();
  if (!isRejection || BATCH_RJ_MARKER.test(id)) return id;
  return id ? `${id} ${RJ_SUFFIX}` : RJ_SUFFIX;
}

// Indian-style grouping to match the register (e.g. 2,10,178.000)
export function formatVaQty(value: number): string {
  if (!value) return '-';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

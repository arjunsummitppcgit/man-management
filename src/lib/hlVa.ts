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
export function lookupHlVaStandardYield(countText: string, variety: string): number | null {
  const count = extractCountNumber(countText);
  if (count === null) return null;
  const entry = HLVA_YIELD_CHART.find((e) => count >= e.min && count <= e.max);
  if (!entry) return null;
  return entry[varietyColumn(variety)];
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

// Indian-style grouping to match the register (e.g. 2,10,178.000)
export function formatVaQty(value: number): string {
  if (!value) return '-';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

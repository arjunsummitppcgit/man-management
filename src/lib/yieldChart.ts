// ─── Standard Yield Chart ─────────────────────────────────────────────────────
// Constant reference table mapping count ranges to standard yield percentages.
// Used for auto-calculating standard yield from the count field.

export interface YieldChartEntry {
  label: string;      // Display label, e.g. "22-40"
  min: number;        // Inclusive lower bound
  max: number;        // Inclusive upper bound
  standardYield: number; // Standard yield percentage, e.g. 71.00
}

export const YIELD_CHART: YieldChartEntry[] = [
  { label: '22-40',    min: 22,  max: 40,  standardYield: 71.00 },
  { label: '41-60',    min: 41,  max: 60,  standardYield: 70.00 },
  { label: '61-70C',   min: 61,  max: 70,  standardYield: 69.00 },
  { label: '71-80C',   min: 71,  max: 80,  standardYield: 68.00 },
  { label: '81-90C',   min: 81,  max: 90,  standardYield: 67.00 },
  { label: '91-100C',  min: 91,  max: 100, standardYield: 66.00 },
  { label: '101-110C', min: 101, max: 110, standardYield: 65.00 },
  { label: '111-120C', min: 111, max: 120, standardYield: 64.00 },
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
 */
export function lookupStandardYield(countText: string): number | null {
  const count = extractCountNumber(countText);
  if (count === null) return null;

  const entry = YIELD_CHART.find((e) => count >= e.min && count <= e.max);
  return entry?.standardYield ?? null;
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

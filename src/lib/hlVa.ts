// ─── HL to VA constants & helpers ────────────────────────────────────────────

// Variety options for HL -> VA batch entries (order matches the register chips)
export const VA_VARIETIES = [
  'PD',
  'PDTO',
  'PVPD',
  'PVPDTO',
  'EZPL',
  'PUD',
] as const;

export type VaVariety = (typeof VA_VARIETIES)[number];

// Indian-style grouping to match the register (e.g. 2,10,178.000)
export function formatVaQty(value: number): string {
  if (!value) return '-';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

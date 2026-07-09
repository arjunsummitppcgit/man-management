// ─── Grades vs Value Addition (V/A) constants & helpers ─────────────────────

// Fixed grade list (row order matches the physical V/A register)
export const VA_GRADES = [
  '8/12',
  '13/15',
  '16/20',
  '21/25',
  '26/30',
  '31/35',
  '31/40',
  '41/50',
  '51/60',
  '61/70',
  '71/90',
  '91/110',
  '111/ABOVE',
  'MIX',
] as const;

export const VA_COLUMNS = [
  { key: 'pd', label: 'PD' },
  { key: 'pud', label: 'PUD' },
  { key: 'pdto', label: 'PDTO' },
  { key: 'ezpl', label: 'EZPL' },
  { key: 'pvpd', label: 'PVPD' },
  { key: 'pvpdto', label: 'PVPDTO' },
] as const;

export type VaColumnKey = (typeof VA_COLUMNS)[number]['key'];

// Indian-style grouping to match the register (e.g. 2,10,178.000)
export function formatVaQty(value: number): string {
  if (!value) return '-';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

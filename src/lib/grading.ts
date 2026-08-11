// ─── All PPC's Grading Data ───────────────────────────────────────────────────
// The daily grading register: when each grading unit started and stopped, how
// much it graded, and therefore how long it actually ran. Running hours are the
// point of the register — the quantity alone doesn't say whether a machine was
// worked hard or simply left on.
//
// The row list is fixed and printed in this order. Two of the rows aren't
// machines at all: they carry a free-text boys-timing note that spans the time
// columns on the paper sheet, with no times or quantity of their own.

export type GradingUnitKind = 'machine' | 'note';

export interface GradingUnit {
  key: string;
  label: string;
  kind: GradingUnitKind;
}

/** Add a unit here to add a row; existing rows key off `key`, so don't rename those. */
export const GRADING_UNITS: GradingUnit[] = [
  { key: 'ppc1', label: 'PPC 1', kind: 'machine' },
  { key: 'plant_scanner', label: 'SME PPC Scanner Machine', kind: 'machine' },
  { key: 'plant_roller', label: 'SME PPC Roller Machine', kind: 'machine' },
  { key: 'raju_boys_out', label: 'Raju Boys Out Time SME', kind: 'note' },
  { key: 'basanth_boys_in', label: 'Basanth Boys Inn Time SME', kind: 'note' },
];

export const MACHINE_UNITS = GRADING_UNITS.filter((u) => u.kind === 'machine');
export const NOTE_UNITS = GRADING_UNITS.filter((u) => u.kind === 'note');

/** Postgres TIME arrives as 'HH:MM:SS'; minutes since midnight, or null if unusable. */
function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':');
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

/** '09:40:00' → '9:40 AM'. Returns '' when there's nothing to show. */
export function formatTime(time: string | null | undefined): string {
  const total = minutesOf(time);
  if (total === null) return '';
  const hours24 = Math.floor(total / 60);
  const mins = total % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/**
 * Hours a unit ran, as a decimal. A stop time at or before the start is read as
 * running past midnight rather than as a negative shift.
 */
export function runningHours(
  start: string | null | undefined,
  stop: string | null | undefined
): number | null {
  const from = minutesOf(start);
  const to = minutesOf(stop);
  if (from === null || to === null) return null;
  const span = to > from ? to - from : to + 24 * 60 - from;
  return span / 60;
}

/** 8.5 → '8h 30m'. The register is read by people, not spreadsheets. */
export function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '';
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  // Rounding can tip 59.6m into a full hour
  if (mins === 60) return `${whole + 1}h 0m`;
  return `${whole}h ${mins}m`;
}

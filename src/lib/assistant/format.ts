// ─── Assistant display formatting ────────────────────────────────────────────
// Dates are stored, queried and passed to tools as ISO yyyy-MM-dd — that never
// changes. Everything a person READS (headings, date pills, table cells, the
// XLS/PDF exports) goes through here and comes out dd-mm-yy.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** 2026-08-26 → 26-08-26. Anything that isn't an ISO date passes through. */
export function toDdMmYy(iso: string): string {
  if (!ISO_DATE_RE.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y.slice(2)}`;
}

/** 2026-08-26 → 26-08 — for tight spots like chart ticks and per-day columns. */
export function toDdMm(iso: string): string {
  if (!ISO_DATE_RE.test(iso)) return iso;
  const [, m, d] = iso.split('-');
  return `${d}-${m}`;
}

/** 2026-08 → Aug 2026. */
export function toMonthLabel(month: string): string {
  if (!ISO_MONTH_RE.test(month)) return month;
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** One day → "26-08-26"; a range → "01-08-26 → 26-08-26". */
export function periodLabel(from: string, to?: string): string {
  const end = to || from;
  return from === end ? toDdMmYy(from) : `${toDdMmYy(from)} → ${toDdMmYy(end)}`;
}

/** Rewrites every ISO date inside a free-text string to dd-mm-yy. */
export function humanizeDates(text: string): string {
  return text.replace(/\d{4}-\d{2}-\d{2}/g, (m) => toDdMmYy(m));
}

/** Inclusive day span of a period. Returns 0 for malformed input. */
export function dayCount(from: string, to?: string): number {
  const end = to || from;
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(end)) return 0;
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

/** Every ISO date from `from` to `to` inclusive, so gaps show as zero rows. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const span = dayCount(from, to);
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < span; i += 1) {
    out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/** "1 day" / "26 days" — used in result subtitles. */
export function daysPhrase(from: string, to?: string): string {
  const n = dayCount(from, to);
  return n === 1 ? '1 day' : `${n} days`;
}

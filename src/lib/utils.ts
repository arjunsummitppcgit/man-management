import { format, parseISO, getDaysInMonth as dfnsGetDaysInMonth, differenceInCalendarDays, endOfMonth } from 'date-fns';

/**
 * Format a date as 'DD MMM YYYY' (e.g. '28 May 2026')
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd MMM yyyy');
}

/**
 * Format a date as 'DD/MM' (e.g. '28/05')
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM');
}

/**
 * Format a number as kg with 1 decimal place (e.g. '1234.5 kg')
 */
export function formatKg(kg: number): string {
  return `${kg.toFixed(3)} kg`;
}

/**
 * Return month name from 1-indexed month number
 */
export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[month - 1] || '';
}

/**
 * Get the number of days in a given month (1-indexed month)
 */
export function getDaysInMonth(year: number, month: number): number {
  return dfnsGetDaysInMonth(new Date(year, month - 1));
}

/**
 * Get the number of days remaining in the month from today (inclusive of today)
 */
export function getDaysRemainingInMonth(year: number, month: number): number {
  const today = new Date();
  const monthEnd = endOfMonth(new Date(year, month - 1));

  // If we're past this month, return 0
  if (today > monthEnd) return 0;

  // If we're before this month, return total days
  const monthStart = new Date(year, month - 1, 1);
  if (today < monthStart) return dfnsGetDaysInMonth(monthStart);

  // Days remaining including today
  return differenceInCalendarDays(monthEnd, today) + 1;
}

/**
 * Calculate the daily average needed to hit the target
 */
export function calculateDailyAverage(
  target: number,
  processed: number,
  daysRemaining: number
): number {
  if (daysRemaining <= 0) return 0;
  const remaining = target - processed;
  if (remaining <= 0) return 0;
  return remaining / daysRemaining;
}

/**
 * Get a Tailwind color class based on progress percentage
 *  - >75%  → green (on track)
 *  - 50-75% → amber (warning)
 *  - <50%  → rose (behind)
 */
export function getProgressColor(percentage: number): string {
  if (percentage > 75) return 'text-emerald-500';
  if (percentage >= 50) return 'text-amber-500';
  return 'text-rose-500';
}

/**
 * Get today's date as a 'YYYY-MM-DD' string
 */
export function getTodayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Merge class names, filtering out falsy values
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

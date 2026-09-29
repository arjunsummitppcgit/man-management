// ─── Whole-day register saves (migration 039) ────────────────────────────────
// HONS TO HL, HL to VA, Company Ladies, Grading and the PPC Plan each replace a
// whole date when they save. Until 039 that was a DELETE then an INSERT, as two
// requests: a refused insert left the day empty (28 Sep 2026's HONS TO HL was
// lost that way), and two people saving the same day overwrote each other.
//
// Now each register saves through one database function that deletes and
// inserts in a single transaction, and sends the ids of the rows its form was
// loaded from. The function refuses the save — changing nothing — if the day
// was saved by someone else in between (STALE_REGISTER). The hook refuses it
// itself if the form was never loaded for that date (REGISTER_NOT_LOADED): a
// failed load shows an empty form, and saving that would wipe the real day.

/** The rows a register's form was filled from, for one date. */
export interface LoadedRegister {
  date: string;
  ids: string[];
}

/** Thrown by a hook asked to save a date its form hasn't loaded. */
export const REGISTER_NOT_LOADED = 'REGISTER_NOT_LOADED';

/** Raised by the save functions when the day changed since it was loaded. */
const STALE_REGISTER = 'STALE_REGISTER';

interface SaveProblem {
  title: string;
  message: string;
  hint: string;
}

const messageOf = (error: unknown): string =>
  error && typeof error === 'object' && 'message' in error
    ? String((error as { message: unknown }).message)
    : '';

/**
 * The popup for a save the register itself stopped, or null for any other
 * error. Both cases changed nothing in the database — the popup says so,
 * because "failed" is what made people re-type a day that was fine.
 */
export function registerSaveProblem(error: unknown): SaveProblem | null {
  const message = messageOf(error);
  if (message.includes(STALE_REGISTER)) {
    return {
      title: 'Someone else saved this day',
      message:
        'Another person saved this page for the same date after you opened it. Your changes were NOT saved, and nothing was lost.',
      hint: 'Note down what you typed, then reload the page to see their version, and add your changes to it.',
    };
  }
  if (message.includes(REGISTER_NOT_LOADED)) {
    return {
      title: 'This day has not loaded yet',
      message:
        'The saved data for this date had not finished loading (or failed to load), so the save was stopped to protect it. Nothing was changed.',
      hint: 'Wait a moment or reload the page, check the rows, then save again.',
    };
  }
  return null;
}

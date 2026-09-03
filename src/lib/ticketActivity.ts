// ─── "What changed on Tickets since I last looked" ───────────────────────────
// Pure date arithmetic, kept away from React so it can be reasoned about (and
// tested) on its own. Used by useTicketAlerts and the Tickets page.

/**
 * Read the stored marker. It is written as epoch milliseconds, so '' / junk /
 * a value from an older format all mean "never looked".
 */
export function parseSeenMarker(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Has this row been touched since `since` (epoch ms, null = never looked)?
 *
 * The two sides arrive in different shapes — Postgres hands back
 * '2026-08-27T09:02:47.123456+00:00' while Date#toISOString gives
 * '…09:02:47.123Z' — so they are compared as instants. Comparing them as
 * strings puts 'Z' after '4' and reports a stale row as new.
 */
export function isNewerThan(updatedAt: string, since: number | null): boolean {
  if (since === null) return true;
  const ms = Date.parse(updatedAt);
  return Number.isFinite(ms) && ms > since;
}

/**
 * The most recent activity in a list, for the "seen up to here" marker. Marking
 * against this rather than the clock means a change landing a moment after the
 * page loads still raises the badge.
 */
export function newestActivity(rows: { updated_at: string }[]): string | undefined {
  return rows.reduce<string | undefined>(
    (newest, row) => (!newest || row.updated_at > newest ? row.updated_at : newest),
    undefined
  );
}

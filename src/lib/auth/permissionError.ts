// ─── Recognising a write the database refused ────────────────────────────────
// RLS (migration 027) rejects a write the user has no right to make with
// SQLSTATE 42501, which PostgREST returns as HTTP 403. The UI checks the same
// rules before saving, but the two can drift — a permission revoked mid-session,
// a page that forgets to pre-check — and when they do the user must still be
// told WHY, not just "failed, try again".
//
// Note what this CANNOT catch: an UPDATE or DELETE blocked by RLS is not an
// error in Postgres, it simply matches no rows. That is why every write path
// checks the user's rights before the round-trip rather than relying on this.

/** True when the error is the database saying "you are not allowed to do that". */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const e = error as { code?: unknown; status?: unknown; message?: unknown };

  if (e.code === '42501') return true; // insufficient_privilege / RLS violation
  if (e.status === 403) return true;

  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return (
    message.includes('row-level security') ||
    message.includes('row level security') ||
    message.includes('permission denied')
  );
}

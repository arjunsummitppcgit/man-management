// ─── Sub-user (staff) account list ───────────────────────────────────────────
// Single source of truth, shared by the client auth hook AND server API routes
// (the assistant route must enforce the same restrictions server-side).
// These accounts are restricted to today's date only; admin is anyone NOT here.

export const SUB_USER_EMAILS = [
  'ramakrishna@ppc.com',
  'sairam@ppc.com',
  'manisha@ppc.com',
];

export function isSubUserEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return SUB_USER_EMAILS.includes(email.toLowerCase().trim());
}

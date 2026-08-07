// ─── Permission shapes + the date rule ───────────────────────────────────────
// The date rule is implemented TWICE on purpose: here for the UI (so fields
// disable and the reason can be explained) and in SQL in migration 027 (so the
// rule holds even if someone calls the API directly). Keep the two in step —
// if you change one, change can_edit_on() in the migration to match.

export type AppRole = 'admin' | 'staff';

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface PagePermission {
  user_id: string;
  page_key: string;
  can_view: boolean;
  can_modify: boolean;
}

export interface EditWindow {
  id: string;
  user_id: string;
  page_key: string;
  from_date: string; // yyyy-MM-dd
  to_date: string;
  active_until: string;
  reason: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
}

/** yyyy-MM-dd for "now" in IST — the same day boundary the database uses. */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function yesterdayIST(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/** A window only counts while it is unrevoked and its active_until hasn't passed. */
export function isWindowOpen(w: EditWindow, today = todayIST()): boolean {
  return !w.revoked_at && w.active_until >= today;
}

export interface EditCheck {
  allowed: boolean;
  /** Why not — shown to the user instead of a silently dead field. */
  reason?: string;
}

/**
 * Can this user write `date` on `pageKey`?
 * Mirrors can_edit_on() in migration 027.
 */
export function checkEdit(params: {
  isAdmin: boolean;
  canModify: boolean;
  pageKey: string;
  date: string;
  windows: EditWindow[];
  today?: string;
}): EditCheck {
  const { isAdmin, canModify, pageKey, date, windows } = params;
  const today = params.today ?? todayIST();

  if (isAdmin) return { allowed: true };
  if (!canModify) return { allowed: false, reason: 'You have view-only access to this page.' };
  if (!date) return { allowed: false, reason: 'No date selected.' };

  if (date > today) return { allowed: false, reason: 'Future dates cannot be entered.' };
  if (date >= yesterdayIST()) return { allowed: true };

  const open = windows.find(
    (w) => w.page_key === pageKey && isWindowOpen(w, today) && date >= w.from_date && date <= w.to_date
  );
  if (open) return { allowed: true };

  return {
    allowed: false,
    reason: 'You can only edit today and yesterday. Ask an admin to open a date window for older days.',
  };
}

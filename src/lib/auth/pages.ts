// ─── The pages permissions can be granted on ─────────────────────────────────
// `key` is the contract with the database: it is what lands in
// user_page_permissions.page_key and what the RLS helpers in migration 027
// (can_view_page / can_modify_page / can_edit_on) are called with. Renaming a
// key without a migration silently revokes access, so don't.

export interface AppPage {
  key: string;
  label: string;
  path: string;
  /** Writes on this page carry a work_date, so edit windows apply. */
  dated: boolean;
  /** What "modify" means here, shown to admin in the permissions grid. */
  modifyHint: string;
}

export const APP_PAGES: AppPage[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', dated: false, modifyHint: 'edit the day’s summary tiles' },
  { key: 'daily-entry', label: 'Daily Entry', path: '/daily-entry', dated: true, modifyHint: 'workforce, processing, sanitization, yield, HL→VA, grading' },
  { key: 'supervisors', label: 'Supervisors', path: '/supervisors', dated: true, modifyHint: 'roster and daily attendance' },
  { key: 'local-ladies-attendance', label: 'Ladies Attendance', path: '/local-ladies-attendance', dated: true, modifyHint: 'batch attendance per day' },
  { key: 'ladies-per-head-amount', label: 'Per Head Amount', path: '/ladies-per-head-amount', dated: true, modifyHint: 'per-head amounts per day' },
  { key: 'maintenance-tasks', label: 'My Tasks', path: '/maintenance-tasks', dated: false, modifyHint: 'create and close maintenance tasks' },
  { key: 'tickets', label: 'Tickets', path: '/tickets', dated: false, modifyHint: 'raise tickets, comment and move them along' },
  { key: 'yield-report', label: 'Daily Report', path: '/yield-report', dated: false, modifyHint: 'read-only report' },
  { key: 'analytics', label: 'Analytics', path: '/analytics', dated: false, modifyHint: 'set monthly VA targets' },
  { key: 'assistant', label: 'Assistant', path: '/assistant', dated: false, modifyHint: 'ask questions about the data' },
  { key: 'settings', label: 'Reports & Settings', path: '/settings', dated: false, modifyHint: 'exports, locations, app settings' },
];

export const PAGE_KEYS = APP_PAGES.map((p) => p.key);

const BY_PATH = new Map(APP_PAGES.map((p) => [p.path, p]));

/** Longest-prefix match, so /daily-entry/anything still resolves to daily-entry. */
export function pageForPath(pathname: string): AppPage | undefined {
  const exact = BY_PATH.get(pathname);
  if (exact) return exact;
  return APP_PAGES.filter((p) => p.path !== '/' && pathname.startsWith(p.path)).sort(
    (a, b) => b.path.length - a.path.length
  )[0];
}

export function pageLabel(key: string): string {
  return APP_PAGES.find((p) => p.key === key)?.label ?? key;
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { APP_PAGES, pageLabel } from '@/lib/auth/pages';
import { isWindowOpen, todayIST, type AppUser, type EditWindow, type PagePermission } from '@/lib/auth/permissions';

type PermState = Record<string, { view: boolean; modify: boolean }>;

const fmtDate = (d: string) => format(parseISO(d), 'd MMM yyyy');

const PAGE_ORDER = new Map(APP_PAGES.map((p, i) => [p.key, i]));

/** The rows of one grant share their dates; group them so it reads as one window. */
const groupKey = (w: EditWindow) => `${w.from_date}|${w.to_date}|${w.active_until}|${w.reason ?? ''}`;

/** Page names for one grant, ordered as in the permissions grid above. */
const groupLabels = (group: EditWindow[]) =>
  [...new Set(group.map((w) => w.page_key))]
    .sort((a, b) => (PAGE_ORDER.get(a) ?? 99) - (PAGE_ORDER.get(b) ?? 99))
    .map(pageLabel)
    .join(', ');

/**
 * Per-page View/Modify rights for one user, plus the date windows that let them
 * reach back past yesterday. Admins are shown as read-only — their access is
 * implicit, so there is nothing here to tick.
 */
export default function UserPermissionsModal({
  isOpen,
  onClose,
  user,
  permissions,
  windows,
  actorEmail,
  onSavePermissions,
  onAddWindow,
  onRevokeWindows,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
  permissions: PagePermission[];
  windows: EditWindow[];
  actorEmail: string;
  onSavePermissions: (userId: string, rows: { page_key: string; can_view: boolean; can_modify: boolean }[], actorEmail: string) => Promise<void>;
  onAddWindow: (row: { user_id: string; page_keys: string[]; from_date: string; to_date: string; active_until: string; reason: string | null }, actorEmail: string) => Promise<void>;
  onRevokeWindows: (windowIds: string[], actorEmail: string) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [perms, setPerms] = useState<PermState>({});
  const [saving, setSaving] = useState(false);

  // Grant form — one set of dates covering however many pages are ticked
  const [grantPages, setGrantPages] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeUntil, setActiveUntil] = useState('');
  const [reason, setReason] = useState('');
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    const byPage = new Map(permissions.filter((p) => p.user_id === user.id).map((p) => [p.page_key, p]));
    setPerms(
      Object.fromEntries(
        APP_PAGES.map((p) => [
          p.key,
          { view: !!byPage.get(p.key)?.can_view, modify: !!byPage.get(p.key)?.can_modify },
        ])
      )
    );
    setGrantPages([]);
    setFromDate('');
    setToDate('');
    setActiveUntil('');
    setReason('');
  }, [isOpen, user, permissions]);

  const userWindows = useMemo(
    () => windows.filter((w) => user && w.user_id === user.id).filter((w) => isWindowOpen(w)),
    [windows, user]
  );

  const windowGroups = useMemo(() => {
    const groups = new Map<string, EditWindow[]>();
    for (const w of userWindows) {
      const key = groupKey(w);
      const existing = groups.get(key);
      if (existing) existing.push(w);
      else groups.set(key, [w]);
    }
    return [...groups.values()];
  }, [userWindows]);

  /** A page with a live window can't take a second one until that one is closed. */
  const openPageKeys = useMemo(() => new Set(userWindows.map((w) => w.page_key)), [userWindows]);

  // A window is only useful on a dated page the user can actually modify
  const grantablePages = useMemo(
    () => APP_PAGES.filter((p) => p.dated && perms[p.key]?.modify),
    [perms]
  );

  // Drop ticks for pages that just lost Modify, or that just got a window
  useEffect(() => {
    setGrantPages((prev) => {
      const next = prev.filter((k) => grantablePages.some((p) => p.key === k) && !openPageKeys.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [grantablePages, openPageKeys]);

  if (!user) return null;

  const toggle = (key: string, field: 'view' | 'modify') =>
    setPerms((prev) => {
      const next = { ...prev[key], [field]: !prev[key][field] };
      if (field === 'modify' && next.modify) next.view = true;
      if (field === 'view' && !next.view) next.modify = false;
      return { ...prev, [key]: next };
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSavePermissions(
        user.id,
        APP_PAGES.map((p) => ({ page_key: p.key, can_view: perms[p.key].view, can_modify: perms[p.key].modify })),
        actorEmail
      );
      showToast(`Permissions updated for ${user.email}`, 'success');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save permissions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePage = (key: string) =>
    setGrantPages((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleGrant = async () => {
    if (grantPages.length === 0) {
      showToast('Tick at least one page to open', 'error');
      return;
    }
    // Belt and braces — the checkboxes for these are disabled already.
    const blocked = grantPages.filter((k) => openPageKeys.has(k));
    if (blocked.length) {
      showToast(
        `${blocked.map(pageLabel).join(', ')} already ${blocked.length === 1 ? 'has an open window' : 'have open windows'} — close ${blocked.length === 1 ? 'it' : 'them'} first, then open a new one.`,
        'error'
      );
      return;
    }
    if (!fromDate || !toDate || !activeUntil) {
      showToast('Fill the from, to and active-until dates', 'error');
      return;
    }
    if (toDate < fromDate) {
      showToast('The to date cannot be before the from date', 'error');
      return;
    }
    if (activeUntil < todayIST()) {
      showToast('Active until is already in the past', 'error');
      return;
    }
    // Grid order, not tick order, so the rows and the toast read predictably
    const pages = [...grantPages].sort((a, b) => (PAGE_ORDER.get(a) ?? 99) - (PAGE_ORDER.get(b) ?? 99));

    setGranting(true);
    try {
      await onAddWindow(
        {
          user_id: user.id,
          page_keys: pages,
          from_date: fromDate,
          to_date: toDate,
          active_until: activeUntil,
          reason: reason.trim() || null,
        },
        actorEmail
      );
      showToast(
        `${user.email} can now edit ${fmtDate(fromDate)} – ${fmtDate(toDate)} on ${pages.map(pageLabel).join(', ')}`,
        'success'
      );
      setGrantPages([]);
      setFromDate('');
      setToDate('');
      setActiveUntil('');
      setReason('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open the window', 'error');
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (group: EditWindow[]) => {
    try {
      await onRevokeWindows(
        group.map((w) => w.id),
        actorEmail
      );
      showToast(`Window closed for ${groupLabels(group)}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not close the window', 'error');
    }
  };

  const inputClass =
    'w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 text-sm bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={user.full_name || user.email}>
      <div className="space-y-4">
        {user.role === 'admin' ? (
          <div className="rounded-xl bg-teal-50 px-4 py-3">
            <p className="text-sm font-bold text-teal-700">Admin — full access</p>
            <p className="text-xs text-teal-600 font-medium mt-1">
              Admins reach every page and every date, and manage users. To restrict this account, change
              its role to Staff first.
            </p>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Page access</label>
                <div className="flex gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-wide pr-1">
                  <span className="w-10 text-center">View</span>
                  <span className="w-10 text-center">Modify</span>
                </div>
              </div>
              <div className="space-y-1">
                {APP_PAGES.map((page) => (
                  <div key={page.key} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-700 truncate">{page.label}</p>
                      <p className="text-[10px] text-gray-400 font-medium truncate">{page.modifyHint}</p>
                    </div>
                    <div className="flex gap-4 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={!!perms[page.key]?.view}
                        onChange={() => toggle(page.key, 'view')}
                        className="w-10 h-5 accent-teal-600 cursor-pointer"
                        aria-label={`${page.label} view`}
                      />
                      <input
                        type="checkbox"
                        checked={!!perms[page.key]?.modify}
                        onChange={() => toggle(page.key, 'modify')}
                        className="w-10 h-5 accent-teal-600 cursor-pointer"
                        aria-label={`${page.label} modify`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Old-date access ─────────────────────────────────────────── */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700">Open old dates</label>
              <p className="text-xs text-gray-400 font-medium mt-1 mb-3">
                Without a window this user can only edit today and yesterday. A window unlocks the work
                dates you pick, and closes itself on the active-until date.
              </p>

              {windowGroups.length > 0 && (
                <div className="space-y-2 mb-3">
                  {windowGroups.map((group) => (
                    <div key={group[0].id} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-amber-700">
                          {groupLabels(group)}
                        </p>
                        <p className="text-[10px] text-amber-600 font-medium">
                          {fmtDate(group[0].from_date)} – {fmtDate(group[0].to_date)} · closes{' '}
                          {fmtDate(group[0].active_until)}
                          {group[0].reason ? ` · ${group[0].reason}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevoke(group)}
                        className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white text-rose-600 hover:opacity-80 active:scale-95 transition-all"
                      >
                        Close {group.length > 1 ? 'all' : 'now'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {grantablePages.length === 0 ? (
                <p className="text-xs text-gray-400 font-medium rounded-xl bg-gray-50 px-3 py-2.5">
                  Give this user Modify on a dated page first — then you can open old dates for it.
                </p>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                      Pages to open{grantPages.length > 0 ? ` · ${grantPages.length} selected` : ''}
                    </label>
                    <div className="rounded-xl bg-gray-50 px-3 py-1.5">
                      {grantablePages.map((page) => {
                        const alreadyOpen = openPageKeys.has(page.key);
                        return (
                          <label
                            key={page.key}
                            className={`flex items-center justify-between gap-3 py-1.5 ${
                              alreadyOpen ? '' : 'cursor-pointer'
                            }`}
                          >
                            <div className="min-w-0">
                              <p
                                className={`text-sm font-semibold truncate ${
                                  alreadyOpen ? 'text-gray-400' : 'text-gray-700'
                                }`}
                              >
                                {page.label}
                              </p>
                              {alreadyOpen && (
                                <p className="text-[10px] text-amber-600 font-medium">
                                  Window already open — close it above before opening a new one
                                </p>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={grantPages.includes(page.key)}
                              disabled={alreadyOpen}
                              onChange={() => togglePage(page.key)}
                              className="w-10 h-5 accent-teal-600 cursor-pointer flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Open old dates for ${page.label}`}
                            />
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">
                      The dates below apply to every page ticked here.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                        Edit from
                      </label>
                      <input type="date" value={fromDate} max={todayIST()} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                        Edit to
                      </label>
                      <input type="date" value={toDate} max={todayIST()} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                      Permission active until
                    </label>
                    <input type="date" value={activeUntil} min={todayIST()} onChange={(e) => setActiveUntil(e.target.value)} className={inputClass} />
                  </div>

                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (optional) — e.g. correcting July sanitization"
                    className={inputClass}
                  />

                  <Button variant="secondary" fullWidth size="sm" onClick={handleGrant} loading={granting}>
                    Open Window{grantPages.length > 1 ? 's' : ''}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-4 px-5 pt-3 pb-4 bg-white border-t border-gray-100 flex items-center gap-2.5">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Close
          </Button>
          {user.role !== 'admin' && (
            <Button fullWidth onClick={handleSave} loading={saving}>
              Save Access
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

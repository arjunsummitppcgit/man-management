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
  onRevokeWindow,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
  permissions: PagePermission[];
  windows: EditWindow[];
  actorEmail: string;
  onSavePermissions: (userId: string, rows: { page_key: string; can_view: boolean; can_modify: boolean }[], actorEmail: string) => Promise<void>;
  onAddWindow: (row: { user_id: string; page_key: string; from_date: string; to_date: string; active_until: string; reason: string | null }, actorEmail: string) => Promise<void>;
  onRevokeWindow: (windowId: string, actorEmail: string) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [perms, setPerms] = useState<PermState>({});
  const [saving, setSaving] = useState(false);

  // Grant form
  const [grantPage, setGrantPage] = useState('daily-entry');
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
    setFromDate('');
    setToDate('');
    setActiveUntil('');
    setReason('');
  }, [isOpen, user, permissions]);

  const userWindows = useMemo(
    () => windows.filter((w) => user && w.user_id === user.id).filter((w) => isWindowOpen(w)),
    [windows, user]
  );

  // A window is only useful on a dated page the user can actually modify
  const grantablePages = useMemo(
    () => APP_PAGES.filter((p) => p.dated && perms[p.key]?.modify),
    [perms]
  );

  useEffect(() => {
    if (grantablePages.length && !grantablePages.some((p) => p.key === grantPage)) {
      setGrantPage(grantablePages[0].key);
    }
  }, [grantablePages, grantPage]);

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

  const handleGrant = async () => {
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
    setGranting(true);
    try {
      await onAddWindow(
        {
          user_id: user.id,
          page_key: grantPage,
          from_date: fromDate,
          to_date: toDate,
          active_until: activeUntil,
          reason: reason.trim() || null,
        },
        actorEmail
      );
      showToast(`${user.email} can now edit ${fmtDate(fromDate)} – ${fmtDate(toDate)}`, 'success');
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

  const handleRevoke = async (id: string) => {
    try {
      await onRevokeWindow(id, actorEmail);
      showToast('Window closed', 'success');
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

              {userWindows.length > 0 && (
                <div className="space-y-2 mb-3">
                  {userWindows.map((w) => (
                    <div key={w.id} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-amber-700 truncate">
                          {pageLabel(w.page_key)} · {fmtDate(w.from_date)} – {fmtDate(w.to_date)}
                        </p>
                        <p className="text-[10px] text-amber-600 font-medium truncate">
                          closes {fmtDate(w.active_until)}
                          {w.reason ? ` · ${w.reason}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevoke(w.id)}
                        className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white text-rose-600 hover:opacity-80 active:scale-95 transition-all"
                      >
                        Close now
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
                  <select value={grantPage} onChange={(e) => setGrantPage(e.target.value)} className={inputClass}>
                    {grantablePages.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>

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
                    Open Window
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

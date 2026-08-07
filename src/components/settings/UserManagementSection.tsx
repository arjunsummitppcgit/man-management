'use client';

import React, { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useUserAdmin } from '@/hooks/useUserAdmin';
import { isWindowOpen, type AppUser } from '@/lib/auth/permissions';
import { pageLabel } from '@/lib/auth/pages';
import CreateUserModal from './CreateUserModal';
import UserPermissionsModal from './UserPermissionsModal';

const AUDIT_LABELS: Record<string, string> = {
  'user.create': 'created user',
  'user.update': 'updated user',
  'user.delete': 'deleted user',
  'permissions.update': 'changed page access for',
  'window.grant': 'opened a date window for',
  'window.revoke': 'closed a date window for',
};

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return format(parseISO(iso), 'd MMM');
}

/** Reset another user's password. Admin sets it directly — no email round-trip. */
function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AppUser | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${user!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not reset the password');
      showToast(`Password reset for ${user!.email}`, 'success');
      setPassword('');
      onDone();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not reset the password', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!user} onClose={onClose} title="Reset Password">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 font-medium">
          Set a new password for <span className="font-bold text-gray-700">{user?.email}</span>. They can
          sign in with it straight away — tell them directly.
        </p>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full min-h-[48px] px-4 py-3 pr-16 rounded-xl border border-gray-200 hover:border-gray-300 text-base bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-teal-700"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button fullWidth onClick={submit} loading={saving}>
            Reset Password
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Admin master control: create logins, set per-page View/Modify rights, open
 * old-date edit windows, and see who changed what.
 * The UI mirrors the RLS rules from migration 027 — the database is what
 * actually enforces them.
 */
export default function UserManagementSection({ actorEmail }: { actorEmail: string }) {
  const { showToast } = useToast();
  const { users, permissions, windows, audit, loading, error, fetchAll, savePermissions, addWindow, revokeWindow } =
    useUserAdmin(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState<AppUser | null>(null);
  const [resetFor, setResetFor] = useState<AppUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const pageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of permissions) {
      if (p.can_view) counts.set(p.user_id, (counts.get(p.user_id) || 0) + 1);
    }
    return counts;
  }, [permissions]);

  const openWindowCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of windows) {
      if (isWindowOpen(w)) counts.set(w.user_id, (counts.get(w.user_id) || 0) + 1);
    }
    return counts;
  }, [windows]);

  const patchUser = async (user: AppUser, body: Record<string, unknown>, successMessage: string) => {
    setBusyId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the user');
      showToast(successMessage, 'success');
      await fetchAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update the user', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (user: AppUser) => {
    if (!window.confirm(`Delete ${user.email}? Their login stops working immediately. This cannot be undone.`)) {
      return;
    }
    setBusyId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete the user');
      showToast(`${user.email} deleted`, 'success');
      await fetchAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete the user', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-indigo-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">Users &amp; Permissions</h3>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add User
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 px-3 py-2.5 mb-3">
          <p className="text-xs font-bold text-rose-600">{error}</p>
          <p className="text-[10px] text-rose-500 font-medium mt-1">
            If this mentions a missing table, run migration 027 in the Supabase SQL editor first.
          </p>
        </div>
      )}

      {loading && users.length === 0 ? (
        <p className="text-xs text-gray-400 font-medium py-4 text-center">Loading users…</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => {
            const isBusy = busyId === user.id;
            const openWindows = openWindowCounts.get(user.id) || 0;
            return (
              <div
                key={user.id}
                className={`rounded-xl border border-gray-100 bg-gray-50 p-3 ${isBusy ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-700 truncate">
                      {user.full_name || user.email.split('@')[0]}
                    </p>
                    <p className="text-[11px] text-gray-400 font-medium truncate">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1 flex-shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        user.role === 'admin' ? 'bg-teal-50 text-teal-700' : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {user.role === 'admin' ? 'Admin' : 'Staff'}
                    </span>
                    {!user.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600">
                        Disabled
                      </span>
                    )}
                    {openWindows > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                        {openWindows} open window{openWindows === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 font-medium mt-1.5">
                  {user.role === 'admin'
                    ? 'every page · any date'
                    : `${pageCounts.get(user.id) || 0} page${(pageCounts.get(user.id) || 0) === 1 ? '' : 's'} · today + yesterday`}
                  {user.last_login_at ? ` · last in ${relative(user.last_login_at)}` : ' · never signed in'}
                </p>

                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <button
                    onClick={() => setPermissionsFor(user)}
                    disabled={isBusy}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-indigo-700 border border-indigo-100 hover:opacity-80 active:scale-95 transition-all"
                  >
                    Permissions
                  </button>
                  <button
                    onClick={() => setResetFor(user)}
                    disabled={isBusy}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-teal-700 border border-teal-100 hover:opacity-80 active:scale-95 transition-all"
                  >
                    Reset Password
                  </button>
                  <button
                    onClick={() =>
                      patchUser(
                        user,
                        { role: user.role === 'admin' ? 'staff' : 'admin' },
                        `${user.email} is now ${user.role === 'admin' ? 'staff' : 'admin'}`
                      )
                    }
                    disabled={isBusy}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-gray-600 border border-gray-200 hover:opacity-80 active:scale-95 transition-all"
                  >
                    Make {user.role === 'admin' ? 'Staff' : 'Admin'}
                  </button>
                  <button
                    onClick={() =>
                      patchUser(
                        user,
                        { isActive: !user.is_active },
                        `${user.email} ${user.is_active ? 'disabled' : 'enabled'}`
                      )
                    }
                    disabled={isBusy}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-amber-700 border border-amber-100 hover:opacity-80 active:scale-95 transition-all"
                  >
                    {user.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => deleteUser(user)}
                    disabled={isBusy}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-rose-600 border border-rose-100 hover:opacity-80 active:scale-95 transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setAuditOpen(true)}
        className="w-full mt-3 py-2.5 rounded-xl text-xs font-bold bg-gray-50 text-gray-500 hover:opacity-80 active:scale-[0.99] transition-all"
      >
        Permission history ({audit.length})
      </button>

      <p className="text-[10px] text-gray-400 mt-2 leading-4">
        Everyone except admins can edit today and yesterday only. Open a date window from Permissions to
        let someone correct older days.
      </p>

      <CreateUserModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={fetchAll} />

      <UserPermissionsModal
        isOpen={!!permissionsFor}
        onClose={() => setPermissionsFor(null)}
        user={permissionsFor}
        permissions={permissions}
        windows={windows}
        actorEmail={actorEmail}
        onSavePermissions={savePermissions}
        onAddWindow={addWindow}
        onRevokeWindow={revokeWindow}
      />

      <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} onDone={fetchAll} />

      <Modal isOpen={auditOpen} onClose={() => setAuditOpen(false)} title="Permission History">
        <div className="space-y-2">
          {audit.length === 0 ? (
            <p className="text-xs text-gray-400 font-medium py-6 text-center">Nothing recorded yet.</p>
          ) : (
            audit.map((entry) => {
              const pages = (entry.detail?.view as string[] | undefined)?.map(pageLabel).join(', ');
              return (
                <div key={entry.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-xs font-bold text-gray-700">
                    {entry.actor_email || 'someone'}{' '}
                    <span className="font-medium text-gray-500">
                      {AUDIT_LABELS[entry.action] || entry.action}
                    </span>{' '}
                    {entry.target_email || ''}
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                    {format(parseISO(entry.created_at), 'd MMM yyyy, h:mm a')}
                    {pages ? ` · ${pages}` : ''}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
}

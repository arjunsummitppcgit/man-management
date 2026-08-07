'use client';

import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { APP_PAGES } from '@/lib/auth/pages';

type PermState = Record<string, { view: boolean; modify: boolean }>;

/** New staff start with the pages the old staff role had, so the common case is one click. */
const DEFAULT_STAFF_PAGES = ['dashboard', 'daily-entry', 'supervisors', 'maintenance-tasks'];

function blankPermissions(): PermState {
  return Object.fromEntries(
    APP_PAGES.map((p) => [
      p.key,
      { view: DEFAULT_STAFF_PAGES.includes(p.key), modify: DEFAULT_STAFF_PAGES.includes(p.key) },
    ])
  );
}

export default function CreateUserModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [perms, setPerms] = useState<PermState>(blankPermissions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmail('');
    setFullName('');
    setPassword('');
    setShowPassword(false);
    setRole('staff');
    setPerms(blankPermissions());
  }, [isOpen]);

  const toggle = (key: string, field: 'view' | 'modify') =>
    setPerms((prev) => {
      const next = { ...prev[key], [field]: !prev[key][field] };
      // Modify without view is unreachable in the UI — keep the pair coherent.
      if (field === 'modify' && next.modify) next.view = true;
      if (field === 'view' && !next.view) next.modify = false;
      return { ...prev, [key]: next };
    });

  const handleCreate = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role,
          permissions: APP_PAGES.map((p) => ({
            page_key: p.key,
            can_view: perms[p.key].view,
            can_modify: perms[p.key].modify,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create the user');

      showToast(`${email} can now sign in`, 'success');
      onCreated();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not create the user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 text-base bg-white transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add User">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email<span className="text-rose-500 ml-0.5">*</span>
          </label>
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@ppc.com"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Shown in the user list"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Password<span className="text-rose-500 ml-0.5">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={`${inputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-teal-700"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-400 font-medium">
            Give this to the user directly — the account works straight away, no email needed.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
          <div className="grid grid-cols-2 gap-2.5">
            {(['staff', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`min-h-[48px] rounded-xl border text-sm font-bold transition-all ${
                  role === r
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {r === 'staff' ? 'Staff' : 'Admin'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400 font-medium">
            {role === 'admin'
              ? 'Full access to every page and every date, including user management.'
              : 'Access only to the pages ticked below, and only today + yesterday unless you open a date window.'}
          </p>
        </div>

        {role === 'staff' && (
          <div className="border-t border-gray-100 pt-4">
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
                  <span className="text-sm font-semibold text-gray-700 truncate">{page.label}</span>
                  <div className="flex gap-4 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={perms[page.key].view}
                      onChange={() => toggle(page.key, 'view')}
                      className="w-10 h-5 accent-teal-600 cursor-pointer"
                      aria-label={`${page.label} view`}
                    />
                    <input
                      type="checkbox"
                      checked={perms[page.key].modify}
                      onChange={() => toggle(page.key, 'modify')}
                      className="w-10 h-5 accent-teal-600 cursor-pointer"
                      aria-label={`${page.label} modify`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-4 px-5 pt-3 pb-4 bg-white border-t border-gray-100 flex items-center gap-2.5">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleCreate} loading={saving}>
            Create User
          </Button>
        </div>
      </div>
    </Modal>
  );
}

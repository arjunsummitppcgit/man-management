'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { pageLabel } from '@/lib/auth/pages';
import { todayIST } from '@/lib/auth/permissions';
import { isPermissionError } from '@/lib/auth/permissionError';

/**
 * One popup, used by every write in the app, that says plainly why a save was
 * refused.
 *
 * It exists because a blocked save used to look like a working one: RLS lets an
 * UPDATE or DELETE match zero rows without raising anything, so a view-only user
 * typed a figure, saw no complaint, and found the day empty the next morning —
 * then typed it again. A toast was not enough; this stops the flow and names the
 * reason.
 *
 * Call the require* helpers BEFORE the round-trip. They mirror the rules in
 * migration 027, so a refusal is explained in one step instead of a failed
 * request that may not even report an error.
 */

/** The wording promised to the client — keep it, staff have been told to expect it. */
const DENIED_MESSAGE =
  "You don't have permission to modify this data. Please get approval from your admin.";

const PERMISSIONS_PATH = 'Reports & Settings → Users & Permissions';

interface AlertContent {
  title: string;
  message: string;
  hint?: string;
}

interface PermissionAlertApi {
  /** Undated writes: does this user hold Modify on the page? Popup + false if not. */
  requireModify: (pageKey: string) => boolean;
  /**
   * Dated writes: may this user write this work_date? Popup + false if not.
   * Pass several page keys when either right unlocks the row (supervisor
   * assignments are written from both Daily Entry and Supervisors).
   * `allowTomorrow` is the PPC Plan's exception — see checkEdit().
   */
  requireEditDate: (
    pageKey: string | string[],
    date: string,
    opts?: { allowTomorrow?: boolean }
  ) => boolean;
  /** Admin-only settings (locations, batches, app settings). */
  requireAdmin: (what?: string) => boolean;
  /**
   * Last line of defence: turn a rejection from the database into the same
   * popup. Returns true when it handled the error, so the caller can skip its
   * own "failed to save" toast.
   */
  reportError: (error: unknown) => boolean;
  /** Raise the popup directly. */
  showPermissionAlert: (content?: Partial<AlertContent>) => void;
}

const PermissionAlertContext = createContext<PermissionAlertApi | null>(null);

export function PermissionAlertProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin, appUser, canModify, checkEditDate } = useAuth();
  const [alert, setAlert] = useState<AlertContent | null>(null);

  const showPermissionAlert = useCallback((content?: Partial<AlertContent>) => {
    setAlert({
      title: content?.title ?? 'Permission needed',
      message: content?.message ?? DENIED_MESSAGE,
      hint: content?.hint,
    });
  }, []);

  const requireModify = useCallback(
    (pageKey: string) => {
      if (canModify(pageKey)) return true;
      showPermissionAlert({
        hint: `Your account has View-only access to ${pageLabel(pageKey)}. An admin can give you Modify rights under ${PERMISSIONS_PATH}.`,
      });
      return false;
    },
    [canModify, showPermissionAlert]
  );

  const requireEditDate = useCallback(
    (pageKey: string | string[], date: string, opts?: { allowTomorrow?: boolean }) => {
      const keys = Array.isArray(pageKey) ? pageKey : [pageKey];
      if (keys.some((key) => checkEditDate(key, date, opts).allowed)) return true;

      // No Modify right at all is a different problem from Modify on a date that
      // has closed — say which one it is.
      const modifiable = keys.find((key) => canModify(key));
      if (!modifiable) return requireModify(keys[0]);

      showPermissionAlert({
        title: 'This date is locked',
        message: checkEditDate(modifiable, date, opts).reason ?? DENIED_MESSAGE,
        // No window can unlock a future date, so don't send them to an admin for one.
        hint:
          date > todayIST()
            ? undefined
            : `An admin can open a date window for ${pageLabel(modifiable)} under ${PERMISSIONS_PATH}.`,
      });
      return false;
    },
    [canModify, checkEditDate, requireModify, showPermissionAlert]
  );

  const requireAdmin = useCallback(
    (what?: string) => {
      if (isAdmin) return true;
      showPermissionAlert({
        hint: what
          ? `${what} can only be changed by an admin.`
          : 'This can only be changed by an admin.',
      });
      return false;
    },
    [isAdmin, showPermissionAlert]
  );

  const reportError = useCallback(
    (error: unknown) => {
      if (!isPermissionError(error)) return false;
      showPermissionAlert({
        hint: 'The database refused this change because of your current access rights. If you think that is wrong, ask your admin to check your permissions.',
      });
      return true;
    },
    [showPermissionAlert]
  );

  const api = useMemo(
    () => ({ requireModify, requireEditDate, requireAdmin, reportError, showPermissionAlert }),
    [requireModify, requireEditDate, requireAdmin, reportError, showPermissionAlert]
  );

  return (
    <PermissionAlertContext.Provider value={api}>
      {children}
      {/* Mounted only while raised, so each popup starts its fade from scratch. */}
      {alert && (
        <PermissionDialog
          alert={alert}
          email={appUser?.email ?? null}
          onClose={() => setAlert(null)}
        />
      )}
    </PermissionAlertContext.Provider>
  );
}

export function usePermissionAlert(): PermissionAlertApi {
  const ctx = useContext(PermissionAlertContext);
  if (!ctx) throw new Error('usePermissionAlert must be used inside <PermissionAlertProvider>');
  return ctx;
}

function PermissionDialog({
  alert,
  email,
  onClose,
}: {
  alert: AlertContent;
  email: string | null;
  onClose: () => void;
}) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsAnimating(true));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-5">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="permission-alert-title"
        className={`relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center transition-all duration-200 ${
          isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            className="w-7 h-7 text-amber-600"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>

        <h2
          id="permission-alert-title"
          className="mt-4 text-lg font-bold text-gray-900 font-display"
        >
          {alert.title}
        </h2>

        <p className="mt-2 text-sm font-semibold text-gray-700 leading-6">{alert.message}</p>

        {alert.hint && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] font-medium text-amber-700 leading-5">
            {alert.hint}
          </p>
        )}

        {email && (
          <p className="mt-3 text-[11px] font-medium text-gray-400">Signed in as {email}</p>
        )}

        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 active:scale-95 transition-all"
        >
          OK
        </button>
      </div>
    </div>
  );
}

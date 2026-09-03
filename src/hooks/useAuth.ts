'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import {
  checkEdit,
  isWindowOpen,
  type AppUser,
  type EditCheck,
  type EditWindow,
  type PagePermission,
} from '@/lib/auth/permissions';

interface PermissionFlags {
  view: boolean;
  modify: boolean;
}

interface AuthState {
  user: User | null;
  /** The app_users row, or null if this login has no profile yet. */
  appUser: AppUser | null;
  isAdmin: boolean;
  /** Any signed-in non-admin. Name kept for the call sites that predate roles. */
  isSubUser: boolean;
  /** Signed in but with no app_users row — no rights until an admin sets it up. */
  isUnprovisioned: boolean;
  permissions: Record<string, PermissionFlags>;
  windows: EditWindow[];
  canView: (pageKey: string) => boolean;
  canModify: (pageKey: string) => boolean;
  /** Can this user write this work_date on this page, and if not, why not. */
  checkEditDate: (pageKey: string, date: string) => EditCheck;
  loading: boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the session and rights ONCE for the whole app.
 *
 * Two rules in here exist to stop the page reloading itself under the user's
 * hands, and both matter — see the notes at each site:
 *   1. an auth event that does not change WHO is signed in must not produce new
 *      state, and
 *   2. `loading` never goes back to true once a user has been resolved.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useAuthState();
  return createElement(AuthContext.Provider, { value }, children);
}

function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, PermissionFlags>>({});
  const [windows, setWindows] = useState<EditWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser((prev) => (prev?.id === data.user?.id ? prev : data.user ?? null));
      if (!data.user) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      // supabase-js re-emits SIGNED_IN every time the tab regains visibility
      // (GoTrueClient#_recoverAndRefresh, wired to visibilitychange) and again
      // over its BroadcastChannel when another tab moves. The session is
      // re-read from the session cookie, so `next` is a fresh object with identical
      // contents. Storing it would change the identity of `user`, re-run the
      // rights effect below, and blank the page mid-typing. Only a genuine
      // change of account is worth new state.
      setUser((prev) => (prev?.id === next?.id ? prev : next));
    });

    return () => subscription.unsubscribe();
  }, []);

  // Profile + rights. RLS lets a user read their own rows and nothing else.
  // Keyed on the id, not the object, for the reason above.
  const userId = user?.id ?? null;
  // Which user we already hold rights for — lets a re-check run in the
  // background instead of throwing the app back to a spinner.
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      loadedFor.current = null;
      setAppUser(null);
      setPermissions({});
      setWindows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    if (loadedFor.current !== userId) setLoading(true);

    void (async () => {
      const [profileRes, permsRes, windowsRes] = await Promise.all([
        supabase.from('app_users').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_page_permissions').select('*').eq('user_id', userId),
        supabase.from('user_edit_windows').select('*').eq('user_id', userId).is('revoked_at', null),
      ]);
      if (cancelled) return;

      // A missing table (migration 027 not run yet) must not lock everyone out
      // silently — log it loudly, leave the user unprovisioned.
      if (profileRes.error) console.error('Error loading app_users profile:', profileRes.error);
      if (permsRes.error) console.error('Error loading page permissions:', permsRes.error);
      if (windowsRes.error) console.error('Error loading edit windows:', windowsRes.error);

      setAppUser((profileRes.data as AppUser | null) ?? null);
      setPermissions(
        Object.fromEntries(
          ((permsRes.data as PagePermission[] | null) || []).map((p) => [
            p.page_key,
            { view: p.can_view, modify: p.can_modify },
          ])
        )
      );
      setWindows(((windowsRes.data as EditWindow[] | null) || []).filter((w) => isWindowOpen(w)));
      loadedFor.current = userId;
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  // Login history — fire and forget, never blocks the session
  useEffect(() => {
    if (!userId) return;
    void supabase.rpc('touch_last_login').then(({ error }) => {
      if (error) console.error('Could not record last login:', error);
    });
  }, [userId]);

  const isAdmin = !loading && !!user && appUser?.role === 'admin' && appUser.is_active;
  const isActive = !!appUser?.is_active;

  const canView = useCallback(
    (pageKey: string) => (isAdmin ? true : isActive && !!permissions[pageKey]?.view),
    [isAdmin, isActive, permissions]
  );

  const canModify = useCallback(
    (pageKey: string) => (isAdmin ? true : isActive && !!permissions[pageKey]?.modify),
    [isAdmin, isActive, permissions]
  );

  const checkEditDate = useCallback(
    (pageKey: string, date: string) =>
      checkEdit({ isAdmin, canModify: canModify(pageKey), pageKey, date, windows }),
    [isAdmin, canModify, windows]
  );

  return useMemo(
    () => ({
      user,
      appUser,
      isAdmin,
      isSubUser: !loading && !!user && !isAdmin,
      isUnprovisioned: !loading && !!user && !appUser,
      permissions,
      windows,
      canView,
      canModify,
      checkEditDate,
      loading,
      refresh,
    }),
    [user, appUser, isAdmin, permissions, windows, canView, canModify, checkEditDate, loading, refresh]
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

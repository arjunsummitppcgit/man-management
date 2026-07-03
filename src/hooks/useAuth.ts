'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

// ─── Sub-user email list ──────────────────────────────────────────────────────
// These 4 accounts are restricted to today's date only.
// Admin is anyone NOT in this list.
const SUB_USER_EMAILS = [
  'sudheer@ppc.com',
  'ramakrishna@ppc.com',
  'sairam@ppc.com',
  'manisha@ppc.com',
];

export function isSubUserEmail(email: string | undefined): boolean {
  if (!email) return false;
  return SUB_USER_EMAILS.includes(email.toLowerCase().trim());
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  isAdmin: boolean;
  isSubUser: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get the current session on mount
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isSub = isSubUserEmail(user?.email);

  return {
    user,
    isAdmin: !loading && !!user && !isSub,
    isSubUser: !loading && !!user && isSub,
    loading,
  };
}

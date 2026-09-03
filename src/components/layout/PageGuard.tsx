'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { APP_PAGES, pageForPath } from '@/lib/auth/pages';
import { supabase } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

/**
 * View-permission gate for whichever page is showing.
 * This is the courtesy layer — it stops a user landing on a page that would be
 * empty or error out. The real barrier is RLS (migration 027): even with this
 * bypassed, the data cannot be read or written.
 */
export default function PageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isUnprovisioned, appUser, canView } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  // Not signed in: the proxy is already redirecting to /login — don't flash a
  // permission error on the way out.
  if (!user) return <>{children}</>;

  const signOut = async () => {
    // 'local' signs this browser out and nothing else. supabase-js defaults to
    // 'global', which revokes every refresh token on the account — signing out
    // on the desktop would silently log the same user's phone out too.
    await supabase.auth.signOut({ scope: 'local' });
    router.push('/login');
  };

  if (isUnprovisioned) {
    return (
      <Blocked
        title="Account not set up"
        message="This login has no profile yet. An admin needs to add it under Reports & Settings → Users & Permissions before you can use the app."
        actionLabel="Sign out"
        onAction={signOut}
      />
    );
  }

  if (appUser && !appUser.is_active) {
    return (
      <Blocked
        title="Account disabled"
        message="This account has been disabled by an admin. Contact them if you think that's a mistake."
        actionLabel="Sign out"
        onAction={signOut}
      />
    );
  }

  const page = pageForPath(pathname);
  if (page && !canView(page.key)) {
    const fallback = APP_PAGES.find((p) => canView(p.key));
    return (
      <Blocked
        title="No access to this page"
        message={`You don't have View access to ${page.label}. Ask an admin to grant it under Reports & Settings → Users & Permissions.`}
        actionLabel={fallback ? `Go to ${fallback.label}` : 'Sign out'}
        onAction={fallback ? () => router.push(fallback.path) : signOut}
      />
    );
  }

  return <>{children}</>;
}

function Blocked({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-amber-600">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-gray-900 font-display">{title}</h2>
      <p className="text-sm text-gray-500 font-medium mt-2 max-w-sm leading-6">{message}</p>
      <button
        onClick={onAction}
        className="mt-5 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 active:scale-95 transition-all"
      >
        {actionLabel}
      </button>
    </div>
  );
}

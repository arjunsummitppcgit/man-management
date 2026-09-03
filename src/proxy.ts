import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/supabase/cookieOptions';

// Next 16 renamed the middleware convention to proxy; behaviour is unchanged.
// This handles authentication only — page-level permissions are checked by
// PageGuard, and enforced for real by RLS (migration 027).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Whatever Supabase asks us to write during this request. It is collected
  // rather than written straight onto a response, because at this point we do
  // not yet know WHICH response the browser will get — see finish() below.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  // Headers @supabase/ssr hands us alongside a cookie write; they stop a
  // response that carries fresh tokens from being cached or replayed.
  let noStoreHeaders: Record<string, string> | null = null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Update the request too, so a Server Component rendered further
            // down this same request reads the new token rather than the old.
            request.cookies.set(name, value);
            pendingCookies.push({ name, value, options });
          });
          noStoreHeaders = headers ?? null;
        },
      },
    }
  );

  // Refreshes an expired session and, when it does, rotates the refresh token:
  // the one in the browser's cookie is spent the moment this returns.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * Attach the rotated session to the response we are actually returning.
   *
   * This is the whole point of the rewrite. A refresh hands back a NEW refresh
   * token and invalidates the old one server-side; if that new token never
   * reaches the browser, the browser keeps replaying a spent token and Supabase
   * rejects it — which the auth client treats as a sign-out. Returning a
   * `NextResponse.redirect(...)` built after the refresh silently dropped those
   * cookies, so every redirecting request burned the session.
   *
   * It bites hardest on iOS: the phone is opened once a day, so the access
   * token has always expired and every cold start refreshes.
   */
  const finish = (response: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    if (noStoreHeaders) {
      Object.entries(noStoreHeaders).forEach(([key, val]) => response.headers.set(key, val));
    }
    return response;
  };

  // Unauthenticated API calls get a JSON 401, not a redirect-to-login HTML page
  if (!user && pathname.startsWith('/api/')) {
    return finish(NextResponse.json({ error: 'Not signed in.' }, { status: 401 }));
  }

  // Unauthenticated user trying to access a protected route → redirect to /login
  if (!user && pathname !== '/login') {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return finish(NextResponse.redirect(loginUrl));
  }

  // Authenticated user on /login → redirect to dashboard. A Home Screen
  // shortcut or bookmark saved from the login page lands here on every launch,
  // which is exactly the request that refreshes the session.
  if (user && pathname === '/login') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    return finish(NextResponse.redirect(homeUrl));
  }

  // Built here, not earlier, so it carries the cookie header setAll() updated.
  return finish(NextResponse.next({ request: { headers: request.headers } }));
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

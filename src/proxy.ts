import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next 16 renamed the middleware convention to proxy; behaviour is unchanged.
// This handles authentication only — page-level permissions are checked by
// PageGuard, and enforced for real by RLS (migration 027).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create a response that we can modify (to set refreshed cookies)
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  // Create Supabase client using request/response cookies
  // (can't use cookies() from next/headers in middleware)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies to the request (for downstream server components)
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // Re-create the response so it carries the updated request cookies
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });
          // Write cookies to the response (so they reach the browser)
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // This will refresh an expired session automatically and set new cookies
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated API calls get a JSON 401, not a redirect-to-login HTML page
  if (!user && pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  // Unauthenticated user trying to access a protected route → redirect to /login
  if (!user && pathname !== '/login') {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on /login → redirect to dashboard
  if (user && pathname === '/login') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
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

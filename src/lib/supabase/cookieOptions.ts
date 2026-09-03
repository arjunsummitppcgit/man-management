import type { CookieOptions } from '@supabase/ssr';

/**
 * One cookie definition, shared by the browser client, the server client and
 * the proxy.
 *
 * These three write the SAME cookie names. If they disagree on the attributes,
 * the browser ends up holding two entries under one name (or silently refuses
 * an overwrite), and the session appears to come and go. So there is exactly
 * one copy of these values and everything imports it.
 *
 * Note on lifetime: @supabase/ssr pins `maxAge` to its own 400-day constant on
 * every write and ignores anything passed here, which is what we want — a
 * cookie written without `Max-Age` would be a *session* cookie, and iOS Safari
 * throws those away when the app is closed.
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  // The session has to survive the redirect Safari performs when a Home Screen
  // shortcut opens, and any link into the app from another site. 'lax' sends
  // the cookie on top-level GET navigations, which covers both; 'strict' would
  // not, and 'none' would need cross-site tracking permission on iOS.
  sameSite: 'lax',
  // Vercel serves the app over HTTPS. Left off in development so the cookie
  // still works on plain http://localhost.
  secure: process.env.NODE_ENV === 'production',
  // No `domain`: a host-only cookie. Setting a domain would leak the session to
  // every subdomain, and gains nothing — the app is served from one host.
};

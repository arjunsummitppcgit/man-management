import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/supabase/cookieOptions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Session lives in cookies, not localStorage/sessionStorage, so the proxy and
// Server Components see the same session the browser does. `persistSession` and
// `autoRefreshToken` are on by default in a browser; they are named here because
// this is the thing that has to keep working after Safari is closed.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookieOptions: SUPABASE_COOKIE_OPTIONS,
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});


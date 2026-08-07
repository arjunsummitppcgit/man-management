// ─── Service-role Supabase client (server only) ──────────────────────────────
// Bypasses RLS and can create/update auth users. NEVER import this from a
// client component — the key must not reach the browser. Everything that uses
// it goes through requireAdmin() first.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new AdminAuthError(
      'User management is not configured — add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the server.',
      503
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AdminContext {
  admin: SupabaseClient;
  actorId: string;
  actorEmail: string;
}

/**
 * Verify the caller is a signed-in, active admin *according to the database* —
 * never according to anything the request itself claims.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AdminAuthError('Not signed in.', 401);

  const { data: profile, error } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw new AdminAuthError(`Could not verify your role: ${error.message}`, 500);
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    throw new AdminAuthError('Admins only.', 403);
  }

  return { admin: createAdminClient(), actorId: user.id, actorEmail: user.email ?? '' };
}

/** Best-effort audit row; a logging failure must not fail the action itself. */
export async function logPermissionChange(
  ctx: AdminContext,
  entry: {
    action: string;
    target_email?: string | null;
    target_user_id?: string | null;
    detail?: Record<string, unknown>;
  }
) {
  const { error } = await ctx.admin.from('permission_audit_log').insert({
    actor_email: ctx.actorEmail,
    action: entry.action,
    target_email: entry.target_email ?? null,
    target_user_id: entry.target_user_id ?? null,
    detail: entry.detail ?? null,
  });
  if (error) console.error('Could not write permission_audit_log:', error);
}

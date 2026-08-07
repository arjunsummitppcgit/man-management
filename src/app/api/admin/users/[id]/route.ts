// ─── PATCH / DELETE /api/admin/users/[id] ────────────────────────────────────
// Reset a password, rename, change role, disable, or delete a login.
// The guards here exist so an admin cannot lock the organisation out of its own
// app: you cannot demote or disable yourself, and the last active admin cannot
// be removed by anyone.

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, logPermissionChange, requireAdmin, type AdminContext } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const MIN_PASSWORD = 8;

interface PatchBody {
  password?: string;
  fullName?: string | null;
  role?: 'admin' | 'staff';
  isActive?: boolean;
}

async function otherActiveAdminExists(ctx: AdminContext, excludeId: string): Promise<boolean> {
  const { count, error } = await ctx.admin
    .from('app_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', excludeId);
  if (error) throw new AdminAuthError(`Could not check admin count: ${error.message}`, 500);
  return (count ?? 0) > 0;
}

export async function PATCH(request: NextRequest, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;

  let ctx: AdminContext;
  try {
    ctx = await requireAdmin();
  } catch (error) {
    const e = error as AdminAuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { data: target, error: targetError } = await ctx.admin
    .from('app_users')
    .select('id, email, role, is_active')
    .eq('id', id)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: 'That user no longer exists.' }, { status: 404 });

  const isSelf = id === ctx.actorId;
  const changes: Record<string, unknown> = {};

  // ── Password reset ──────────────────────────────────────────────────────────
  if (body.password !== undefined) {
    if (body.password.length < MIN_PASSWORD) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD} characters.` },
        { status: 400 }
      );
    }
    const { error } = await ctx.admin.auth.admin.updateUserById(id, { password: body.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    changes.password = 'reset';
  }

  // ── Profile fields ──────────────────────────────────────────────────────────
  const profileUpdate: Record<string, unknown> = {};

  if (body.fullName !== undefined) {
    profileUpdate.full_name = body.fullName?.trim() || null;
    changes.full_name = profileUpdate.full_name;
  }

  if (body.role !== undefined && body.role !== target.role) {
    if (isSelf) {
      return NextResponse.json(
        { error: 'You cannot change your own role — ask another admin.' },
        { status: 400 }
      );
    }
    if (target.role === 'admin' && !(await otherActiveAdminExists(ctx, id))) {
      return NextResponse.json({ error: 'This is the last active admin.' }, { status: 400 });
    }
    profileUpdate.role = body.role;
    changes.role = body.role;
  }

  if (body.isActive !== undefined && body.isActive !== target.is_active) {
    if (isSelf && !body.isActive) {
      return NextResponse.json({ error: 'You cannot disable your own account.' }, { status: 400 });
    }
    if (!body.isActive && target.role === 'admin' && !(await otherActiveAdminExists(ctx, id))) {
      return NextResponse.json({ error: 'This is the last active admin.' }, { status: 400 });
    }
    profileUpdate.is_active = body.isActive;
    changes.is_active = body.isActive;
  }

  if (Object.keys(profileUpdate).length) {
    const { error } = await ctx.admin.from('app_users').update(profileUpdate).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A disabled login should not keep a live session running until its token
  // happens to expire.
  if (body.isActive === false) {
    const { error } = await ctx.admin.auth.admin.signOut(id, 'global');
    if (error) console.error('Could not revoke sessions for disabled user:', error);
  }

  if (!Object.keys(changes).length) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await logPermissionChange(ctx, {
    action: 'user.update',
    target_email: target.email,
    target_user_id: id,
    detail: changes,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;

  let ctx: AdminContext;
  try {
    ctx = await requireAdmin();
  } catch (error) {
    const e = error as AdminAuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }

  if (id === ctx.actorId) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  const { data: target } = await ctx.admin
    .from('app_users')
    .select('id, email, role')
    .eq('id', id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'That user no longer exists.' }, { status: 404 });

  if (target.role === 'admin' && !(await otherActiveAdminExists(ctx, id))) {
    return NextResponse.json({ error: 'This is the last active admin.' }, { status: 400 });
  }

  // Deleting the auth user cascades to app_users, its permissions and windows.
  // The audit rows stay — they record who did what, and survive the account.
  const { error } = await ctx.admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logPermissionChange(ctx, {
    action: 'user.delete',
    target_email: target.email,
    target_user_id: id,
    detail: { role: target.role },
  });

  return NextResponse.json({ ok: true });
}

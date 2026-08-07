// ─── POST /api/admin/users ───────────────────────────────────────────────────
// Admin creates a login. The account is usable immediately (no invite email):
// the password is set here, the app_users profile carries the role, and the
// starting page permissions are written in the same request.

import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, logPermissionChange, requireAdmin } from '@/lib/supabase/admin';
import { PAGE_KEYS } from '@/lib/auth/pages';

export const runtime = 'nodejs';

const MIN_PASSWORD = 8;

interface CreateUserBody {
  email?: string;
  password?: string;
  fullName?: string;
  role?: 'admin' | 'staff';
  permissions?: { page_key: string; can_view: boolean; can_modify: boolean }[];
}

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireAdmin();
  } catch (error) {
    const e = error as AdminAuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }

  let body: CreateUserBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const fullName = (body.fullName || '').trim() || null;
  const role = body.role === 'admin' ? 'admin' : 'staff';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  const permissions = (body.permissions || []).filter((p) => PAGE_KEYS.includes(p.page_key));

  // 1. The auth account. email_confirm skips the verification mail — these are
  //    internal logins handed out in person, not self-service signups.
  const { data: created, error: createError } = await ctx.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createError || !created?.user) {
    const message = createError?.message || 'Could not create the account.';
    const alreadyExists = /already|registered|exists/i.test(message);
    return NextResponse.json(
      { error: alreadyExists ? 'That email already has a login.' : message },
      { status: alreadyExists ? 409 : 500 }
    );
  }

  const userId = created.user.id;

  // 2. Profile. If this fails the auth account would be an orphan that can log
  //    in with no rights, so roll it back rather than leave the two out of sync.
  const { error: profileError } = await ctx.admin.from('app_users').insert({
    id: userId,
    email,
    full_name: fullName,
    role,
    is_active: true,
    created_by: ctx.actorEmail,
  });

  if (profileError) {
    await ctx.admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: `Could not save the user profile: ${profileError.message}` },
      { status: 500 }
    );
  }

  // 3. Page permissions (admins get everything implicitly, so only staff rows)
  if (role === 'staff' && permissions.length) {
    const { error: permError } = await ctx.admin.from('user_page_permissions').insert(
      permissions.map((p) => ({
        user_id: userId,
        page_key: p.page_key,
        can_view: !!p.can_view,
        // Modify without view would be unreachable in the UI; keep the row honest.
        can_modify: !!p.can_modify && !!p.can_view,
        updated_by: ctx.actorEmail,
      }))
    );
    if (permError) {
      return NextResponse.json(
        { error: `User created, but permissions failed to save: ${permError.message}` },
        { status: 500 }
      );
    }
  }

  await logPermissionChange(ctx, {
    action: 'user.create',
    target_email: email,
    target_user_id: userId,
    detail: { role, pages: permissions.filter((p) => p.can_view).map((p) => p.page_key) },
  });

  return NextResponse.json({ id: userId, email, role });
}

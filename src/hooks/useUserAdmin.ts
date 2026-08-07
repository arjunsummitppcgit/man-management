'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { AppUser, EditWindow, PagePermission } from '@/lib/auth/permissions';

export interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

/** Everything the admin User Management card needs, in one place. */
export function useUserAdmin(enabled: boolean) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [permissions, setPermissions] = useState<PagePermission[]>([]);
  const [windows, setWindows] = useState<EditWindow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [usersRes, permsRes, windowsRes, auditRes] = await Promise.all([
        supabase.from('app_users').select('*').order('role').order('email'),
        supabase.from('user_page_permissions').select('*'),
        supabase.from('user_edit_windows').select('*').order('created_at', { ascending: false }),
        supabase
          .from('permission_audit_log')
          .select('id, actor_email, action, target_email, detail, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      // The most likely cause of an error here is migration 027 not having been
      // run yet — say so instead of showing an empty list as if all is well.
      const firstError = usersRes.error || permsRes.error || windowsRes.error || auditRes.error;
      if (firstError) throw new Error(firstError.message);

      setUsers((usersRes.data as AppUser[]) || []);
      setPermissions((permsRes.data as PagePermission[]) || []);
      setWindows((windowsRes.data as EditWindow[]) || []);
      setAudit((auditRes.data as AuditEntry[]) || []);
    } catch (e) {
      console.error('Error loading user administration data:', e);
      setError(e instanceof Error ? e.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /** Replace one user's whole permission set — simpler to reason about than diffing. */
  const savePermissions = useCallback(
    async (userId: string, rows: { page_key: string; can_view: boolean; can_modify: boolean }[], actorEmail: string) => {
      const keep = rows.filter((r) => r.can_view || r.can_modify);
      const { error: deleteError } = await supabase
        .from('user_page_permissions')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw new Error(deleteError.message);

      if (keep.length) {
        const { error: insertError } = await supabase.from('user_page_permissions').insert(
          keep.map((r) => ({
            user_id: userId,
            page_key: r.page_key,
            can_view: r.can_view,
            can_modify: r.can_modify && r.can_view,
            updated_by: actorEmail,
          }))
        );
        if (insertError) throw new Error(insertError.message);
      }

      await supabase.from('permission_audit_log').insert({
        actor_email: actorEmail,
        action: 'permissions.update',
        target_user_id: userId,
        target_email: users.find((u) => u.id === userId)?.email ?? null,
        detail: {
          view: keep.filter((r) => r.can_view).map((r) => r.page_key),
          modify: keep.filter((r) => r.can_modify).map((r) => r.page_key),
        },
      });

      await fetchAll();
    },
    [fetchAll, users]
  );

  const addWindow = useCallback(
    async (
      row: { user_id: string; page_key: string; from_date: string; to_date: string; active_until: string; reason: string | null },
      actorEmail: string
    ) => {
      const { error: insertError } = await supabase
        .from('user_edit_windows')
        .insert({ ...row, created_by: actorEmail });
      if (insertError) throw new Error(insertError.message);

      await supabase.from('permission_audit_log').insert({
        actor_email: actorEmail,
        action: 'window.grant',
        target_user_id: row.user_id,
        target_email: users.find((u) => u.id === row.user_id)?.email ?? null,
        detail: { ...row },
      });

      await fetchAll();
    },
    [fetchAll, users]
  );

  const revokeWindow = useCallback(
    async (windowId: string, actorEmail: string) => {
      const target = windows.find((w) => w.id === windowId);
      const { error: updateError } = await supabase
        .from('user_edit_windows')
        .update({ revoked_at: new Date().toISOString(), revoked_by: actorEmail })
        .eq('id', windowId);
      if (updateError) throw new Error(updateError.message);

      await supabase.from('permission_audit_log').insert({
        actor_email: actorEmail,
        action: 'window.revoke',
        target_user_id: target?.user_id ?? null,
        target_email: users.find((u) => u.id === target?.user_id)?.email ?? null,
        detail: target ? { page_key: target.page_key, from: target.from_date, to: target.to_date } : null,
      });

      await fetchAll();
    },
    [fetchAll, windows, users]
  );

  return { users, permissions, windows, audit, loading, error, fetchAll, savePermissions, addWindow, revokeWindow };
}

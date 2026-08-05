'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

// Fallback used until the row loads (and if the table is unreachable) — the
// rate the app shipped with.
export const DEFAULT_NL_LADIES_SALARY_BASIC = 350;

export const SETTING_NL_LADIES_SALARY_BASIC = 'nl_ladies_salary_basic';

/**
 * Admin-editable app constants, stored one per row in `app_settings`.
 * Writes are admin-only — enforced by RLS in migration 026 as well as by
 * hiding the editor from sub-users.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('app_settings').select('key, value');
      if (error) throw error;
      setSettings(Object.fromEntries((data || []).map((r) => [r.key, r.value])));
    } catch (error) {
      console.error('Error fetching app_settings:', error);
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_by: user?.email ?? null }, { onConflict: 'key' });

    if (error) throw error;
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const salaryBasic = Number(settings[SETTING_NL_LADIES_SALARY_BASIC]);

  return {
    settings,
    loading,
    fetchSettings,
    updateSetting,
    /** Company Ladies salary basic currently in force (for new entries). */
    nlLadiesSalaryBasic: Number.isFinite(salaryBasic) && salaryBasic > 0
      ? salaryBasic
      : DEFAULT_NL_LADIES_SALARY_BASIC,
  };
}

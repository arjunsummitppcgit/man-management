'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  applyYieldOverrides,
  yieldOverridesOf,
  YIELD_CHART,
  type YieldChartEntry,
} from '@/lib/yieldChart';
import {
  applyHlVaOverrides,
  hlVaOverridesOf,
  HLVA_YIELD_CHART,
  VA_VARIETIES,
  type HlVaYieldColumn,
  type HlVaYieldEntry,
} from '@/lib/hlVa';

export const SETTING_HON_HL_STANDARD = 'hon_hl_standard_yield';
export const SETTING_HL_VA_STANDARD = 'hl_va_standard_yield';

type HonHlOverrides = Record<string, number>;
type HlVaOverrides = Record<string, Partial<Record<HlVaYieldColumn, number>>>;

/**
 * A stored value is JSON typed by an admin's edits, not by a schema. Anything
 * that doesn't parse is treated as absent, which falls the chart back to the
 * shipped bands — a corrupt row must not take the register down with it.
 */
function parse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as T) : null;
  } catch {
    console.error('Could not parse a stored yield standard; using the shipped chart.');
    return null;
  }
}

/**
 * The standard yield charts as they currently stand: the bands shipped in code,
 * with any admin-edited percentages laid over the top (migration 032).
 *
 * Use these when stamping a *new* entry or previewing one being typed. A saved
 * row carries its own `std_yield` and must be read against that instead —
 * editing the chart is not allowed to rewrite what a past day was measured
 * against.
 */
export function useYieldStandards() {
  const [overrides, setOverrides] = useState<{ honHl: HonHlOverrides | null; hlVa: HlVaOverrides | null }>({
    honHl: null,
    hlVa: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchStandards = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [SETTING_HON_HL_STANDARD, SETTING_HL_VA_STANDARD]);

      if (error) throw error;
      const byKey = Object.fromEntries((data || []).map((r) => [r.key, r.value as string]));
      setOverrides({
        honHl: parse<HonHlOverrides>(byKey[SETTING_HON_HL_STANDARD]),
        hlVa: parse<HlVaOverrides>(byKey[SETTING_HL_VA_STANDARD]),
      });
    } catch (error) {
      // Unreachable settings must not stop anyone entering the day's figures —
      // the shipped chart is a working answer, just not the edited one.
      console.error('Error fetching yield standards:', error);
      setOverrides({ honHl: null, hlVa: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStandards();
  }, [fetchStandards]);

  const honHlChart = useMemo(() => applyYieldOverrides(overrides.honHl), [overrides.honHl]);
  const hlVaChart = useMemo(() => applyHlVaOverrides(overrides.hlVa), [overrides.hlVa]);

  /**
   * Store only the bands that differ from the shipped chart, so a band added to
   * the code later isn't shadowed by a stale copy of its own default.
   */
  const save = useCallback(async (key: string, value: object) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key, value: JSON.stringify(value), updated_by: user?.email ?? null },
        { onConflict: 'key' }
      );

    // PostgrestError is a plain object, not an Error — an RLS denial has to
    // reach the user as a reason, not as "[object Object]".
    if (error) {
      console.error('Saving the yield standard failed:', error);
      throw new Error([error.message, error.details, error.hint].filter(Boolean).join(' — '));
    }
  }, []);

  const saveHonHlChart = useCallback(
    async (chart: YieldChartEntry[]) => {
      const next = yieldOverridesOf(chart);
      await save(SETTING_HON_HL_STANDARD, next);
      setOverrides((prev) => ({ ...prev, honHl: next }));
    },
    [save]
  );

  const saveHlVaChart = useCallback(
    async (chart: HlVaYieldEntry[]) => {
      const next = hlVaOverridesOf(chart);
      await save(SETTING_HL_VA_STANDARD, next);
      setOverrides((prev) => ({ ...prev, hlVa: next }));
    },
    [save]
  );

  return {
    honHlChart,
    hlVaChart,
    loading,
    fetchStandards,
    saveHonHlChart,
    saveHlVaChart,
    /**
     * True once an admin has moved anything off the shipped values.
     *
     * Counted against the chart as rendered, not against the stored keys. An
     * override for a band that no longer exists is already ignored by
     * applyYieldOverrides — migration 033 renamed every band, so the edits made
     * under the old one are inert. The badge has to agree with what is on
     * screen, or it claims a customisation the reader cannot find.
     */
    honHlEdited: honHlChart.some((e, i) => e.standardYield !== YIELD_CHART[i].standardYield),
    hlVaEdited: hlVaChart.some((e, i) =>
      VA_VARIETIES.some((v) => e[v] !== HLVA_YIELD_CHART[i][v])
    ),
  };
}

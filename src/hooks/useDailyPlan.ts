'use client';

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { REGISTER_NOT_LOADED, type LoadedRegister } from '@/lib/registerSave';
import type { DailyPlanHonHlEntry, DailyPlanHlVaEntry } from '@/types';

const LOCATION_JOIN = '*, location:locations(id, name, code)';

/**
 * The day's plan: which location de-heads which batch (HON to HL), and how much
 * HL each location takes for VA. Keyed on the date alone — one plan covers
 * every location, so both halves are fetched and saved together.
 */
export function useDailyPlan() {
  const [honHl, setHonHl] = useState<DailyPlanHonHlEntry[]>([]);
  const [hlVa, setHlVa] = useState<DailyPlanHlVaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // Both halves' rows the form was filled from — the save is checked against them (039)
  const loaded = useRef<LoadedRegister | null>(null);

  const fetchPlan = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [honRes, vaRes] = await Promise.all([
        supabase
          .from('daily_plan_hon_hl')
          .select(LOCATION_JOIN)
          .eq('work_date', date)
          .order('sort_order', { ascending: true }),
        supabase
          .from('daily_plan_hl_va')
          .select(LOCATION_JOIN)
          .eq('work_date', date)
          .order('sort_order', { ascending: true }),
      ]);

      if (honRes.error) throw honRes.error;
      if (vaRes.error) throw vaRes.error;

      setHonHl(honRes.data || []);
      setHlVa(vaRes.data || []);
      loaded.current = {
        date,
        ids: [...(honRes.data || []), ...(vaRes.data || [])].map((e) => e.id),
      };
    } catch (error) {
      console.error('Error fetching PPC plan:', error);
      setHonHl([]);
      setHlVa([]);
      // An empty form after a failed load must not be saveable over the real plan
      loaded.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Replace the whole plan for a date — both halves in one transaction
   * (save_daily_plan, migration 039). A plan is re-cut as a whole when the
   * allocation changes, so there is nothing to merge row by row. A refused row
   * leaves the old plan exactly as it was, and a plan someone else saved since
   * the form loaded is refused rather than overwritten.
   */
  const savePlan = useCallback(
    async (
      date: string,
      honRows: {
        batch_name: string;
        count_text: string;
        planned_qty: number;
        boxes: number;
        location_id: string;
      }[],
      vaRows: { location_id: string; planned_qty: number }[]
    ) => {
      try {
        const base = loaded.current;
        if (!base || base.date !== date) throw new Error(REGISTER_NOT_LOADED);

        // Rows go in the order given; the function stamps sort_order from it
        const { error } = await supabase.rpc('save_daily_plan', {
          p_work_date: date,
          p_hon_rows: honRows.map((row) => ({
            batch_name: row.batch_name.trim(),
            count_text: row.count_text.trim(),
            planned_qty: row.planned_qty,
            boxes: row.boxes,
            location_id: row.location_id,
          })),
          p_va_rows: vaRows.map((row) => ({
            location_id: row.location_id,
            planned_qty: row.planned_qty,
          })),
          p_loaded_ids: base.ids,
        });
        if (error) throw error;

        await fetchPlan(date);
      } catch (error) {
        console.error('Error saving PPC plan:', error);
        throw error;
      }
    },
    [fetchPlan]
  );

  return { honHl, hlVa, loading, fetchPlan, savePlan };
}

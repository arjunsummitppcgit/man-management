'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
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
    } catch (error) {
      console.error('Error fetching daily plan:', error);
      setHonHl([]);
      setHlVa([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Replace the whole plan for a date — delete then re-insert, the same shape
   * the batch registers use. A plan is re-cut as a whole when the allocation
   * changes, so there is nothing to merge row by row.
   *
   * Deliberately not wrapped in a transaction (PostgREST has none): a failed
   * insert leaves the date with no plan rather than a half-old one. Losing an
   * intention is recoverable — it is re-entered from the same sheet it was read
   * off — which is why this is safe here but not for the registers.
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
        const [honDel, vaDel] = await Promise.all([
          supabase.from('daily_plan_hon_hl').delete().eq('work_date', date),
          supabase.from('daily_plan_hl_va').delete().eq('work_date', date),
        ]);
        if (honDel.error) throw honDel.error;
        if (vaDel.error) throw vaDel.error;

        if (honRows.length > 0) {
          const { error } = await supabase.from('daily_plan_hon_hl').insert(
            honRows.map((row, idx) => ({
              work_date: date,
              batch_name: row.batch_name.trim(),
              count_text: row.count_text.trim(),
              planned_qty: row.planned_qty,
              boxes: row.boxes,
              location_id: row.location_id,
              sort_order: idx,
            }))
          );
          if (error) throw error;
        }

        if (vaRows.length > 0) {
          const { error } = await supabase.from('daily_plan_hl_va').insert(
            vaRows.map((row, idx) => ({
              work_date: date,
              location_id: row.location_id,
              planned_qty: row.planned_qty,
              sort_order: idx,
            }))
          );
          if (error) throw error;
        }

        await fetchPlan(date);
      } catch (error) {
        console.error('Error saving daily plan:', error);
        throw error;
      }
    },
    [fetchPlan]
  );

  return { honHl, hlVa, loading, fetchPlan, savePlan };
}

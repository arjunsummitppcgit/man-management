'use client';

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { REGISTER_NOT_LOADED, type LoadedRegister } from '@/lib/registerSave';
import type { GradingEntry } from '@/types';

export function useGrading() {
  const [entries, setEntries] = useState<GradingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // The rows the form was filled from — the save is checked against them (039)
  const loaded = useRef<LoadedRegister | null>(null);

  /** Fetch the whole grading register for a date. */
  const fetchEntries = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_grading_data')
        .select('*')
        .eq('work_date', date);

      if (error) throw error;
      setEntries(data || []);
      loaded.current = { date, ids: (data || []).map((e) => e.id) };
    } catch (error) {
      console.error('Error fetching daily_grading_data entries:', error);
      setEntries([]);
      // An empty form after a failed load must not be saveable over the real day
      loaded.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Replace the register for a date, in one transaction (save_grading_entries,
   * migration 039) — a refused row changes nothing, and a day someone else
   * saved since the form loaded is refused. Rows the user left completely
   * empty are dropped rather than stored as blanks, so an untouched unit reads
   * as "not recorded" instead of "ran for zero hours".
   */
  const saveEntries = useCallback(async (
    date: string,
    rows: {
      unit_key: string;
      start_time: string | null;
      stop_time: string | null;
      total_grading_qty: number | null;
      note: string | null;
    }[]
  ) => {
    try {
      const base = loaded.current;
      if (!base || base.date !== date) throw new Error(REGISTER_NOT_LOADED);

      const { error } = await supabase.rpc('save_grading_entries', {
        p_work_date: date,
        p_rows: rows.map((row) => ({
          unit_key: row.unit_key,
          start_time: row.start_time,
          stop_time: row.stop_time,
          total_grading_qty: row.total_grading_qty,
          note: row.note,
        })),
        p_loaded_ids: base.ids,
      });

      if (error) throw error;

      await fetchEntries(date);
    } catch (error) {
      console.error('Error saving daily_grading_data entries:', error);
      throw error;
    }
  }, [fetchEntries]);

  return {
    entries,
    loading,
    fetchEntries,
    saveEntries,
  };
}

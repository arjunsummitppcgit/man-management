'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { GradingEntry } from '@/types';

export function useGrading() {
  const [entries, setEntries] = useState<GradingEntry[]>([]);
  const [loading, setLoading] = useState(false);

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
    } catch (error) {
      console.error('Error fetching daily_grading_data entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Replace the register for a date. Rows the user left completely empty are
   * dropped rather than stored as blanks, so an untouched unit reads as "not
   * recorded" instead of "ran for zero hours".
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
      const { error: deleteError } = await supabase
        .from('daily_grading_data')
        .delete()
        .eq('work_date', date);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const insertData = rows.map((row) => ({
          work_date: date,
          unit_key: row.unit_key,
          start_time: row.start_time,
          stop_time: row.stop_time,
          total_grading_qty: row.total_grading_qty,
          note: row.note,
        }));

        const { error: insertError } = await supabase
          .from('daily_grading_data')
          .insert(insertData);

        if (insertError) throw insertError;
      }

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

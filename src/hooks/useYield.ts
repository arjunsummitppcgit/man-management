'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { YieldEntry } from '@/types';

export function useYield() {
  const [entries, setEntries] = useState<YieldEntry[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch all yield entries for a given date (across all locations).
   */
  const fetchYieldEntries = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('yield_entries')
        .select('*, location:locations(id, name, code)')
        .eq('work_date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching yield entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Save (upsert) all yield entries for a given date.
   * Rows with matching (work_date, batch_id) get updated; new rows get inserted.
   */
  const saveYieldEntries = useCallback(async (
    date: string,
    rows: {
      batch_id: string;
      count_text: string;
      count_range: string;
      hon_kgs: number;
      hl_kgs: number;
      location_id: string;
      grader_name: string;
    }[]
  ) => {
    try {
      // First, delete all existing entries for this date so we can re-insert cleanly
      const { error: deleteError } = await supabase
        .from('yield_entries')
        .delete()
        .eq('work_date', date);

      if (deleteError) throw deleteError;

      // Insert all rows if there are any
      if (rows.length > 0) {
        const insertData = rows.map((row) => ({
          work_date: date,
          batch_id: row.batch_id.trim(),
          count_text: row.count_text.trim(),
          count_range: row.count_range,
          hon_kgs: row.hon_kgs,
          hl_kgs: row.hl_kgs,
          location_id: row.location_id,
          grader_name: row.grader_name.trim(),
        }));

        const { error: insertError } = await supabase
          .from('yield_entries')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      // Refresh
      await fetchYieldEntries(date);
    } catch (error) {
      console.error('Error saving yield entries:', error);
      throw error;
    }
  }, [fetchYieldEntries]);

  /**
   * Delete a single yield entry by ID.
   */
  const deleteYieldEntry = useCallback(async (id: string, date: string) => {
    try {
      const { error } = await supabase
        .from('yield_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchYieldEntries(date);
    } catch (error) {
      console.error('Error deleting yield entry:', error);
      throw error;
    }
  }, [fetchYieldEntries]);

  return {
    entries,
    loading,
    fetchYieldEntries,
    saveYieldEntries,
    deleteYieldEntry,
  };
}

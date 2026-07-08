'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { NonLocalLadyEntry } from '@/types';

export function useNonLocalLadies() {
  const [entries, setEntries] = useState<NonLocalLadyEntry[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch all non-local ladies entries for a given date.
   */
  const fetchEntries = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('non_local_ladies')
        .select('*')
        .eq('work_date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching non_local_ladies entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Save (delete + re-insert) all entries for a given date.
   */
  const saveEntries = useCallback(async (
    date: string,
    rows: {
      batch_name: string;
      no_of_ladies: number;
      hl_qty: number;
      pd_qty: number;
      per_head_amount: number;
    }[]
  ) => {
    try {
      const { error: deleteError } = await supabase
        .from('non_local_ladies')
        .delete()
        .eq('work_date', date);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const insertData = rows.map((row) => ({
          work_date: date,
          batch_name: row.batch_name.trim(),
          no_of_ladies: row.no_of_ladies,
          hl_qty: row.hl_qty,
          pd_qty: row.pd_qty,
          per_head_amount: row.per_head_amount,
        }));

        const { error: insertError } = await supabase
          .from('non_local_ladies')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      await fetchEntries(date);
    } catch (error) {
      console.error('Error saving non_local_ladies entries:', error);
      throw error;
    }
  }, [fetchEntries]);

  /**
   * Delete a single entry by ID.
   */
  const deleteEntry = useCallback(async (id: string, date: string) => {
    try {
      const { error } = await supabase
        .from('non_local_ladies')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchEntries(date);
    } catch (error) {
      console.error('Error deleting non_local_ladies entry:', error);
      throw error;
    }
  }, [fetchEntries]);

  return {
    entries,
    loading,
    fetchEntries,
    saveEntries,
    deleteEntry,
  };
}

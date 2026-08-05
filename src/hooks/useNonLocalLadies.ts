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
   *
   * `salaryBasic` is the rate currently set in Reports & Settings. It is only
   * applied to a date that has no rows yet — re-saving an existing day keeps
   * the rate that day was originally entered under, so a later rate change
   * never rewrites past Difference / P&L figures.
   */
  const saveEntries = useCallback(async (
    date: string,
    rows: {
      batch_name: string;
      no_of_ladies: number;
      hl_qty: number;
      pd_qty: number;
      per_head_amount: number;
    }[],
    salaryBasic: number
  ) => {
    try {
      const { data: existing, error: existingError } = await supabase
        .from('non_local_ladies')
        .select('salary_basic')
        .eq('work_date', date)
        .limit(1);

      if (existingError) throw existingError;

      const effectiveBasic = existing && existing.length > 0
        ? Number(existing[0].salary_basic)
        : salaryBasic;

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
          salary_basic: effectiveBasic,
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

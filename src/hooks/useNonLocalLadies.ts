'use client';

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { REGISTER_NOT_LOADED, type LoadedRegister } from '@/lib/registerSave';
import type { NonLocalLadyEntry } from '@/types';

export function useNonLocalLadies() {
  const [entries, setEntries] = useState<NonLocalLadyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // The rows the form was filled from — the save is checked against them (039)
  const loaded = useRef<LoadedRegister | null>(null);

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
      loaded.current = { date, ids: (data || []).map((e) => e.id) };
    } catch (error) {
      console.error('Error fetching non_local_ladies entries:', error);
      setEntries([]);
      // An empty form after a failed load must not be saveable over the real day
      loaded.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Replace all entries for a given date, in one transaction
   * (save_non_local_ladies, migration 039) — a refused row changes nothing,
   * and a day someone else saved since the form loaded is refused.
   *
   * `salaryBasic` is the rate currently set in Reports & Settings. It is only
   * applied to a date that has no rows yet — re-saving an existing day keeps
   * the rate that day was originally entered under, so a later rate change
   * never rewrites past Difference / P&L figures. The function makes that
   * choice itself, inside the same transaction.
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
      const base = loaded.current;
      if (!base || base.date !== date) throw new Error(REGISTER_NOT_LOADED);

      const { error } = await supabase.rpc('save_non_local_ladies', {
        p_work_date: date,
        p_rows: rows.map((row) => ({
          batch_name: row.batch_name.trim(),
          no_of_ladies: row.no_of_ladies,
          hl_qty: row.hl_qty,
          pd_qty: row.pd_qty,
          per_head_amount: row.per_head_amount,
        })),
        p_salary_basic: salaryBasic,
        p_loaded_ids: base.ids,
      });

      if (error) throw error;

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

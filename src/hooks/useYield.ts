'use client';

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/fetchAll';
import { REGISTER_NOT_LOADED, type LoadedRegister } from '@/lib/registerSave';
import type { YieldEntry } from '@/types';

export function useYield() {
  const [entries, setEntries] = useState<YieldEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // The rows the form was filled from — the save is checked against them (039)
  const loaded = useRef<LoadedRegister | null>(null);
  const [batchEntries, setBatchEntries] = useState<YieldEntry[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [rangeEntries, setRangeEntries] = useState<YieldEntry[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);

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
      loaded.current = { date, ids: (data || []).map((e) => e.id) };
    } catch (error) {
      console.error('Error fetching yield entries:', error);
      setEntries([]);
      // An empty form after a failed load must not be saveable over the real day
      loaded.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch all yield entries between two dates, inclusive (reports over a range).
   */
  const fetchRange = useCallback(async (fromDate: string, toDate: string) => {
    setRangeLoading(true);
    try {
      const data = await fetchAllRows<YieldEntry>((from, to) =>
        supabase
          .from('yield_entries')
          .select('*, location:locations(id, name, code)')
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );

      setRangeEntries(data);
    } catch (error) {
      console.error('Error fetching yield entries range:', error);
      setRangeEntries([]);
    } finally {
      setRangeLoading(false);
    }
  }, []);

  /**
   * Fetch all yield entries for a given batch id across every date.
   * Case-insensitive exact match on batch_id.
   */
  const fetchByBatch = useCallback(async (batchId: string) => {
    setBatchLoading(true);
    try {
      const data = await fetchAllRows<YieldEntry>((from, to) =>
        supabase
          .from('yield_entries')
          .select('*, location:locations(id, name, code)')
          .ilike('batch_id', batchId)
          .order('work_date', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );

      setBatchEntries(data);
    } catch (error) {
      console.error('Error fetching yield entries by batch:', error);
      setBatchEntries([]);
    } finally {
      setBatchLoading(false);
    }
  }, []);

  /**
   * Replace the HONS TO HL register for a date, in one transaction
   * (save_yield_entries, migration 039): if the database refuses any row —
   * the same batch twice at one location, a permission — nothing changes and
   * the day keeps its old rows. The ids the form loaded go with it, so a day
   * someone else saved in the meantime is refused instead of overwritten.
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
      /** The standard in force now, stamped so a later chart edit can't move it. */
      std_yield: number | null;
    }[]
  ) => {
    try {
      const base = loaded.current;
      if (!base || base.date !== date) throw new Error(REGISTER_NOT_LOADED);

      const { error } = await supabase.rpc('save_yield_entries', {
        p_work_date: date,
        p_rows: rows.map((row) => ({
          batch_id: row.batch_id.trim(),
          count_text: row.count_text.trim(),
          count_range: row.count_range,
          hon_kgs: row.hon_kgs,
          hl_kgs: row.hl_kgs,
          location_id: row.location_id,
          grader_name: row.grader_name.trim(),
          std_yield: row.std_yield,
        })),
        p_loaded_ids: base.ids,
      });

      if (error) throw error;

      // Refresh — also records the new ids for the next save
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
    batchEntries,
    batchLoading,
    rangeEntries,
    rangeLoading,
    fetchYieldEntries,
    fetchRange,
    fetchByBatch,
    saveYieldEntries,
    deleteYieldEntry,
  };
}

'use client';

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/fetchAll';
import { lookupHlVaCountRange } from '@/lib/hlVa';
import { REGISTER_NOT_LOADED, type LoadedRegister } from '@/lib/registerSave';
import type { HlVaEntry } from '@/types';

export function useHlVa() {
  const [entries, setEntries] = useState<HlVaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // The rows the form was filled from — the save is checked against them (039)
  const loaded = useRef<LoadedRegister | null>(null);
  const [rangeEntries, setRangeEntries] = useState<HlVaEntry[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [batchEntries, setBatchEntries] = useState<HlVaEntry[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  /**
   * Fetch all HL -> VA entries for a single date (daily entry form).
   */
  const fetchEntries = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hl_va_entries')
        .select('*, location:locations(name)')
        .eq('work_date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEntries(data || []);
      loaded.current = { date, ids: (data || []).map((e) => e.id) };
    } catch (error) {
      console.error('Error fetching hl_va entries:', error);
      setEntries([]);
      // An empty form after a failed load must not be saveable over the real day
      loaded.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch all HL -> VA entries in a date range (report).
   */
  const fetchRange = useCallback(async (fromDate: string, toDate: string) => {
    setRangeLoading(true);
    try {
      const data = await fetchAllRows<HlVaEntry>((from, to) =>
        supabase
          .from('hl_va_entries')
          .select('*, location:locations(name)')
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );

      setRangeEntries(data);
    } catch (error) {
      console.error('Error fetching hl_va range:', error);
      setRangeEntries([]);
    } finally {
      setRangeLoading(false);
    }
  }, []);

  /**
   * Fetch all HL -> VA entries for a given batch id across every date.
   * Case-insensitive exact match on batch_id.
   */
  const fetchByBatch = useCallback(async (batchId: string) => {
    setBatchLoading(true);
    try {
      const data = await fetchAllRows<HlVaEntry>((from, to) =>
        supabase
          .from('hl_va_entries')
          .select('*, location:locations(name)')
          .ilike('batch_id', batchId)
          .order('work_date', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );

      setBatchEntries(data);
    } catch (error) {
      console.error('Error fetching hl_va entries by batch:', error);
      setBatchEntries([]);
    } finally {
      setBatchLoading(false);
    }
  }, []);

  /**
   * Replace the HL -> VA register for a date, in one transaction
   * (save_hl_va_entries, migration 039) — a refused row changes nothing, and a
   * day someone else saved since the form loaded is refused, not overwritten.
   * Grade is auto-derived from the count via the standard yield chart.
   */
  const saveEntries = useCallback(async (
    date: string,
    rows: {
      batch_id: string;
      count_text: string;
      variety: string;
      hl_kgs: number;
      va_kgs: number;
      location_id: string;
      grader_name: string;
      /** The standard in force now, stamped so a later chart edit can't move it. */
      std_yield: number | null;
      /** The RJ tick box. */
      is_rejection: boolean;
    }[]
  ) => {
    try {
      const base = loaded.current;
      if (!base || base.date !== date) throw new Error(REGISTER_NOT_LOADED);

      const { error } = await supabase.rpc('save_hl_va_entries', {
        p_work_date: date,
        p_rows: rows.map((row) => ({
          batch_id: row.batch_id,
          count_text: row.count_text,
          grade: lookupHlVaCountRange(row.count_text) || '',
          variety: row.variety,
          hl_kgs: row.hl_kgs,
          va_kgs: row.va_kgs,
          location_id: row.location_id || null,
          grader_name: row.grader_name,
          std_yield: row.std_yield,
          is_rejection: row.is_rejection,
        })),
        p_loaded_ids: base.ids,
      });

      if (error) throw error;

      await fetchEntries(date);
    } catch (error) {
      console.error('Error saving hl_va entries:', error);
      throw error;
    }
  }, [fetchEntries]);

  return {
    entries,
    loading,
    rangeEntries,
    rangeLoading,
    batchEntries,
    batchLoading,
    fetchEntries,
    fetchRange,
    fetchByBatch,
    saveEntries,
  };
}

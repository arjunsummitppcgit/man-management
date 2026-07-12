'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { lookupCountRange } from '@/lib/yieldChart';
import type { HlVaEntry } from '@/types';

export function useHlVa() {
  const [entries, setEntries] = useState<HlVaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [rangeEntries, setRangeEntries] = useState<HlVaEntry[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);

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
    } catch (error) {
      console.error('Error fetching hl_va entries:', error);
      setEntries([]);
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
      const { data, error } = await supabase
        .from('hl_va_entries')
        .select('*, location:locations(name)')
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date', { ascending: true });

      if (error) throw error;
      setRangeEntries(data || []);
    } catch (error) {
      console.error('Error fetching hl_va range:', error);
      setRangeEntries([]);
    } finally {
      setRangeLoading(false);
    }
  }, []);

  /**
   * Save (delete + re-insert) all HL -> VA rows for a given date.
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
    }[]
  ) => {
    try {
      const { error: deleteError } = await supabase
        .from('hl_va_entries')
        .delete()
        .eq('work_date', date);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const insertData = rows.map((row) => ({
          work_date: date,
          batch_id: row.batch_id,
          count_text: row.count_text,
          grade: lookupCountRange(row.count_text) || '',
          variety: row.variety,
          hl_kgs: row.hl_kgs,
          va_kgs: row.va_kgs,
          location_id: row.location_id || null,
          grader_name: row.grader_name,
        }));

        const { error: insertError } = await supabase
          .from('hl_va_entries')
          .insert(insertData);

        if (insertError) throw insertError;
      }

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
    fetchEntries,
    fetchRange,
    saveEntries,
  };
}

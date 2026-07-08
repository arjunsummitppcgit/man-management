'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { GradesVaEntry } from '@/types';

export function useGradesVa() {
  const [entries, setEntries] = useState<GradesVaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [rangeEntries, setRangeEntries] = useState<GradesVaEntry[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);

  /**
   * Fetch all grade V/A entries for a single date (daily entry form).
   */
  const fetchEntries = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('grades_va')
        .select('*')
        .eq('work_date', date);

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching grades_va entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch all grade V/A entries in a date range (report).
   */
  const fetchRange = useCallback(async (fromDate: string, toDate: string) => {
    setRangeLoading(true);
    try {
      const { data, error } = await supabase
        .from('grades_va')
        .select('*')
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date', { ascending: true });

      if (error) throw error;
      setRangeEntries(data || []);
    } catch (error) {
      console.error('Error fetching grades_va range:', error);
      setRangeEntries([]);
    } finally {
      setRangeLoading(false);
    }
  }, []);

  /**
   * Save (delete + re-insert) all grade rows for a given date.
   */
  const saveEntries = useCallback(async (
    date: string,
    rows: {
      grade: string;
      pd: number;
      pdto: number;
      ezpl: number;
      pvpd: number;
      pvpdto: number;
    }[]
  ) => {
    try {
      const { error: deleteError } = await supabase
        .from('grades_va')
        .delete()
        .eq('work_date', date);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const insertData = rows.map((row) => ({
          work_date: date,
          grade: row.grade,
          pd: row.pd,
          pdto: row.pdto,
          ezpl: row.ezpl,
          pvpd: row.pvpd,
          pvpdto: row.pvpdto,
        }));

        const { error: insertError } = await supabase
          .from('grades_va')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      await fetchEntries(date);
    } catch (error) {
      console.error('Error saving grades_va entries:', error);
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

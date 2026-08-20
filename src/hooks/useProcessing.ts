'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { DailyProcessing, ProcessingFormData } from '@/types';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

export function useProcessing() {
  const [processing, setProcessing] = useState<DailyProcessing | null>(null);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchProcessing = useCallback(async (date: string, locationId: string) => {
    setLoading(true);
    try {
      // Fetch the daily processing record for this date + location
      const { data: dailyData, error: dailyError } = await supabase
        .from('daily_processing')
        .select('*')
        .eq('work_date', date)
        .eq('location_id', locationId)
        .maybeSingle();

      if (dailyError) throw dailyError;
      setProcessing(dailyData);

      // Calculate month boundaries from the given date
      const parsedDate = parseISO(date);
      const monthStart = format(startOfMonth(parsedDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(parsedDate), 'yyyy-MM-dd');

      // Fetch all processing records for this month across all locations
      const { data: monthData, error: monthError } = await supabase
        .from('daily_processing')
        .select('processed_kg')
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd);

      if (monthError) throw monthError;

      const total = (monthData || []).reduce(
        (sum, row) => sum + (row.processed_kg || 0),
        0
      );
      setMonthlyTotal(Number(total.toFixed(3)));
    } catch (error) {
      console.error('Error fetching processing:', error);
      setProcessing(null);
      setMonthlyTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProcessing = useCallback(async (
    date: string,
    locationId: string,
    data: ProcessingFormData
  ) => {
    try {
      const { error } = await supabase
        .from('daily_processing')
        .upsert(
          {
            work_date: date,
            location_id: locationId,
            wip_hon_to_headless: data.wip_hon_to_headless,
            wip_headless_to_va: data.wip_headless_to_va,
            // hon_to_headless / headless_to_va are deliberately absent: the
            // registers own them now (migration 029), and an upsert only writes
            // the columns it names, so saving WIP leaves them alone. Adding them
            // back here would blank the day's completed figures.
            // processed_kg is auto-computed by DB trigger from completed fields
            notes: data.notes.trim() || null,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'work_date,location_id',
          }
        );

      if (error) throw error;

      // Refresh data
      await fetchProcessing(date, locationId);
    } catch (error) {
      console.error('Error saving processing:', error);
      throw error;
    }
  }, [fetchProcessing]);

  return {
    processing,
    monthlyTotal,
    loading,
    fetchProcessing,
    saveProcessing,
  };
}

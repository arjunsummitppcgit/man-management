'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { DailySanitization, SanitizationFormData } from '@/types';

export function useSanitization() {
  const [sanitization, setSanitization] = useState<DailySanitization | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSanitization = useCallback(async (date: string, locationId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_sanitization')
        .select('*')
        .eq('work_date', date)
        .eq('location_id', locationId)
        .maybeSingle();

      if (error) throw error;
      setSanitization(data);
    } catch (error) {
      console.error('Error fetching sanitization:', error);
      setSanitization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSanitization = useCallback(async (
    date: string,
    locationId: string,
    data: SanitizationFormData
  ) => {
    try {
      const { error } = await supabase
        .from('daily_sanitization')
        .upsert(
          {
            work_date: date,
            location_id: locationId,
            cleaning_labour: data.cleaning_labour,
            crates_cleaning: data.crates_cleaning,
            nets_cleaning: data.nets_cleaning,
            nmr_labour: data.nmr_labour,
            washroom_cleaning: data.washroom_cleaning,
            grading_machine_cleaning: data.grading_machine_cleaning,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'work_date,location_id',
          }
        );

      if (error) throw error;

      // Refresh data
      await fetchSanitization(date, locationId);
    } catch (error) {
      console.error('Error saving sanitization:', error);
      throw error;
    }
  }, [fetchSanitization]);

  return {
    sanitization,
    loading,
    fetchSanitization,
    saveSanitization,
  };
}

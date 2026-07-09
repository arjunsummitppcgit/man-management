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
            chlorine_ppc: data.chlorine_ppc,
            chlorine_crates: data.chlorine_crates,
            chlorine_washrooms: data.chlorine_washrooms,
            soap_oil_ppc: data.soap_oil_ppc,
            soap_oil_crates: data.soap_oil_crates,
            soap_oil_washrooms: data.soap_oil_washrooms,
            chlorine_grading_machine: data.chlorine_grading_machine,
            soap_oil_grading_machine: data.soap_oil_grading_machine,
            gloves: data.gloves,
            head_cap: data.head_cap,
            masks: data.masks,
            notes: data.notes.trim() || null,
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

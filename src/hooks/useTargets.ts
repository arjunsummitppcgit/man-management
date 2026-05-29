'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { MonthlyTarget } from '@/types';

export function useTargets() {
  const [combinedTarget, setCombinedTarget] = useState<MonthlyTarget | null>(null);
  const [locationTargets, setLocationTargets] = useState<MonthlyTarget[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTargets = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      // Fetch the combined target (location_id IS NULL)
      const { data: combinedData, error: combinedError } = await supabase
        .from('monthly_targets')
        .select('*')
        .eq('year', year)
        .eq('month', month)
        .is('location_id', null)
        .maybeSingle();

      if (combinedError) throw combinedError;
      setCombinedTarget(combinedData);

      // Fetch per-location targets (location_id IS NOT NULL) with location joined
      const { data: locationData, error: locationError } = await supabase
        .from('monthly_targets')
        .select('*, location:locations(*)')
        .eq('year', year)
        .eq('month', month)
        .not('location_id', 'is', null)
        .order('created_at', { ascending: true });

      if (locationError) throw locationError;
      setLocationTargets(locationData || []);
    } catch (error) {
      console.error('Error fetching targets:', error);
      setCombinedTarget(null);
      setLocationTargets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveTarget = useCallback(async (
    year: number,
    month: number,
    targetKg: number,
    locationId: string | null
  ) => {
    try {
      // Build the upsert payload
      const payload: Record<string, unknown> = {
        year,
        month,
        target_kg: targetKg,
        location_id: locationId,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('monthly_targets')
        .upsert(payload, {
          onConflict: 'year,month,location_id',
        });

      if (error) throw error;

      // Refresh targets
      await fetchTargets(year, month);
    } catch (error) {
      console.error('Error saving target:', error);
      throw error;
    }
  }, [fetchTargets]);

  return {
    combinedTarget,
    locationTargets,
    loading,
    fetchTargets,
    saveTarget,
  };
}

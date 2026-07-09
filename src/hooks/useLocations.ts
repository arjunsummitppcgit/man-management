'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Location } from '@/types';

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const addLocation = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Enter a location name');

    // locations.code must be unique — derive one from the name and
    // disambiguate against everything that already exists (active or not)
    const { data: existing, error: fetchError } = await supabase
      .from('locations')
      .select('code, sort_order');

    if (fetchError) throw fetchError;

    const existingCodes = new Set((existing || []).map((l) => l.code));
    const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'loc';
    let code = base;
    let suffix = 2;
    while (existingCodes.has(code)) {
      code = `${base}${suffix}`;
      suffix += 1;
    }

    const nextOrder = (existing || []).reduce((max, l) => Math.max(max, l.sort_order), 0) + 1;

    const { error } = await supabase
      .from('locations')
      .insert({ name: trimmed, code, sort_order: nextOrder });

    if (error) throw error;

    await fetchLocations();
  }, [fetchLocations]);

  return {
    locations,
    loading,
    fetchLocations,
    addLocation,
  };
}

'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Supervisor } from '@/types';

export function useSupervisors() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSupervisors = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('supervisors')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setSupervisors(data || []);
    } catch (error) {
      console.error('Error fetching supervisors:', error);
      setSupervisors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const addSupervisor = useCallback(async (name: string, phone: string) => {
    try {
      const { error } = await supabase
        .from('supervisors')
        .insert({
          name: name.trim(),
          phone: phone.trim() || null,
          is_active: true,
        });

      if (error) throw error;

      // Refresh the list after adding
      await fetchSupervisors();
    } catch (error) {
      console.error('Error adding supervisor:', error);
      throw error;
    }
  }, [fetchSupervisors]);

  const updateSupervisor = useCallback(async (id: string, data: Partial<Supervisor>) => {
    try {
      const { error } = await supabase
        .from('supervisors')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      // Refresh the list after updating
      await fetchSupervisors();
    } catch (error) {
      console.error('Error updating supervisor:', error);
      throw error;
    }
  }, [fetchSupervisors]);

  const deactivateSupervisor = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('supervisors')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      // Refresh the list after deactivating
      await fetchSupervisors();
    } catch (error) {
      console.error('Error deactivating supervisor:', error);
      throw error;
    }
  }, [fetchSupervisors]);

  return {
    supervisors,
    loading,
    fetchSupervisors,
    addSupervisor,
    updateSupervisor,
    deactivateSupervisor,
  };
}

'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { DailyWorkforce, DailySupervisorAssignment, WorkforceFormData } from '@/types';

export function useWorkforce() {
  const [workforce, setWorkforce] = useState<DailyWorkforce | null>(null);
  const [assignments, setAssignments] = useState<DailySupervisorAssignment[]>([]);
  const [allDailyAssignments, setAllDailyAssignments] = useState<DailySupervisorAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkforce = useCallback(async (date: string, locationId: string) => {
    setLoading(true);
    try {
      // Fetch workforce data for the given date and location
      const { data: workforceData, error: workforceError } = await supabase
        .from('daily_workforce')
        .select('*')
        .eq('work_date', date)
        .eq('location_id', locationId)
        .maybeSingle();

      if (workforceError) throw workforceError;
      setWorkforce(workforceData);

      // Fetch all supervisor assignments for the given date across all locations
      const { data: allDailyAssignmentData, error: allDailyAssignmentError } = await supabase
        .from('daily_supervisor_assignments')
        .select('*, supervisor:supervisors(*)')
        .eq('work_date', date);

      if (allDailyAssignmentError) throw allDailyAssignmentError;
      setAllDailyAssignments(allDailyAssignmentData || []);

      // Filter assignments for the current location
      const currentAssignments = (allDailyAssignmentData || []).filter(
        (a) => a.location_id === locationId
      );
      setAssignments(currentAssignments);
    } catch (error) {
      console.error('Error fetching workforce:', error);
      setWorkforce(null);
      setAssignments([]);
      setAllDailyAssignments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveWorkforce = useCallback(async (
    date: string,
    locationId: string,
    data: WorkforceFormData
  ) => {
    try {
      const totalHeadcount =
        data.labour_kg_basic +
        data.labour_daily_wage +
        data.labour_company +
        data.labour_non_locals +
        data.boys_count +
        data.checking_count +
        data.cleaning_count +
        data.qc_count +
        data.security_count;

      // Upsert the daily_workforce row
      const { error: workforceError } = await supabase
        .from('daily_workforce')
        .upsert(
          {
            work_date: date,
            location_id: locationId,
            labour_kg_basic: data.labour_kg_basic,
            labour_daily_wage: data.labour_daily_wage,
            labour_company: data.labour_company,
            labour_non_locals: data.labour_non_locals,
            // labour_count is auto-computed by DB trigger
            boys_count: data.boys_count,
            checking_count: data.checking_count,
            cleaning_count: data.cleaning_count,
            qc_count: data.qc_count,
            security_count: data.security_count,
            total_headcount: totalHeadcount,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'work_date,location_id',
          }
        );

      if (workforceError) throw workforceError;

      // Delete existing assignments for this date + location
      const { error: deleteError } = await supabase
        .from('daily_supervisor_assignments')
        .delete()
        .eq('work_date', date)
        .eq('location_id', locationId);

      if (deleteError) throw deleteError;

      // Insert new assignments for each supervisor
      if (data.supervisor_ids.length > 0) {
        const assignmentRows = data.supervisor_ids.map((supervisorId) => ({
          work_date: date,
          location_id: locationId,
          supervisor_id: supervisorId,
          is_present: 1.0,
        }));

        const { error: insertError } = await supabase
          .from('daily_supervisor_assignments')
          .insert(assignmentRows);

        if (insertError) throw insertError;
      }

      // Refresh data
      await fetchWorkforce(date, locationId);
    } catch (error) {
      console.error('Error saving workforce:', error);
      throw error;
    }
  }, [fetchWorkforce]);

  return {
    workforce,
    assignments,
    allDailyAssignments,
    loading,
    fetchWorkforce,
    saveWorkforce,
  };
}

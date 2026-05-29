'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { DashboardKPIs, LocationBreakdown } from '@/types';
import { format, parseISO, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { getDaysRemainingInMonth, calculateDailyAverage } from '@/lib/utils';

export function useDashboard() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [locationBreakdowns, setLocationBreakdowns] = useState<LocationBreakdown[]>([]);
  const [processingTrend, setProcessingTrend] = useState<
    { date: string; kg: number; location: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const fetchDashboard = useCallback(async (date: string, locationFilter: string | null) => {
    setLoading(true);
    try {
      const parsedDate = parseISO(date);
      const year = parsedDate.getFullYear();
      const month = parsedDate.getMonth() + 1; // 1-indexed
      const monthStart = format(startOfMonth(parsedDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(parsedDate), 'yyyy-MM-dd');

      // ──────────────────────────────────────────
      // 1. Workforce for selected date
      // ──────────────────────────────────────────
      let workforceQuery = supabase
        .from('daily_workforce')
        .select('total_headcount, location_id')
        .eq('work_date', date);

      if (locationFilter) {
        workforceQuery = workforceQuery.eq('location_id', locationFilter);
      }

      const { data: workforceData, error: workforceError } = await workforceQuery;
      if (workforceError) throw workforceError;

      const totalWorkforce = (workforceData || []).reduce(
        (sum, row) => sum + (row.total_headcount || 0),
        0
      );

      // ──────────────────────────────────────────
      // 2. Supervisor assignments for selected date
      // ──────────────────────────────────────────
      let assignmentQuery = supabase
        .from('daily_supervisor_assignments')
        .select('id, location_id, location:locations(name), supervisor:supervisors(name)')
        .eq('work_date', date)
        .eq('is_present', true);

      if (locationFilter) {
        assignmentQuery = assignmentQuery.eq('location_id', locationFilter);
      }

      const { data: assignmentData, error: assignmentError } = await assignmentQuery;
      if (assignmentError) throw assignmentError;

      const supervisorsPresent = (assignmentData || []).length;

      // Extract names of present supervisors
      const supervisorNames = (assignmentData || [])
        .map((a) => a.supervisor?.name)
        .filter((name): name is string => typeof name === 'string');

      // Construct breakdown string (e.g., "2 PPC 1, 1 PPC 2")
      const counts: Record<string, number> = {};
      for (const item of assignmentData || []) {
        const locName = item.location?.name || 'Unknown';
        counts[locName] = (counts[locName] || 0) + 1;
      }
      const supervisorBreakdown = Object.entries(counts)
        .map(([loc, count]) => `${count} ${loc}`)
        .join(', ');

      // ──────────────────────────────────────────
      // 3. Processing for selected date
      // ──────────────────────────────────────────
      let dailyProcessingQuery = supabase
        .from('daily_processing')
        .select('processed_kg')
        .eq('work_date', date);

      if (locationFilter) {
        dailyProcessingQuery = dailyProcessingQuery.eq('location_id', locationFilter);
      }

      const { data: dailyProcessingData, error: dailyProcessingError } = await dailyProcessingQuery;
      if (dailyProcessingError) throw dailyProcessingError;

      const todaysProcessing = (dailyProcessingData || []).reduce(
        (sum, row) => sum + (row.processed_kg || 0),
        0
      );

      // ──────────────────────────────────────────
      // 4. Monthly target (combined, location_id IS NULL)
      // ──────────────────────────────────────────
      const { data: targetData, error: targetError } = await supabase
        .from('monthly_targets')
        .select('target_kg')
        .eq('year', year)
        .eq('month', month)
        .is('location_id', null)
        .maybeSingle();

      if (targetError) throw targetError;

      const monthlyTarget = targetData?.target_kg || 0;

      // ──────────────────────────────────────────
      // 5. Sum of processing for current month
      // ──────────────────────────────────────────
      let monthlyProcessingQuery = supabase
        .from('daily_processing')
        .select('processed_kg')
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd);

      if (locationFilter) {
        monthlyProcessingQuery = monthlyProcessingQuery.eq('location_id', locationFilter);
      }

      const { data: monthlyProcessingData, error: monthlyProcessingError } =
        await monthlyProcessingQuery;
      if (monthlyProcessingError) throw monthlyProcessingError;

      const monthlyProcessed = (monthlyProcessingData || []).reduce(
        (sum, row) => sum + (row.processed_kg || 0),
        0
      );

      // ──────────────────────────────────────────
      // 6. Calculate derived KPIs
      // ──────────────────────────────────────────
      const daysRemaining = getDaysRemainingInMonth(year, month);
      const monthlyProgress =
        monthlyTarget > 0 ? (monthlyProcessed / monthlyTarget) * 100 : 0;
      const dailyAverageNeeded = calculateDailyAverage(
        monthlyTarget,
        monthlyProcessed,
        daysRemaining
      );

      setKpis({
        totalWorkforce,
        supervisorsPresent,
        todaysProcessing,
        monthlyTarget,
        monthlyProcessed,
        monthlyProgress,
        dailyAverageNeeded,
        daysRemaining,
        supervisorNames,
        supervisorBreakdown,
      });

      // ──────────────────────────────────────────
      // 7. Last 7 days processing trend with location names
      // ──────────────────────────────────────────
      const sevenDaysAgo = format(subDays(parsedDate, 6), 'yyyy-MM-dd');

      let trendQuery = supabase
        .from('daily_processing')
        .select('work_date, processed_kg, location:locations(name)')
        .gte('work_date', sevenDaysAgo)
        .lte('work_date', date)
        .order('work_date', { ascending: true });

      if (locationFilter) {
        trendQuery = trendQuery.eq('location_id', locationFilter);
      }

      const { data: trendData, error: trendError } = await trendQuery;
      if (trendError) throw trendError;

      const trendFormatted = (trendData || []).map((row: Record<string, unknown>) => {
        const locationObj = row.location as { name: string } | null;
        return {
          date: row.work_date as string,
          kg: row.processed_kg as number,
          location: locationObj?.name || 'Unknown',
        };
      });

      setProcessingTrend(trendFormatted);

      // ──────────────────────────────────────────
      // 8. Per-location breakdowns
      // ──────────────────────────────────────────
      const { data: locations, error: locationsError } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (locationsError) throw locationsError;

      const breakdowns: LocationBreakdown[] = await Promise.all(
        (locations || []).map(async (location) => {
          // Workforce for this location on this date
          const { data: locWorkforce } = await supabase
            .from('daily_workforce')
            .select('total_headcount')
            .eq('work_date', date)
            .eq('location_id', location.id)
            .maybeSingle();

          // Processing for this location on this date
          const { data: locProcessing } = await supabase
            .from('daily_processing')
            .select('processed_kg')
            .eq('work_date', date)
            .eq('location_id', location.id)
            .maybeSingle();

          // Supervisors for this location on this date
          const { data: locSupervisors } = await supabase
            .from('daily_supervisor_assignments')
            .select('id')
            .eq('work_date', date)
            .eq('location_id', location.id)
            .eq('is_present', true);

          return {
            location,
            workforce: locWorkforce?.total_headcount || 0,
            processing: locProcessing?.processed_kg || 0,
            supervisors: (locSupervisors || []).length,
          };
        })
      );

      setLocationBreakdowns(breakdowns);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      setKpis(null);
      setLocationBreakdowns([]);
      setProcessingTrend([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    kpis,
    locationBreakdowns,
    processingTrend,
    loading,
    fetchDashboard,
  };
}

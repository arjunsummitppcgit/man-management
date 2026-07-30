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
      const yesterdayDate = format(subDays(parsedDate, 1), 'yyyy-MM-dd');

      // ──────────────────────────────────────────
      // 1. Workforce for selected date
      // ──────────────────────────────────────────
      let workforceQuery = supabase
        .from('daily_workforce')
        .select('total_headcount, labour_kg_basic, labour_daily_wage, labour_company, labour_non_locals, labour_count, boys_count, checking_waste, checking_pd, checking_count, cleaning_count, qc_count, security_count, location_id')
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

      const labourKgBasic = (workforceData || []).reduce((sum, row) => sum + (row.labour_kg_basic || 0), 0);
      const labourDailyWage = (workforceData || []).reduce((sum, row) => sum + (row.labour_daily_wage || 0), 0);
      const labourCompany = (workforceData || []).reduce((sum, row) => sum + (row.labour_company || 0), 0);
      const labourNonLocals = (workforceData || []).reduce((sum, row) => sum + (row.labour_non_locals || 0), 0);
      const labourTotal = labourKgBasic + labourDailyWage + labourCompany + labourNonLocals;
      const boysCount = (workforceData || []).reduce((sum, row) => sum + (row.boys_count || 0), 0);
      const checkingWaste = (workforceData || []).reduce((sum, row) => sum + (row.checking_waste || 0), 0);
      const checkingPd = (workforceData || []).reduce((sum, row) => sum + (row.checking_pd || 0), 0);
      // The stored total, which still covers pre-split rows where both sub-columns are 0.
      const checkingCount = (workforceData || []).reduce((sum, row) => sum + (row.checking_count || 0), 0);
      const cleaningCount = (workforceData || []).reduce((sum, row) => sum + (row.cleaning_count || 0), 0);
      const qcCount = (workforceData || []).reduce((sum, row) => sum + (row.qc_count || 0), 0);
      const securityCount = (workforceData || []).reduce((sum, row) => sum + (row.security_count || 0), 0);

      // ──────────────────────────────────────────
      // 2. Supervisor assignments for selected date
      // ──────────────────────────────────────────
      let assignmentQuery = supabase
        .from('daily_supervisor_assignments')
        .select('id, location_id, is_present, location:locations(name), supervisor:supervisors(name)')
        .eq('work_date', date)
        .gt('is_present', 0);

      if (locationFilter) {
        assignmentQuery = assignmentQuery.eq('location_id', locationFilter);
      }

      const { data: assignmentData, error: assignmentError } = await assignmentQuery;
      if (assignmentError) throw assignmentError;

      const supervisorsPresent = (assignmentData || []).reduce(
        (sum, row) => sum + (Number((row as any).is_present) || 0),
        0
      );

      // Extract names of present supervisors
      const supervisorNames = ((assignmentData as any) || [])
        .map((a: any) => a.supervisor?.name)
        .filter((name: any): name is string => typeof name === 'string');

      // Construct breakdown string (e.g., "2 PPC 1, 1 PPC 2")
      const counts: Record<string, number> = {};
      for (const item of (assignmentData as any) || []) {
        const locName = item.location?.name || 'Unknown';
        counts[locName] = (counts[locName] || 0) + 1;
      }
      const supervisorBreakdown = Object.entries(counts)
        .map(([loc, count]) => `${count} ${loc}`)
        .join(', ');

      // ──────────────────────────────────────────
      // 2.3. Fetch all active and unassigned supervisors for selected date
      // ──────────────────────────────────────────
      const { data: activeSupervisorsData, error: activeSupervisorsError } = await supabase
        .from('supervisors')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (activeSupervisorsError) throw activeSupervisorsError;

      const { data: allAssignmentsData, error: allAssignmentsError } = await supabase
        .from('daily_supervisor_assignments')
        .select('supervisor_id')
        .eq('work_date', date)
        .gt('is_present', 0);

      if (allAssignmentsError) throw allAssignmentsError;

      const assignedSupervisorIds = new Set((allAssignmentsData || []).map((a) => a.supervisor_id));
      const unassignedSupervisorNames = (activeSupervisorsData || [])
        .filter((s) => !assignedSupervisorIds.has(s.id))
        .map((s) => s.name);

      // ──────────────────────────────────────────
      // 2.5. Sanitization for selected date
      // ──────────────────────────────────────────
      let sanitizationQuery = supabase
        .from('daily_sanitization')
        .select('outside_cleaning, local_crates_wash, company_crates_wash, cleaning_labour, nmr_labour, crates_cleaning, nets_cleaning, washroom_cleaning, grading_machine_cleaning')
        .eq('work_date', date);

      if (locationFilter) {
        sanitizationQuery = sanitizationQuery.eq('location_id', locationFilter);
      }

      const { data: sanitizationData, error: sanitizationError } = await sanitizationQuery;
      if (sanitizationError) throw sanitizationError;

      const sanitizationOutsideCleaning = (sanitizationData || []).reduce((sum, row) => sum + (row.outside_cleaning || 0), 0);
      const sanitizationLocalCratesWash = (sanitizationData || []).reduce((sum, row) => sum + (row.local_crates_wash || 0), 0);
      const sanitizationCompanyCratesWash = (sanitizationData || []).reduce((sum, row) => sum + (row.company_crates_wash || 0), 0);
      // Cleaning Labour + NMR Labour were retired by migration 024. Dates entered
      // before then still hold figures there, so keep counting them or historical
      // totals would silently shrink.
      const sanitizationRetiredLabour = (sanitizationData || []).reduce(
        (sum, row) => sum + (row.cleaning_labour || 0) + (row.nmr_labour || 0),
        0
      );
      const sanitizationCratesCleaning = (sanitizationData || []).reduce((sum, row) => sum + (row.crates_cleaning || 0), 0);
      const sanitizationNetsCleaning = (sanitizationData || []).reduce((sum, row) => sum + (row.nets_cleaning || 0), 0);
      const sanitizationWashroomCleaning = (sanitizationData || []).reduce((sum, row) => sum + (row.washroom_cleaning || 0), 0);
      const sanitizationGradingMachineCleaning = (sanitizationData || []).reduce((sum, row) => sum + (row.grading_machine_cleaning || 0), 0);
      const sanitizationTotal =
        sanitizationOutsideCleaning +
        sanitizationLocalCratesWash +
        sanitizationCompanyCratesWash +
        sanitizationRetiredLabour +
        sanitizationWashroomCleaning +
        sanitizationGradingMachineCleaning;

      // ──────────────────────────────────────────
      // 3. Processing for selected date (WIP) and yesterday (Completed)
      // ──────────────────────────────────────────
      let dailyProcessingQuery = supabase
        .from('daily_processing')
        .select('wip_hon_to_headless, wip_headless_to_va')
        .eq('work_date', date);

      let yesterdayProcessingQuery = supabase
        .from('daily_processing')
        .select('headless_to_va, hon_to_headless')
        .eq('work_date', yesterdayDate);

      let yesterdaySanitizationQuery = supabase
        .from('daily_sanitization')
        .select('crates_cleaning, nets_cleaning, chlorine_ppc, chlorine_crates, chlorine_washrooms, chlorine_grading_machine, soap_oil_ppc, soap_oil_crates, soap_oil_washrooms, soap_oil_grading_machine, gloves, head_cap, masks, notes, location:locations(name)')
        .eq('work_date', yesterdayDate);

      if (locationFilter) {
        dailyProcessingQuery = dailyProcessingQuery.eq('location_id', locationFilter);
        yesterdayProcessingQuery = yesterdayProcessingQuery.eq('location_id', locationFilter);
        yesterdaySanitizationQuery = yesterdaySanitizationQuery.eq('location_id', locationFilter);
      }

      const { data: dailyProcessingData, error: dailyProcessingError } = await dailyProcessingQuery;
      if (dailyProcessingError) throw dailyProcessingError;

      const { data: yesterdayProcessingData, error: yesterdayProcessingError } = await yesterdayProcessingQuery;
      if (yesterdayProcessingError) throw yesterdayProcessingError;

      const { data: yesterdaySanitizationData, error: yesterdaySanitizationError } = await yesterdaySanitizationQuery;
      if (yesterdaySanitizationError) throw yesterdaySanitizationError;

      const yesterdayCratesCleaning = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.crates_cleaning || 0), 0);
      const yesterdayNetsCleaning = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.nets_cleaning || 0), 0);
      
      const yesterdayChlorinePpc = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.chlorine_ppc || 0), 0);
      const yesterdayChlorineCrates = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.chlorine_crates || 0), 0);
      const yesterdayChlorineWashrooms = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.chlorine_washrooms || 0), 0);
      const yesterdayChlorineGradingMachine = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.chlorine_grading_machine || 0), 0);

      const yesterdaySoapOilPpc = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.soap_oil_ppc || 0), 0);
      const yesterdaySoapOilCrates = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.soap_oil_crates || 0), 0);
      const yesterdaySoapOilWashrooms = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.soap_oil_washrooms || 0), 0);
      const yesterdaySoapOilGradingMachine = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.soap_oil_grading_machine || 0), 0);

      const yesterdayGloves = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.gloves || 0), 0);
      const yesterdayHeadCap = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.head_cap || 0), 0);
      const yesterdayMasks = (yesterdaySanitizationData || []).reduce((sum, row) => sum + (row.masks || 0), 0);

      // Collect any non-empty day notes from yesterday's sanitization rows
      const yesterdayNotes = ((yesterdaySanitizationData as any[]) || [])
        .filter((row) => row.notes && String(row.notes).trim())
        .map((row) => ({
          location: row.location?.name || 'Unknown',
          note: String(row.notes).trim(),
        }));

      // ──────────────────────────────────────────
      // 2.6. HL to VA for yesterday — find the top grade by total VA quantity
      // ──────────────────────────────────────────
      const { data: yesterdayHlVaData, error: yesterdayHlVaError } = await supabase
        .from('hl_va_entries')
        .select('grade, va_kgs')
        .eq('work_date', yesterdayDate);

      if (yesterdayHlVaError) throw yesterdayHlVaError;

      let yesterdayTopGrade: string | null = null;
      let yesterdayTopGradeQty = 0;
      const gradeTotals = new Map<string, number>();
      (yesterdayHlVaData || []).forEach((row) => {
        const grade = row.grade || 'Unknown';
        gradeTotals.set(grade, (gradeTotals.get(grade) || 0) + (Number(row.va_kgs) || 0));
      });
      gradeTotals.forEach((total, grade) => {
        if (total > yesterdayTopGradeQty) {
          yesterdayTopGradeQty = total;
          yesterdayTopGrade = grade;
        }
      });

      const todaysProcessing = Number(((yesterdayProcessingData || []).reduce(
        (sum, row) => sum + (row.headless_to_va || 0),
        0
      )).toFixed(3));
      const honToHeadless = (yesterdayProcessingData || []).reduce(
        (sum, row) => sum + (row.hon_to_headless || 0),
        0
      );
      const headlessToVa = (yesterdayProcessingData || []).reduce(
        (sum, row) => sum + (row.headless_to_va || 0),
        0
      );
      const wipHonToHeadless = (dailyProcessingData || []).reduce(
        (sum, row) => sum + (row.wip_hon_to_headless || 0),
        0
      );
      const wipHeadlessToVa = (dailyProcessingData || []).reduce(
        (sum, row) => sum + (row.wip_headless_to_va || 0),
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
        .select('headless_to_va')
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd);

      if (locationFilter) {
        monthlyProcessingQuery = monthlyProcessingQuery.eq('location_id', locationFilter);
      }

      const { data: monthlyProcessingData, error: monthlyProcessingError } =
        await monthlyProcessingQuery;
      if (monthlyProcessingError) throw monthlyProcessingError;

      const monthlyProcessed = Number(((monthlyProcessingData || []).reduce(
        (sum, row) => sum + (row.headless_to_va || 0),
        0
      )).toFixed(3));

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
        unassignedSupervisorNames,
        labourKgBasic,
        labourDailyWage,
        labourCompany,
        labourNonLocals,
        labourTotal,
        boysCount,
        checkingWaste,
        checkingPd,
        checkingCount,
        cleaningCount,
        qcCount,
        securityCount,
        sanitizationOutsideCleaning,
        sanitizationLocalCratesWash,
        sanitizationCompanyCratesWash,
        sanitizationRetiredLabour,
        sanitizationCratesCleaning,
        sanitizationNetsCleaning,
        sanitizationWashroomCleaning,
        sanitizationGradingMachineCleaning,
        sanitizationTotal,
        honToHeadless,
        headlessToVa,
        wipHonToHeadless,
        wipHeadlessToVa,
        yesterdayCratesCleaning,
        yesterdayNetsCleaning,
        yesterdayChlorinePpc,
        yesterdayChlorineCrates,
        yesterdayChlorineWashrooms,
        yesterdayChlorineGradingMachine,
        yesterdaySoapOilPpc,
        yesterdaySoapOilCrates,
        yesterdaySoapOilWashrooms,
        yesterdaySoapOilGradingMachine,
        yesterdayGloves,
        yesterdayHeadCap,
        yesterdayMasks,
        yesterdayDate,
        yesterdayNotes,
        yesterdayTopGrade,
        yesterdayTopGradeQty,
      });

      // ──────────────────────────────────────────
      // 7. Last 7 days processing trend with location names
      // ──────────────────────────────────────────
      const sevenDaysAgo = format(subDays(parsedDate, 6), 'yyyy-MM-dd');

      let trendQuery = supabase
        .from('daily_processing')
        .select('work_date, headless_to_va, location:locations(name)')
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
          kg: Number((row.headless_to_va as number || 0).toFixed(3)),
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

          // WIP Processing for this location on today's date
          const { data: locProcessingToday } = await supabase
            .from('daily_processing')
            .select('wip_hon_to_headless, wip_headless_to_va')
            .eq('work_date', date)
            .eq('location_id', location.id)
            .maybeSingle();

          // Completed Processing for this location on yesterday's date
          const { data: locProcessingYesterday } = await supabase
            .from('daily_processing')
            .select('headless_to_va, hon_to_headless')
            .eq('work_date', yesterdayDate)
            .eq('location_id', location.id)
            .maybeSingle();

          // Supervisors for this location on this date
          const { data: locSupervisors } = await supabase
            .from('daily_supervisor_assignments')
            .select('is_present')
            .eq('work_date', date)
            .eq('location_id', location.id)
            .gt('is_present', 0);

          return {
            location,
            workforce: locWorkforce?.total_headcount || 0,
            processing: Number((locProcessingYesterday?.headless_to_va || 0).toFixed(3)),
            supervisors: (locSupervisors || []).reduce(
              (sum, row) => sum + (Number(row.is_present) || 0),
              0
            ),
            wipHonToHeadless: locProcessingToday?.wip_hon_to_headless || 0,
            wipHeadlessToVa: locProcessingToday?.wip_headless_to_va || 0,
            completedHonToHeadless: locProcessingYesterday?.hon_to_headless || 0,
            completedHeadlessToVa: locProcessingYesterday?.headless_to_va || 0,
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

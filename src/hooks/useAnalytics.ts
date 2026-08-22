'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import type { Location, MonthlyTarget } from '@/types';

// ─── Row shapes (only the columns analytics needs) ───────────────────────────

export interface ProcessingRow {
  work_date: string;
  location_id: string;
  hon_to_headless: number;
  headless_to_va: number;
  processed_kg: number;
}

export interface WorkforceRow {
  work_date: string;
  location_id: string;
  labour_kg_basic: number;
  labour_daily_wage: number;
  labour_company: number;
  labour_non_locals: number;
  labour_count: number;
  boys_count: number;
  checking_waste: number;
  checking_pd: number;
  /** Total checking. Pre-migration-023 rows hold an unsplit figure here with both sub-columns at 0. */
  checking_count: number;
  cleaning_count: number;
  qc_count: number;
  security_count: number;
  total_headcount: number;
}

export interface HlVaRow {
  work_date: string;
  location_id: string | null;
  batch_id: string;
  /** Prawn count as the grader wrote it, e.g. '30-40'. */
  count_text: string;
  variety: string;
  grade: string;
  hl_kgs: number;
  va_kgs: number;
}

/**
 * Batch-level HON→HL rows straight from the graders' yield register. The
 * daily_processing figures above are a manually keyed daily total and carry no
 * batch id, so anything that needs to break production down by batch — and
 * therefore by owning company — has to come from here instead.
 */
export interface YieldBatchRow {
  work_date: string;
  location_id: string;
  batch_id: string;
  /** Prawn count as the grader wrote it, e.g. '30-40'. */
  count_text: string;
  hon_kgs: number;
  hl_kgs: number;
}

export interface NonLocalRow {
  work_date: string;
  batch_name: string;
  no_of_ladies: number;
  hl_qty: number;
  pd_qty: number;
  per_head_amount: number;
}

export interface SanitizationRow {
  work_date: string;
  location_id: string;
  // Sanitization headcounts
  outside_cleaning: number;
  local_crates_wash: number;
  company_crates_wash: number;
  /** @deprecated Retired by migration 024. Historical dates only. */
  cleaning_labour: number;
  /** @deprecated Retired by migration 024. Historical dates only. */
  nmr_labour: number;
  crates_cleaning: number;
  nets_cleaning: number;
  washroom_cleaning: number;
  grading_machine_cleaning: number;
  chlorine_ppc: number;
  chlorine_crates: number;
  chlorine_washrooms: number;
  chlorine_grading_machine: number;
  soap_oil_ppc: number;
  soap_oil_crates: number;
  soap_oil_washrooms: number;
  soap_oil_grading_machine: number;
  gloves: number;
  head_cap: number;
  masks: number;
}

export interface AnalyticsData {
  processing: ProcessingRow[];
  yieldBatches: YieldBatchRow[];
  workforce: WorkforceRow[];
  hlVa: HlVaRow[];
  nonLocal: NonLocalRow[];
  sanitization: SanitizationRow[];
  // VA target context (month of the range end)
  monthLabel: string;
  monthYear: number; // e.g. 2026
  monthNumber: number; // 1-12
  combinedTarget: MonthlyTarget | null;
  locationTargets: MonthlyTarget[];
  monthHlVa: HlVaRow[]; // hl_va entries across the whole target month
}

const EMPTY: AnalyticsData = {
  processing: [],
  yieldBatches: [],
  workforce: [],
  hlVa: [],
  nonLocal: [],
  sanitization: [],
  monthLabel: '',
  monthYear: 0,
  monthNumber: 0,
  combinedTarget: null,
  locationTargets: [],
  monthHlVa: [],
};

export function useAnalytics() {
  const [data, setData] = useState<AnalyticsData>(EMPTY);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch every dataset the analytics sections need for a date range.
   * The VA Target section additionally uses the calendar month containing
   * `toDate` for its monthly target comparison.
   */
  const fetchAnalytics = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    try {
      const anchor = parseISO(toDate);
      const monthStart = format(startOfMonth(anchor), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(anchor), 'yyyy-MM-dd');
      const year = anchor.getFullYear();
      const month = anchor.getMonth() + 1;

      const [
        processingRes,
        yieldBatchesRes,
        workforceRes,
        hlVaRes,
        nonLocalRes,
        sanitizationRes,
        combinedTargetRes,
        locationTargetsRes,
        monthHlVaRes,
      ] = await Promise.all([
        supabase
          .from('daily_processing')
          .select('work_date, location_id, hon_to_headless, headless_to_va, processed_kg')
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true }),
        supabase
          .from('yield_entries')
          .select('work_date, location_id, batch_id, count_text, hon_kgs, hl_kgs')
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true }),
        supabase
          .from('daily_workforce')
          .select(
            'work_date, location_id, labour_kg_basic, labour_daily_wage, labour_company, labour_non_locals, labour_count, boys_count, checking_waste, checking_pd, checking_count, cleaning_count, qc_count, security_count, total_headcount'
          )
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true }),
        supabase
          .from('hl_va_entries')
          .select('work_date, location_id, batch_id, count_text, variety, grade, hl_kgs, va_kgs')
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true }),
        supabase
          .from('non_local_ladies')
          .select('work_date, batch_name, no_of_ladies, hl_qty, pd_qty, per_head_amount')
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true }),
        supabase
          .from('daily_sanitization')
          .select(
            'work_date, location_id, outside_cleaning, local_crates_wash, company_crates_wash, cleaning_labour, nmr_labour, crates_cleaning, nets_cleaning, washroom_cleaning, grading_machine_cleaning, chlorine_ppc, chlorine_crates, chlorine_washrooms, chlorine_grading_machine, soap_oil_ppc, soap_oil_crates, soap_oil_washrooms, soap_oil_grading_machine, gloves, head_cap, masks'
          )
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
          .order('work_date', { ascending: true }),
        supabase
          .from('monthly_targets')
          .select('*')
          .eq('year', year)
          .eq('month', month)
          .is('location_id', null)
          .maybeSingle(),
        supabase
          .from('monthly_targets')
          .select('*, location:locations(*)')
          .eq('year', year)
          .eq('month', month)
          .not('location_id', 'is', null),
        supabase
          .from('hl_va_entries')
          .select('work_date, location_id, batch_id, count_text, variety, grade, hl_kgs, va_kgs')
          .gte('work_date', monthStart)
          .lte('work_date', monthEnd),
      ]);

      const firstError =
        processingRes.error ||
        yieldBatchesRes.error ||
        workforceRes.error ||
        hlVaRes.error ||
        nonLocalRes.error ||
        sanitizationRes.error ||
        combinedTargetRes.error ||
        locationTargetsRes.error ||
        monthHlVaRes.error;
      if (firstError) throw firstError;

      setData({
        processing: processingRes.data || [],
        yieldBatches: yieldBatchesRes.data || [],
        workforce: workforceRes.data || [],
        hlVa: hlVaRes.data || [],
        nonLocal: nonLocalRes.data || [],
        sanitization: sanitizationRes.data || [],
        monthLabel: format(anchor, 'MMMM yyyy'),
        monthYear: year,
        monthNumber: month,
        combinedTarget: combinedTargetRes.data as MonthlyTarget | null,
        locationTargets: (locationTargetsRes.data || []) as MonthlyTarget[],
        monthHlVa: monthHlVaRes.data || [],
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, fetchAnalytics };
}

// ─── Aggregation helpers shared by the analytics sections ───────────────────

/** Sum a numeric field per work_date, sorted ascending. */
export function sumByDate<T extends { work_date: string }>(
  rows: T[],
  pick: (row: T) => number
): { date: string; value: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.work_date, (map.get(row.work_date) || 0) + (pick(row) || 0));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

/** Sum a numeric field per location (using a locations lookup for names). */
export function sumByLocation<T extends { location_id: string | null }>(
  rows: T[],
  locations: Location[],
  pick: (row: T) => number
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.location_id || 'other';
    map.set(key, (map.get(key) || 0) + (pick(row) || 0));
  }
  const result: { name: string; value: number }[] = [];
  for (const loc of locations) {
    if (map.has(loc.id)) result.push({ name: loc.name, value: map.get(loc.id)! });
  }
  if (map.has('other')) result.push({ name: 'Other', value: map.get('other')! });
  return result;
}

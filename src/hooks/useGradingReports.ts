'use client';

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { REGISTER_NOT_LOADED } from '@/lib/registerSave';
import { gradingBatchKey, type GradingSavePayload } from '@/lib/gradingReport';
import type { GradingReport, YieldEntry } from '@/types';

type LoadedSheets = { date: string; stamps: Map<string, string> };

/** A sheet's updated_at as the tab loaded it; null means it didn't exist yet. */
function loadedStamp(base: LoadedSheets | null, date: string, batchId: string) {
  if (!base || base.date !== date) throw new Error(REGISTER_NOT_LOADED);
  return base.stamps.get(gradingBatchKey(batchId)) ?? null;
}

/**
 * The Grading Report tab for one date: that day's HONS TO HL lines (the
 * batches there are to grade) and the sheets already written for them.
 */
export function useGradingReports() {
  const [batchEntries, setBatchEntries] = useState<YieldEntry[]>([]);
  const [reports, setReports] = useState<GradingReport[]>([]);
  const [loading, setLoading] = useState(false);
  // Each sheet's updated_at as the tab loaded it, by batch — a save or delete
  // is checked against it, so two people can't overwrite each other (040)
  const loaded = useRef<LoadedSheets | null>(null);

  /**
   * `quiet` refreshes without the loading flag — after a save the page must not
   * swap the open sheet for a spinner, or the sheet would close under the user.
   */
  const fetchReports = useCallback(async (date: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [batchRes, reportRes] = await Promise.all([
        supabase
          .from('yield_entries')
          .select('*, location:locations(id, name, code)')
          .eq('work_date', date)
          .order('created_at', { ascending: true }),
        supabase
          .from('grading_reports')
          .select('*, lines:grading_report_lines(*), defects:grading_report_defects(*)')
          .eq('work_date', date)
          .order('created_at', { ascending: true }),
      ]);
      if (batchRes.error) throw batchRes.error;
      if (reportRes.error) throw reportRes.error;

      const rows = (reportRes.data || []) as GradingReport[];
      setBatchEntries(batchRes.data || []);
      setReports(rows);
      loaded.current = {
        date,
        stamps: new Map(rows.map((r) => [gradingBatchKey(r.batch_id), r.updated_at])),
      };
    } catch (error) {
      console.error('Error fetching grading reports:', error);
      setBatchEntries([]);
      setReports([]);
      // A blank sheet after a failed load must not be saveable over a real one
      loaded.current = null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  /** Save one batch's sheet in one transaction (save_grading_report, 040). */
  const saveReport = useCallback(
    async (date: string, batchId: string, payload: GradingSavePayload) => {
      const { error } = await supabase.rpc('save_grading_report', {
        p_work_date: date,
        p_batch_id: batchId,
        p_report: payload.report,
        p_lines: payload.lines,
        p_defects: payload.defects,
        p_loaded_updated_at: loadedStamp(loaded.current, date, batchId),
      });
      if (error) throw error;
      await fetchReports(date, true);
    },
    [fetchReports]
  );

  const deleteReport = useCallback(
    async (date: string, batchId: string) => {
      const { error } = await supabase.rpc('delete_grading_report', {
        p_work_date: date,
        p_batch_id: batchId,
        p_loaded_updated_at: loadedStamp(loaded.current, date, batchId),
      });
      if (error) throw error;
      await fetchReports(date, true);
    },
    [fetchReports]
  );

  return {
    batchEntries,
    reports,
    loading,
    fetchReports,
    saveReport,
    deleteReport,
  };
}

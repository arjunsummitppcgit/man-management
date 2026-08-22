'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { usePermissionAlert } from '@/components/ui/PermissionAlert';
import NumberStepper from '@/components/ui/NumberStepper';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { useLocations } from '@/hooks/useLocations';
import { useWorkforce } from '@/hooks/useWorkforce';
import { useSanitization } from '@/hooks/useSanitization';
import { useProcessing } from '@/hooks/useProcessing';
import { useSupervisors } from '@/hooks/useSupervisors';
import { useAuth } from '@/hooks/useAuth';
import { todayIST, yesterdayIST } from '@/lib/auth/permissions';
import { useYield } from '@/hooks/useYield';
import { useNonLocalLadies } from '@/hooks/useNonLocalLadies';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useHlVa } from '@/hooks/useHlVa';
import { useGrading } from '@/hooks/useGrading';
import { useDailyPlan } from '@/hooks/useDailyPlan';
import { supabase } from '@/lib/supabase/client';
import { GRADING_UNITS, runningHours, formatHours } from '@/lib/grading';
import { lookupStandardYield, lookupCountRange, calculateYield, calculateYieldDifference, YIELD_CHART } from '@/lib/yieldChart';
import { VA_VARIETIES, lookupHlVaStandardYield, lookupHlVaCountRange } from '@/lib/hlVa';
import DailyPlanSheet from '@/components/reports/DailyPlanSheet';
import type {
  Supervisor,
  TabType,
  YieldFormRow,
  NonLocalLadyFormRow,
  HlVaFormRow,
  GradingFormRow,
  DailyPlanHonHlFormRow,
  DailyPlanHlVaFormRow,
} from '@/types';

// ─── Tabs ────────────────────────────────────────────────────────────────────
// Daily Plan leads: on a harvest day it is filled in first, before anyone has a
// figure to record anywhere else.
const TABS: { key: TabType; label: string }[] = [
  { key: 'daily_plan', label: 'Daily Plan' },
  { key: 'workforce', label: 'Workforce' },
  { key: 'sanitization', label: 'Sanitization' },
  { key: 'processing', label: 'Processing' },
  { key: 'yield', label: 'HONS TO HL' },
  { key: 'non_local_ladies', label: 'Company Ladies' },
  { key: 'hl_va', label: 'HL to VA' },
  { key: 'grading', label: 'Grading' },
];

const TAB_LABELS = Object.fromEntries(TABS.map((t) => [t.key, t.label])) as Record<TabType, string>;

// ─── Supervisor Dropdown Component ───────────────────────────────────────────
interface SupervisorDropdownProps {
  supervisors: Supervisor[];
  selected: string[];
  onToggle: (id: string) => void;
}

function SupervisorDropdown({ supervisors, selected, onToggle }: SupervisorDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedNames = supervisors
    .filter((s) => selected.includes(s.id))
    .map((s) => s.name.split(' ')[0]);

  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [supervisors, searchQuery]);

  const handleToggleOpen = () => {
    setOpen((v) => {
      if (v) {
        setSearchQuery(''); // clear query on close
      }
      return !v;
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Trigger row */}
      <button
        type="button"
        onClick={handleToggleOpen}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors supervisor-trigger"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-teal-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-700 text-left">Assign Supervisors</p>
            {selected.length === 0 ? (
              <p className="text-xs text-gray-400">None selected — tap to assign</p>
            ) : (
              <p className="text-xs text-teal-600 font-medium truncate">
                {selected.length} selected: {selectedNames.join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selected.length > 0 && (
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-[11px] font-bold flex items-center justify-center">
              {selected.length}
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24"
            strokeWidth={2} stroke="currentColor"
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Checklist panel */}
      {open && (
        <div className="border-t border-gray-100 flex flex-col max-h-[380px]">
          {/* Search Input */}
          <div className="p-3 border-b border-gray-100 bg-gray-50/50">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search supervisors..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-950 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-650"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* List area */}
          <div className="overflow-y-auto max-h-56 flex-1">
            {filteredSupervisors.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">
                {supervisors.length === 0 ? 'No supervisors available' : 'No supervisors match search'}
              </p>
            ) : (
              filteredSupervisors.map((sup) => {
                const isSelected = selected.includes(sup.id);
                return (
                  <button
                    key={sup.id}
                    type="button"
                    onClick={() => onToggle(sup.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-gray-50 last:border-0 ${
                      isSelected ? 'supervisor-row-selected' : 'supervisor-row-unselected'
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                      isSelected ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {sup.name.charAt(0)}
                    </div>
                    {/* Name */}
                    <span className={`flex-1 text-sm font-medium text-left truncate ${
                      isSelected ? 'text-teal-700' : 'text-gray-700'
                    }`}>
                      {sup.name}
                    </span>
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? 'bg-teal-600 border-teal-600' : 'border-gray-300'
                    }`}>
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Done button */}
          <div className="p-3 supervisor-footer border-t border-gray-100 bg-white">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSearchQuery('');
              }}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Done ({selected.length} selected)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function DailyEntryPage() {
  const { showToast } = useToast();
  const { isAdmin, checkEditDate, user } = useAuth();
  const { requireEditDate, reportError } = usePermissionAlert();
  // IST, not UTC. toISOString() is UTC, which is still on the previous day until
  // 5:30 AM IST — a night-shift entry would have defaulted to yesterday. The
  // permission rules (can_edit_on, migration 027) have always used IST, so this
  // keeps the pre-filled date and the rule that validates it on the same day.
  // Lazy initialiser: the clock is read once on mount, never during a render.
  const [selectedDate, setSelectedDate] = useState(todayIST);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('workforce');
  const [saving, setSaving] = useState(false);
  const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);

  // Any date may be OPENED (that is a read); whether it can be SAVED depends on
  // the user's edit window. Mirrors can_edit_on() in migration 027 — RLS rejects
  // the write anyway, this just says so before the round-trip.
  const editCheck = checkEditDate('daily-entry', selectedDate);


  // Hooks
  const { locations, loading: locationsLoading } = useLocations();
  const {
    workforce: workforceData,
    assignments,
    allDailyAssignments,
    loading: workforceLoading,
    fetchWorkforce,
    saveWorkforce,
  } = useWorkforce();
  const {
    sanitization: sanitizationData,
    loading: sanitizationLoading,
    fetchSanitization,
    saveSanitization,
  } = useSanitization();
  const {
    processing: processingData,
    monthlyTotal,
    loading: processingLoading,
    fetchProcessing,
    saveProcessing,
  } = useProcessing();
  const {
    supervisors,
    loading: supervisorsLoading,
    fetchSupervisors,
  } = useSupervisors();
  const {
    entries: yieldEntries,
    loading: yieldLoading,
    fetchYieldEntries,
    saveYieldEntries,
  } = useYield();

  const {
    entries: nllEntries,
    loading: nllLoading,
    fetchEntries: fetchNllEntries,
    saveEntries: saveNllEntries,
  } = useNonLocalLadies();

  const {
    entries: hlVaEntries,
    loading: hlVaLoading,
    fetchEntries: fetchHlVaEntries,
    saveEntries: saveHlVaEntries,
  } = useHlVa();

  const {
    entries: gradingEntries,
    loading: gradingLoading,
    fetchEntries: fetchGradingEntries,
    saveEntries: saveGradingEntries,
  } = useGrading();

  const {
    honHl: planHonHl,
    hlVa: planHlVa,
    loading: planLoading,
    fetchPlan,
    savePlan,
  } = useDailyPlan();

  // Basic rate: admin-set in Reports & Settings, but a day that already has
  // entries keeps the rate it was saved under (migration 026).
  const { nlLadiesSalaryBasic } = useAppSettings();
  const SALARY_BASIC = nllEntries.length > 0
    ? (Number(nllEntries[0].salary_basic) || nlLadiesSalaryBasic)
    : nlLadiesSalaryBasic;

  // Workforce form state
  const [workforce, setWorkforce] = useState({
    labour_kg_basic: 0,
    labour_daily_wage: 0,
    labour_company: 0,
    labour_non_locals: 0,
    boys_count: 0,
    checking_waste: 0,
    checking_pd: 0,
    cleaning_count: 0,
    qc_count: 0,
    security_count: 0,
  });
  const [labourExpanded, setLabourExpanded] = useState(true);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);

  // Sanitization form state
  const [sanitization, setSanitization] = useState({
    outside_cleaning: 0,
    local_crates_wash: 0,
    company_crates_wash: 0,
    crates_cleaning: 0,
    nets_cleaning: 0,
    washroom_cleaning: 0,
    grading_machine_cleaning: 0,
    chlorine_ppc: 0,
    chlorine_crates: 0,
    chlorine_washrooms: 0,
    soap_oil_ppc: 0,
    soap_oil_crates: 0,
    soap_oil_washrooms: 0,
    chlorine_grading_machine: 0,
    soap_oil_grading_machine: 0,
    gloves: 0,
    head_cap: 0,
    masks: 0,
  });
  const [sanitizationNotes, setSanitizationNotes] = useState('');

  // Processing form state
  const [wipHonToHeadless, setWipHonToHeadless] = useState('');
  const [wipHeadlessToVa, setWipHeadlessToVa] = useState('');
  const [notes, setNotes] = useState('');

  // Yield form state — array of batch rows
  const emptyYieldRow = useCallback((): YieldFormRow => ({
    batch_id: '',
    count_text: '',
    count_range: '',
    hon_kgs: '',
    hl_kgs: '',
    location_id: '',
    grader_name: '',
  }), []);

  const [yieldRows, setYieldRows] = useState<YieldFormRow[]>([]);

  // Non Local Ladies form state
  const emptyNllRow = useCallback((): NonLocalLadyFormRow => ({
    batch_name: '',
    no_of_ladies: '',
    hl_qty: '',
    pd_qty: '',
    per_head_amount: '',
  }), []);
  const [nllRows, setNllRows] = useState<NonLocalLadyFormRow[]>([]);

  // HL to VA form state — array of batch rows
  const emptyHlVaRow = useCallback((): HlVaFormRow => ({
    batch_id: '',
    count_text: '',
    variety: '',
    hl_kgs: '',
    va_kgs: '',
    location_id: '',
    grader_name: '',
  }), []);
  const [hlVaRows, setHlVaRows] = useState<HlVaFormRow[]>([]);

  // Grading register — one fixed row per grading unit, so the shape never varies
  const emptyGradingRows = useCallback(
    (): GradingFormRow[] =>
      GRADING_UNITS.map((u) => ({
        unit_key: u.key,
        start_time: '',
        stop_time: '',
        total_grading_qty: '',
        note: '',
      })),
    []
  );
  const [gradingRows, setGradingRows] = useState<GradingFormRow[]>(emptyGradingRows);

  // Daily Plan form state — the day's allocation, decided when the harvest
  // batches land. Both halves are keyed on the date, not the location selector:
  // a plan that could only name one PPC at a time wouldn't be a plan.
  const emptyPlanHonRow = useCallback((): DailyPlanHonHlFormRow => ({
    batch_name: '',
    count_text: '',
    planned_qty: '',
    boxes: '',
    location_id: '',
  }), []);
  const [planHonRows, setPlanHonRows] = useState<DailyPlanHonHlFormRow[]>([]);
  const [planVaRows, setPlanVaRows] = useState<DailyPlanHlVaFormRow[]>([]);
  // Shown by Generate Plan once the plan is stored — never before, so the sheet
  // that goes out to the floor is always the one in the database.
  const [planSheetOpen, setPlanSheetOpen] = useState(false);

  // Set default location when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0].id);
    }
  }, [locations, selectedLocation]);

  // Fetch data when date, location, or active tab changes
  useEffect(() => {
    if (!selectedDate) return;

    if (activeTab === 'daily_plan') {
      // Covers every location at once, so it keys off the date alone
      fetchPlan(selectedDate);
    } else if (activeTab === 'yield') {
      fetchYieldEntries(selectedDate);
    } else if (activeTab === 'non_local_ladies') {
      fetchNllEntries(selectedDate);
    } else if (activeTab === 'hl_va') {
      fetchHlVaEntries(selectedDate);
    } else if (activeTab === 'grading') {
      // Covers all PPCs at once, so it keys off the date alone
      fetchGradingEntries(selectedDate);
    } else if (selectedLocation) {
      if (activeTab === 'workforce') {
        fetchWorkforce(selectedDate, selectedLocation);
        fetchSupervisors();
      } else if (activeTab === 'sanitization') {
        fetchSanitization(selectedDate, selectedLocation);
      } else if (activeTab === 'processing') {
        fetchProcessing(selectedDate, selectedLocation);
      }
    }
  }, [selectedDate, selectedLocation, activeTab, fetchWorkforce, fetchSupervisors, fetchSanitization, fetchProcessing, fetchYieldEntries, fetchNllEntries, fetchHlVaEntries, fetchGradingEntries, fetchPlan]);

  // Pre-populate the plan from what's stored for the date. An empty plan opens
  // with one blank batch row and no VA rows — VA locations are added one at a
  // time, so a row of blanks would just be in the way.
  useEffect(() => {
    if (planHonHl.length > 0) {
      setPlanHonRows(planHonHl.map((e) => ({
        batch_name: e.batch_name,
        count_text: e.count_text,
        planned_qty: e.planned_qty?.toString() ?? '',
        boxes: e.boxes?.toString() ?? '',
        location_id: e.location_id ?? '',
      })));
    } else if (activeTab === 'daily_plan') {
      setPlanHonRows([emptyPlanHonRow()]);
    }
    setPlanVaRows(planHlVa.map((e) => ({
      location_id: e.location_id ?? '',
      planned_qty: e.planned_qty?.toString() ?? '',
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planHonHl, planHlVa]);

  // Pre-populate the grading register from fetched data, keeping every unit's row
  // present whether or not it was recorded
  useEffect(() => {
    setGradingRows(
      GRADING_UNITS.map((u) => {
        const entry = gradingEntries.find((e) => e.unit_key === u.key);
        return {
          unit_key: u.key,
          // Postgres TIME comes back as 'HH:MM:SS'; the time input wants 'HH:MM'
          start_time: entry?.start_time ? entry.start_time.slice(0, 5) : '',
          stop_time: entry?.stop_time ? entry.stop_time.slice(0, 5) : '',
          total_grading_qty:
            entry?.total_grading_qty != null ? String(entry.total_grading_qty) : '',
          note: entry?.note ?? '',
        };
      })
    );
  }, [gradingEntries]);

  // Pre-populate HL to VA rows from fetched data
  useEffect(() => {
    if (hlVaEntries.length > 0) {
      setHlVaRows(hlVaEntries.map((e) => ({
        batch_id: e.batch_id,
        count_text: e.count_text,
        variety: e.variety,
        hl_kgs: e.hl_kgs?.toString() ?? '',
        va_kgs: e.va_kgs?.toString() ?? '',
        location_id: e.location_id ?? '',
        grader_name: e.grader_name,
      })));
    } else if (activeTab === 'hl_va') {
      setHlVaRows([emptyHlVaRow()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hlVaEntries]);

  // Pre-populate NLL rows from fetched data
  useEffect(() => {
    if (nllEntries.length > 0) {
      setNllRows(nllEntries.map((e) => ({
        id: e.id,
        batch_name: e.batch_name,
        no_of_ladies: e.no_of_ladies?.toString() ?? '',
        hl_qty: e.hl_qty?.toString() ?? '',
        pd_qty: e.pd_qty?.toString() ?? '',
        per_head_amount: e.per_head_amount?.toString() ?? '',
      })));
    } else if (activeTab === 'non_local_ladies') {
      setNllRows([emptyNllRow()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nllEntries]);

  // Pre-populate workforce form from fetched data
  useEffect(() => {
    if (workforceData) {
      const checkingWaste = workforceData.checking_waste ?? 0;
      const checkingPd = workforceData.checking_pd ?? 0;
      // Dates entered before the waste/PD split hold their whole figure in
      // checking_count. Fold that remainder into PD so reopening and saving an
      // old date can't quietly wipe it — see migration 023.
      const unsplit = Math.max(0, (workforceData.checking_count ?? 0) - checkingWaste - checkingPd);

      setWorkforce({
        labour_kg_basic: workforceData.labour_kg_basic ?? 0,
        labour_daily_wage: workforceData.labour_daily_wage ?? 0,
        labour_company: workforceData.labour_company ?? 0,
        labour_non_locals: workforceData.labour_non_locals ?? 0,
        boys_count: workforceData.boys_count ?? 0,
        checking_waste: checkingWaste,
        checking_pd: checkingPd + unsplit,
        cleaning_count: workforceData.cleaning_count ?? 0,
        qc_count: workforceData.qc_count ?? 0,
        security_count: workforceData.security_count ?? 0,
      });
    } else {
      setWorkforce({
        labour_kg_basic: 0,
        labour_daily_wage: 0,
        labour_company: 0,
        labour_non_locals: 0,
        boys_count: 0,
        checking_waste: 0,
        checking_pd: 0,
        cleaning_count: 0,
        qc_count: 0,
        security_count: 0,
      });
    }
  }, [workforceData]);

  // Pre-populate selected supervisors from assignments
  useEffect(() => {
    setSelectedSupervisors(assignments.map((a) => a.supervisor_id));
  }, [assignments]);

  // Pre-populate sanitization form from fetched data
  useEffect(() => {
    if (sanitizationData) {
      setSanitization({
        outside_cleaning: sanitizationData.outside_cleaning ?? 0,
        local_crates_wash: sanitizationData.local_crates_wash ?? 0,
        company_crates_wash: sanitizationData.company_crates_wash ?? 0,
        crates_cleaning: sanitizationData.crates_cleaning ?? 0,
        nets_cleaning: sanitizationData.nets_cleaning ?? 0,
        washroom_cleaning: sanitizationData.washroom_cleaning ?? 0,
        grading_machine_cleaning: sanitizationData.grading_machine_cleaning ?? 0,
        chlorine_ppc: sanitizationData.chlorine_ppc ?? 0,
        chlorine_crates: sanitizationData.chlorine_crates ?? 0,
        chlorine_washrooms: sanitizationData.chlorine_washrooms ?? 0,
        soap_oil_ppc: sanitizationData.soap_oil_ppc ?? 0,
        soap_oil_crates: sanitizationData.soap_oil_crates ?? 0,
        soap_oil_washrooms: sanitizationData.soap_oil_washrooms ?? 0,
        chlorine_grading_machine: sanitizationData.chlorine_grading_machine ?? 0,
        soap_oil_grading_machine: sanitizationData.soap_oil_grading_machine ?? 0,
        gloves: sanitizationData.gloves ?? 0,
        head_cap: sanitizationData.head_cap ?? 0,
        masks: sanitizationData.masks ?? 0,
      });
      setSanitizationNotes(sanitizationData.notes ?? '');
    } else {
      setSanitization({
        outside_cleaning: 0,
        local_crates_wash: 0,
        company_crates_wash: 0,
        crates_cleaning: 0,
        nets_cleaning: 0,
        washroom_cleaning: 0,
        grading_machine_cleaning: 0,
        chlorine_ppc: 0,
        chlorine_crates: 0,
        chlorine_washrooms: 0,
        soap_oil_ppc: 0,
        soap_oil_crates: 0,
        soap_oil_washrooms: 0,
        chlorine_grading_machine: 0,
        soap_oil_grading_machine: 0,
        gloves: 0,
        head_cap: 0,
        masks: 0,
      });
      setSanitizationNotes('');
    }
  }, [sanitizationData]);

  // Pre-populate processing form from fetched data
  useEffect(() => {
    if (processingData) {
      setWipHonToHeadless(processingData.wip_hon_to_headless?.toString() ?? '0');
      setWipHeadlessToVa(processingData.wip_headless_to_va?.toString() ?? '0');
      setNotes(processingData.notes ?? '');
    } else {
      setWipHonToHeadless('');
      setWipHeadlessToVa('');
      setNotes('');
    }
  }, [processingData]);

  // Pre-populate yield rows from fetched data
  useEffect(() => {
    if (yieldEntries.length > 0) {
      setYieldRows(yieldEntries.map((e) => ({
        id: e.id,
        batch_id: e.batch_id,
        count_text: e.count_text,
        count_range: e.count_range,
        hon_kgs: e.hon_kgs?.toString() ?? '',
        hl_kgs: e.hl_kgs?.toString() ?? '',
        location_id: e.location_id,
        grader_name: e.grader_name,
      })));
    } else if (activeTab === 'yield') {
      setYieldRows([emptyYieldRow()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yieldEntries]);

  const labourTotal =
    workforce.labour_kg_basic +
    workforce.labour_daily_wage +
    workforce.labour_company +
    workforce.labour_non_locals;

  const workforceTotal =
    labourTotal +
    workforce.boys_count +
    workforce.checking_waste +
    workforce.checking_pd +
    workforce.cleaning_count +
    workforce.qc_count +
    workforce.security_count;

  const updateWorkforce = useCallback((field: keyof typeof workforce, value: number) => {
    setWorkforce((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateSanitization = useCallback((field: keyof typeof sanitization, value: number) => {
    setSanitization((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleSupervisor = (id: string) => {
    setSelectedSupervisors((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const candidateSupervisors = React.useMemo(() => {
    return supervisors.filter((sup) => {
      const assignment = allDailyAssignments.find((a) => a.supervisor_id === sup.id);
      if (!assignment) return true;
      if (assignment.location_id === selectedLocation) return true;
      return false;
    });
  }, [supervisors, allDailyAssignments, selectedLocation]);

  // Live totals for the plan grid, and the one thing the form has to catch
  // itself: the same location listed twice on the HL to VA side, which the
  // unique key on (work_date, location_id) would reject at save time.
  const planHonTotals = React.useMemo(() => {
    return planHonRows.reduce(
      (acc, r) => {
        acc.qty += parseFloat(r.planned_qty) || 0;
        acc.boxes += parseInt(r.boxes, 10) || 0;
        if (r.batch_name.trim() !== '') acc.count += 1;
        return acc;
      },
      { qty: 0, boxes: 0, count: 0 }
    );
  }, [planHonRows]);

  const planVaTotal = React.useMemo(
    () => planVaRows.reduce((sum, r) => sum + (parseFloat(r.planned_qty) || 0), 0),
    [planVaRows]
  );

  // A named batch with no location is an instruction nobody can act on. The
  // registers quietly fall back to the first location for a half-filled row,
  // but a plan is handed to a PPC — sending Batch 3 to the wrong shed because
  // the dropdown was left alone is not a fallback worth having.
  const planHonMissingLocation = React.useMemo(
    () => planHonRows.some((r) => r.batch_name.trim() !== '' && !r.location_id),
    [planHonRows]
  );

  const planVaDuplicates = React.useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    planVaRows.forEach((r) => {
      if (!r.location_id) return;
      if (seen.has(r.location_id)) dupes.add(r.location_id);
      seen.add(r.location_id);
    });
    return dupes;
  }, [planVaRows]);

  const planDateLabel = React.useMemo(() => {
    try {
      return new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const handleSave = () => {
    if (!selectedLocation) return;
    // A popup, not a toast: someone who cannot save has to be stopped and told
    // why, not shown a message that fades while they keep entering the day.
    if (!requireEditDate('daily-entry', selectedDate)) return;
    setIsConfirmSaveModalOpen(true);
  };

  const executeSave = async () => {
    if (!selectedLocation) return;
    setSaving(true);
    try {
      if (activeTab === 'workforce') {
        await saveWorkforce(selectedDate, selectedLocation, {
          ...workforce,
          supervisor_ids: selectedSupervisors,
        });
      } else if (activeTab === 'sanitization') {
        await saveSanitization(selectedDate, selectedLocation, { ...sanitization, notes: sanitizationNotes });
      } else if (activeTab === 'processing') {
        await saveProcessing(selectedDate, selectedLocation, {
          wip_hon_to_headless: Math.max(0, parseFloat(wipHonToHeadless) || 0),
          wip_headless_to_va: Math.max(0, parseFloat(wipHeadlessToVa) || 0),
          notes,
        });
      } else if (activeTab === 'daily_plan') {
        const honRows = planHonRows
          .filter((r) => r.batch_name.trim() !== '')
          .map((r) => ({
            batch_name: r.batch_name,
            count_text: r.count_text,
            planned_qty: Math.max(0, parseFloat(r.planned_qty) || 0),
            boxes: Math.max(0, parseInt(r.boxes, 10) || 0),
            location_id: r.location_id,
          }));
        // A location with nothing against it isn't a plan for that location —
        // it's a row someone started and left. The unique key on
        // (work_date, location_id) rejects a repeated location outright, so the
        // form has to have caught that before we get here.
        const vaRows = planVaRows
          .filter((r) => r.location_id && (parseFloat(r.planned_qty) || 0) > 0)
          .map((r) => ({
            location_id: r.location_id,
            planned_qty: Math.max(0, parseFloat(r.planned_qty) || 0),
          }));
        await savePlan(selectedDate, honRows, vaRows);
        // Only now is there a stored plan to hand out
        setPlanSheetOpen(true);
      } else if (activeTab === 'yield') {
        const validRows = yieldRows
          .filter((r) => r.batch_id.trim() !== '')
          .map((r) => ({
            batch_id: r.batch_id,
            count_text: r.count_text,
            count_range: lookupCountRange(r.count_text) || r.count_range || '',
            hon_kgs: Math.max(0, parseFloat(r.hon_kgs) || 0),
            hl_kgs: Math.max(0, parseFloat(r.hl_kgs) || 0),
            location_id: r.location_id || locations[0]?.id || '',
            grader_name: r.grader_name,
          }));
        await saveYieldEntries(selectedDate, validRows);
      } else if (activeTab === 'non_local_ladies') {
        const validRows = nllRows
          .filter((r) => r.batch_name.trim() !== '')
          .map((r) => ({
            batch_name: r.batch_name,
            no_of_ladies: Math.max(0, parseInt(r.no_of_ladies) || 0),
            hl_qty: Math.max(0, parseFloat(r.hl_qty) || 0),
            pd_qty: Math.max(0, parseFloat(r.pd_qty) || 0),
            per_head_amount: Math.max(0, parseFloat(r.per_head_amount) || 0),
          }));
        await saveNllEntries(selectedDate, validRows, nlLadiesSalaryBasic);
      } else if (activeTab === 'hl_va') {
        const validRows = hlVaRows
          .filter((r) => r.batch_id.trim() !== '')
          .map((r) => ({
            batch_id: r.batch_id,
            count_text: r.count_text,
            variety: r.variety,
            hl_kgs: Math.max(0, parseFloat(r.hl_kgs) || 0),
            va_kgs: Math.max(0, parseFloat(r.va_kgs) || 0),
            location_id: r.location_id || locations[0]?.id || '',
            grader_name: r.grader_name,
          }));
        await saveHlVaEntries(selectedDate, validRows);
      } else if (activeTab === 'grading') {
        const unitKind = new Map(GRADING_UNITS.map((u) => [u.key, u.kind]));
        const validRows = gradingRows
          .map((r) => {
            const isNote = unitKind.get(r.unit_key) === 'note';
            const qty = parseFloat(r.total_grading_qty);
            return {
              unit_key: r.unit_key,
              start_time: isNote || !r.start_time ? null : r.start_time,
              stop_time: isNote || !r.stop_time ? null : r.stop_time,
              total_grading_qty: isNote || !Number.isFinite(qty) ? null : Math.max(0, qty),
              note: isNote ? r.note.trim() || null : null,
            };
          })
          // An untouched unit shouldn't be stored as a row of blanks
          .filter(
            (r) => r.start_time || r.stop_time || r.total_grading_qty !== null || r.note
          );
        await saveGradingEntries(selectedDate, validRows);
      }
      // Audit trail: a non-admin reaching back past yesterday is doing so under
      // an admin-granted window — record it. Never let logging fail the save.
      if (!isAdmin && user && selectedDate < yesterdayIST()) {
        const { error: logError } = await supabase.from('data_edit_log').insert({
          user_id: user.id,
          user_email: user.email,
          page_key: 'daily-entry',
          work_date: selectedDate,
          table_name: activeTab,
          action: 'save',
        });
        if (logError) console.error('Could not write data_edit_log:', logError);
      }

      showToast(`${TAB_LABELS[activeTab]} data saved successfully!`, 'success');
      setIsConfirmSaveModalOpen(false);
    } catch (error) {
      // If the database was the one that refused, name the reason instead of
      // sending the user round the same loop again.
      console.error('Error saving daily entry:', error);
      if (!reportError(error)) showToast('Failed to save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };


  const isDataLoading =
    (activeTab === 'daily_plan' && planLoading) ||
    (activeTab === 'workforce' && (workforceLoading || supervisorsLoading)) ||
    (activeTab === 'sanitization' && sanitizationLoading) ||
    (activeTab === 'processing' && processingLoading) ||
    (activeTab === 'yield' && yieldLoading) ||
    (activeTab === 'non_local_ladies' && nllLoading) ||
    (activeTab === 'hl_va' && hlVaLoading) ||
    (activeTab === 'grading' && gradingLoading);

  // Show loading spinner while locations are loading
  if (locationsLoading) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Daily Entry" />
        <LoadingSpinner />
      </div>
    );
  }

  // Handle empty locations gracefully
  if (locations.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Daily Entry" />
        <div className="px-4 mt-8 text-center">
          <p className="text-gray-500 text-sm">No locations available. Please add locations first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Daily Entry" />

      {/* Date & Location Selectors - Sticky */}
      <div className="sticky top-0 z-10 bg-gray-50 px-4 pb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500"
          />
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 appearance-none"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Why this day can be read but not written */}
        {!editCheck.allowed && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
            <span className="text-sm leading-5 flex-shrink-0" aria-hidden>
              🔒
            </span>
            <p className="text-[11px] font-bold text-amber-700 leading-4">
              Read-only for this date. {editCheck.reason}
            </p>
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="px-4 mt-3">
        {isDataLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* --- Daily Plan Tab ----------------------------------------- */}
            {activeTab === 'daily_plan' && (
              <div className="animate-fade-in space-y-4">
                {/* What this tab is for */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-4 border border-indigo-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">&#128197;</span>
                    <h3 className="text-sm font-semibold text-indigo-800">Daily Plan</h3>
                  </div>
                  <p className="text-xs text-indigo-700">
                    Share the day&apos;s harvest out before processing starts &mdash; which location de-heads
                    which batch, and how much HL each location takes for VA. Covers{' '}
                    <strong>every location</strong>, so the location picker above doesn&apos;t apply here.
                  </p>
                </div>

                {/* HON to HL: batch-wise allocation */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                  <div className="min-w-[620px] p-3">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h3 className="text-sm font-semibold text-gray-700">HON to HL</h3>
                      <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-bold">
                        {planHonTotals.qty.toFixed(3)} kg &middot; {planHonTotals.boxes} boxes
                      </span>
                    </div>

                    {/* Header row */}
                    <div className="grid grid-cols-[140px_90px_110px_80px_140px_32px] gap-1.5 mb-2 px-1 border-b border-gray-100 pb-2">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Batch Name</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Count</span>
                      <span className="text-[10px] font-semibold text-teal-500 uppercase tracking-wider text-right">Quantity (kg)</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Boxes</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Location</span>
                      <span></span>
                    </div>

                    <div className="space-y-1.5">
                      {planHonRows.map((row, idx) => {
                        const update = (field: keyof DailyPlanHonHlFormRow, value: string) =>
                          setPlanHonRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

                        const handleKeyDown = (e: React.KeyboardEvent, colIdx: number) => {
                          let nextRow = idx;
                          let nextCol = colIdx;
                          if (e.key === 'ArrowUp') nextRow = Math.max(0, idx - 1);
                          else if (e.key === 'ArrowDown') nextRow = Math.min(planHonRows.length - 1, idx + 1);
                          else if (e.key === 'ArrowLeft') nextCol = Math.max(0, colIdx - 1);
                          else if (e.key === 'ArrowRight') nextCol = Math.min(4, colIdx + 1);
                          else return;
                          if (nextRow !== idx || nextCol !== colIdx) {
                            e.preventDefault();
                            document.getElementById(`plan-hon-${nextRow}-${nextCol}`)?.focus();
                          }
                        };

                        return (
                          <div key={idx} className="grid grid-cols-[140px_90px_110px_80px_140px_32px] gap-1.5 items-center group">
                            <input
                              id={`plan-hon-${idx}-0`}
                              type="text"
                              value={row.batch_name}
                              onChange={(e) => update('batch_name', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, 0)}
                              placeholder="Batch 2"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            <input
                              id={`plan-hon-${idx}-1`}
                              type="text"
                              value={row.count_text}
                              onChange={(e) => update('count_text', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, 1)}
                              placeholder="30-40"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            <input
                              id={`plan-hon-${idx}-2`}
                              type="number"
                              step="any"
                              min="0"
                              value={row.planned_qty}
                              onChange={(e) => update('planned_qty', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, 2)}
                              placeholder="0.000"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            <input
                              id={`plan-hon-${idx}-3`}
                              type="number"
                              step="1"
                              min="0"
                              value={row.boxes}
                              onChange={(e) => update('boxes', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, 3)}
                              placeholder="0"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            <select
                              id={`plan-hon-${idx}-4`}
                              value={row.location_id}
                              onChange={(e) => update('location_id', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, 4)}
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 appearance-none"
                            >
                              <option value="">PPC</option>
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                            </select>
                            <div className="flex justify-center">
                              {planHonRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setPlanHonRows((prev) => prev.filter((_, i) => i !== idx))}
                                  aria-label="Remove batch"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Running total, so the split is visible while it is being cut */}
                    <div className="grid grid-cols-[140px_90px_110px_80px_140px_32px] gap-1.5 items-center mt-2 pt-2 border-t-2 border-teal-100">
                      <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                        Total &middot; {planHonTotals.count} batch{planHonTotals.count === 1 ? '' : 'es'}
                      </span>
                      <span />
                      <span className="text-xs font-extrabold text-right px-1 text-teal-800">{planHonTotals.qty.toFixed(3)}</span>
                      <span className="text-xs font-extrabold text-right px-1 text-teal-800">{planHonTotals.boxes || '—'}</span>
                      <span />
                      <span />
                    </div>
                  </div>
                </div>

                {planHonMissingLocation && (
                  <p className="text-[11px] font-bold text-rose-600 px-1">
                    Every batch needs a location before the plan can go out.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setPlanHonRows((prev) => [...prev, emptyPlanHonRow()])}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Batch
                </button>

                {/* HL to VA: how much HL each location takes */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">HL to VA</h3>
                    <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold">
                      {planVaTotal.toFixed(3)} kg
                    </span>
                  </div>

                  {planVaRows.length === 0 ? (
                    <p className="text-xs text-gray-400 py-1">
                      No location planned for VA yet &mdash; add one below.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {planVaRows.map((row, idx) => {
                        const duplicate = row.location_id !== '' && planVaDuplicates.has(row.location_id);
                        return (
                          <div key={idx} className="grid grid-cols-[1fr_120px_32px] gap-2 items-center">
                            <select
                              value={row.location_id}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPlanVaRows((prev) => prev.map((r, i) => (i === idx ? { ...r, location_id: val } : r)));
                              }}
                              className={`w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-400/10 appearance-none ${
                                duplicate ? 'border-rose-300 focus:border-rose-400' : 'border-gray-200 focus:border-indigo-400'
                              }`}
                            >
                              <option value="">Select location...</option>
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                            </select>
                            <div className="relative">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={row.planned_qty}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPlanVaRows((prev) => prev.map((r, i) => (i === idx ? { ...r, planned_qty: val } : r)));
                                }}
                                placeholder="0.000"
                                className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/10"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400">kg</span>
                            </div>
                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={() => setPlanVaRows((prev) => prev.filter((_, i) => i !== idx))}
                                aria-label="Remove location"
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* One location cannot be planned two amounts - the database
                      will not take it, so say so before Generate is pressed. */}
                  {planVaDuplicates.size > 0 && (
                    <p className="text-[11px] font-bold text-rose-600">
                      The same location is listed twice. Combine those rows into one.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setPlanVaRows((prev) => [...prev, { location_id: '', planned_qty: '' }])}
                    disabled={planVaRows.length >= locations.length}
                    className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add Location
                  </button>
                </div>

                {/* Generate - saves first, then shows the sheet that goes out */}
                <button
                  onClick={handleSave}
                  disabled={saving || planVaDuplicates.size > 0 || planHonMissingLocation}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Generate Plan'
                  )}
                </button>

                {/* A plan already stored can be re-opened without re-saving */}
                {(planHonHl.length > 0 || planHlVa.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setPlanSheetOpen(true)}
                    className="w-full py-2.5 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    View saved plan sheet
                  </button>
                )}
              </div>
            )}

            {/* Workforce Tab */}
            {activeTab === 'workforce' && (
              <div className="animate-fade-in space-y-4">
                {/* Supervisor Selection - Collapsible Dropdown */}
                <SupervisorDropdown
                  supervisors={candidateSupervisors}
                  selected={selectedSupervisors}
                  onToggle={toggleSupervisor}
                />

                {/* Workforce Numbers */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Headcount</h3>
                    <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-bold">
                      Total: {workforceTotal}
                    </span>
                  </div>

                  {/* Labour — collapsible sub-categories */}
                  <div className="mb-1">
                    <button
                      type="button"
                      onClick={() => setLabourExpanded((v) => !v)}
                      className="w-full flex items-center justify-between py-2.5 px-0 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">Labour</span>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[11px] font-bold">
                          {labourTotal}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-teal-600 transition-colors">
                        <span>{labourExpanded ? 'Collapse' : 'Expand'}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none" viewBox="0 0 24 24"
                          strokeWidth={2} stroke="currentColor"
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${labourExpanded ? 'rotate-180' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>

                    {/* Sub-category steppers */}
                    {labourExpanded && (
                      <div className="ml-3 pl-3 border-l-2 border-indigo-100 space-y-3 mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Labour Categories</p>
                        </div>
                        <NumberStepper
                          label="KG Basic"
                          value={workforce.labour_kg_basic}
                          onChange={(v) => updateWorkforce('labour_kg_basic', v)}
                        />
                        <NumberStepper
                          label="Daily Wage"
                          value={workforce.labour_daily_wage}
                          onChange={(v) => updateWorkforce('labour_daily_wage', v)}
                        />
                        <NumberStepper
                          label="Company Labour"
                          value={workforce.labour_company}
                          onChange={(v) => updateWorkforce('labour_company', v)}
                        />
                        <NumberStepper
                          label="Non Locals"
                          value={workforce.labour_non_locals}
                          onChange={(v) => updateWorkforce('labour_non_locals', v)}
                        />
                        {/* Labour sub-total banner */}
                        <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-3 py-2">
                          <span className="text-xs font-semibold text-indigo-600">Labour Sub-total</span>
                          <span className="text-sm font-bold text-indigo-700">{labourTotal}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-100 pt-2 space-y-3">
                    <NumberStepper label="Boys" value={workforce.boys_count} onChange={(v) => updateWorkforce('boys_count', v)} />
                    <NumberStepper label="Waste Checking" value={workforce.checking_waste} onChange={(v) => updateWorkforce('checking_waste', v)} />
                    <NumberStepper label="PD Checking" value={workforce.checking_pd} onChange={(v) => updateWorkforce('checking_pd', v)} />
                    <NumberStepper label="Cleaning" value={workforce.cleaning_count} onChange={(v) => updateWorkforce('cleaning_count', v)} />
                    <NumberStepper label="QC" value={workforce.qc_count} onChange={(v) => updateWorkforce('qc_count', v)} />
                    <NumberStepper label="Security" value={workforce.security_count} onChange={(v) => updateWorkforce('security_count', v)} />
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Workforce Data'
                  )}
                </button>
              </div>
            )}

            {/* Sanitization Tab */}
            {activeTab === 'sanitization' && (
              <div className="animate-fade-in space-y-4">
                {/* Sanitization Labour (Headcount) */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Sanitization Labour (Headcount)</h3>
                  <NumberStepper label="Outside Cleaning" value={sanitization.outside_cleaning} onChange={(v) => updateSanitization('outside_cleaning', v)} />
                  <NumberStepper label="Local Crates Wash" value={sanitization.local_crates_wash} onChange={(v) => updateSanitization('local_crates_wash', v)} />
                  <NumberStepper label="Company Crates Wash" value={sanitization.company_crates_wash} onChange={(v) => updateSanitization('company_crates_wash', v)} />
                  <NumberStepper label="Washroom Cleaning" value={sanitization.washroom_cleaning} onChange={(v) => updateSanitization('washroom_cleaning', v)} />
                  <NumberStepper label="Grading Machine" value={sanitization.grading_machine_cleaning} onChange={(v) => updateSanitization('grading_machine_cleaning', v)} />
                </div>

                {/* Cleaned Quantity */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Cleaned Quantity</h3>
                  <NumberStepper label="Crates Cleaning" value={sanitization.crates_cleaning} onChange={(v) => updateSanitization('crates_cleaning', v)} />
                  <NumberStepper label="Nets Cleaning" value={sanitization.nets_cleaning} onChange={(v) => updateSanitization('nets_cleaning', v)} />

                  {/* Day Note (optional) */}
                  <div className="pt-1">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Notes (optional)</label>
                    <textarea
                      value={sanitizationNotes}
                      onChange={(e) => setSanitizationNotes(e.target.value)}
                      rows={3}
                      placeholder="Anything to note about this day…"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 resize-none"
                    />
                  </div>
                </div>

                {/* Chemical Consumption */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Chemical Consumption</h3>
                  
                  {/* PPC */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-teal-600 uppercase tracking-wide">🏢 PPC (Pre Processing Center)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Chlorine PPC</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.chlorine_ppc || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('chlorine_ppc', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Soap Oil PPC</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.soap_oil_ppc || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('soap_oil_ppc', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Crates */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-teal-600 uppercase tracking-wide">📦 Crates Cleaning</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Chlorine Crates</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.chlorine_crates || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('chlorine_crates', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Soap Oil Crates</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.soap_oil_crates || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('soap_oil_crates', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Washrooms */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-teal-600 uppercase tracking-wide">🚾 Washrooms Cleaning</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Chlorine Washrooms</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.chlorine_washrooms || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('chlorine_washrooms', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Soap Oil Washrooms</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.soap_oil_washrooms || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('soap_oil_washrooms', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grading Machine */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-teal-600 uppercase tracking-wide">⚙️ Grading Machine Cleaning</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Chlorine Grading Machine</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.chlorine_grading_machine || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('chlorine_grading_machine', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Soap Oil Grading Machine</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={sanitization.soap_oil_grading_machine || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSanitization('soap_oil_grading_machine', isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 pr-10"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">L</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Essentials */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Essentials</h3>
                  <NumberStepper label="Gloves (pcs)" value={sanitization.gloves} onChange={(v) => updateSanitization('gloves', v)} />
                  <NumberStepper label="Head Cap" value={sanitization.head_cap} onChange={(v) => updateSanitization('head_cap', v)} />
                  <NumberStepper label="Masks" value={sanitization.masks} onChange={(v) => updateSanitization('masks', v)} />
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Sanitization Data'
                  )}
                </button>
              </div>
            )}

            {/* Processing Tab */}
            {activeTab === 'processing' && (
              <div className="animate-fade-in space-y-4">
                {/* Context Card */}
                <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-2xl p-4 border border-teal-200">
                  <h3 className="text-sm font-semibold text-teal-700 mb-3">Monthly Overview</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-teal-600">Monthly Target</p>
                      <p className="text-lg font-bold text-teal-800">— kg</p>
                      <p className="text-[10px] text-teal-500">Set on Targets page</p>
                    </div>
                    <div>
                      <p className="text-xs text-teal-600">Processed So Far</p>
                      <p className="text-lg font-bold text-teal-800">{monthlyTotal.toFixed(3)} kg</p>
                    </div>
                  </div>
                </div>

                {/* Processing KGs card — the two Work In Process readings.
                    Completed HON→HL and HL→VA are no longer keyed in here: they
                    are the HONS TO HL and HL to VA registers' own totals, and
                    the database now derives them from those tabs. */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Processing KGs</h3>
                    <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-bold">
                      WIP Total: {((parseFloat(wipHonToHeadless) || 0) + (parseFloat(wipHeadlessToVa) || 0)).toFixed(3)} kg
                    </span>
                  </div>

                  {/* ── Work In Process Group ── */}
                  <div className="bg-purple-50 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-purple-600 uppercase tracking-wide">🔄 Work In Process</p>

                    {/* WIP HON to Headless */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        WIP — HON to Headless
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={wipHonToHeadless}
                          onChange={(e) => setWipHonToHeadless(e.target.value)}
                          placeholder="0.000"
                          className="w-full px-4 py-3.5 bg-white border border-purple-200 rounded-xl text-gray-900 text-lg font-semibold placeholder-gray-400 focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-400/10 pr-12"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">kg</span>
                      </div>
                    </div>

                    {/* WIP Headless to VA */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        WIP — Headless to VA
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={wipHeadlessToVa}
                          onChange={(e) => setWipHeadlessToVa(e.target.value)}
                          placeholder="0.000"
                          className="w-full px-4 py-3.5 bg-white border border-purple-200 rounded-xl text-gray-900 text-lg font-semibold placeholder-gray-400 focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-400/10 pr-12"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">kg</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    Completed quantities come from the <span className="font-semibold text-gray-600">HONS TO HL</span> and{' '}
                    <span className="font-semibold text-gray-600">HL to VA</span> tabs — no need to enter them again here.
                  </p>
                </div>

                {/* Notes */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any notes for today's processing..."
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 resize-none"
                  />
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Processing Data'
                  )}
                </button>
              </div>
            )}

            {/* ─── Yield Tab ─────────────────────────────────────────────── */}
            {activeTab === 'yield' && (
              <div className="animate-fade-in space-y-4">
                {/* Standard Yield Reference Chart */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('yield-chart-panel');
                      if (el) el.classList.toggle('hidden');
                    }}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📊</span>
                      <span className="text-sm font-semibold text-gray-700">Standard Yield Chart</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <div id="yield-chart-panel" className="hidden mt-3 border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      {YIELD_CHART.map((entry) => (
                        <div key={entry.label} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <span className="text-xs font-medium text-gray-600">{entry.label}</span>
                          <span className="text-xs font-bold text-teal-700">{entry.standardYield.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Yield Grid */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                  <div className="min-w-[860px] p-3">
                    {/* Header row */}
                    <div className="grid grid-cols-[120px_100px_90px_90px_120px_120px_60px_60px_70px_32px] gap-1.5 mb-2 px-1 border-b border-gray-100 pb-2">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Batch ID</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Count</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">HON (KGS)</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">HL (KGS)</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Location</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Grader</span>
                      <span className="text-[10px] font-semibold text-teal-500 uppercase tracking-wider text-right">Yield</span>
                      <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider text-right">Std %</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Diff</span>
                      <span></span>
                    </div>

                    {/* Batch rows */}
                    <div className="space-y-1.5">
                      {yieldRows.map((row, idx) => {
                        const honNum = parseFloat(row.hon_kgs) || 0;
                        const hlNum = parseFloat(row.hl_kgs) || 0;
                        const yieldPct = calculateYield(honNum, hlNum);
                        const stdYield = lookupStandardYield(row.count_text);
                        const yieldDiff = calculateYieldDifference(yieldPct, stdYield);
                        
                        const handleKeyDown = (e: React.KeyboardEvent, colIdx: number) => {
                          let nextRow = idx;
                          let nextCol = colIdx;
                          if (e.key === 'ArrowUp') nextRow = Math.max(0, idx - 1);
                          else if (e.key === 'ArrowDown') nextRow = Math.min(yieldRows.length - 1, idx + 1);
                          else if (e.key === 'ArrowLeft') nextCol = Math.max(0, colIdx - 1);
                          else if (e.key === 'ArrowRight') nextCol = Math.min(5, colIdx + 1);
                          else return;
                          
                          if (nextRow !== idx || nextCol !== colIdx) {
                            e.preventDefault();
                            const nextId = `yield-${nextRow}-${nextCol}`;
                            document.getElementById(nextId)?.focus();
                          }
                        };

                        return (
                          <div key={idx} className="grid grid-cols-[120px_100px_90px_90px_120px_120px_60px_60px_70px_32px] gap-1.5 items-center group">
                            {/* Batch ID */}
                            <input
                              id={`yield-${idx}-0`}
                              type="text"
                              value={row.batch_id}
                              onChange={(e) => setYieldRows((prev) => prev.map((r, i) => i === idx ? { ...r, batch_id: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 0)}
                              placeholder="Batch ID"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* Count */}
                            <input
                              id={`yield-${idx}-1`}
                              type="text"
                              value={row.count_text}
                              onChange={(e) => {
                                const val = e.target.value;
                                setYieldRows((prev) => prev.map((r, i) => i === idx ? { ...r, count_text: val, count_range: lookupCountRange(val) || '' } : r));
                              }}
                              onKeyDown={(e) => handleKeyDown(e, 1)}
                              placeholder="Count"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* HON */}
                            <input
                              id={`yield-${idx}-2`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              value={row.hon_kgs}
                              onChange={(e) => setYieldRows((prev) => prev.map((r, i) => i === idx ? { ...r, hon_kgs: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 2)}
                              placeholder="0.000"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* HL */}
                            <input
                              id={`yield-${idx}-3`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              value={row.hl_kgs}
                              onChange={(e) => setYieldRows((prev) => prev.map((r, i) => i === idx ? { ...r, hl_kgs: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 3)}
                              placeholder="0.000"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* Location */}
                            <select
                              id={`yield-${idx}-4`}
                              value={row.location_id}
                              onChange={(e) => setYieldRows((prev) => prev.map((r, i) => i === idx ? { ...r, location_id: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 4)}
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 focus:border-teal-500 appearance-none"
                            >
                              <option value="">Location...</option>
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                            </select>
                            {/* Grader Name */}
                            <input
                              id={`yield-${idx}-5`}
                              type="text"
                              value={row.grader_name}
                              onChange={(e) => setYieldRows((prev) => prev.map((r, i) => i === idx ? { ...r, grader_name: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 5)}
                              placeholder="Name"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            
                            {/* Calculated Values */}
                            <span className="text-[11px] font-bold text-right px-1 text-teal-700">{yieldPct !== null ? `${yieldPct.toFixed(2)}%` : '-'}</span>
                            <span className="text-[11px] font-bold text-right px-1 text-purple-700">{stdYield !== null ? `${stdYield.toFixed(2)}%` : '-'}</span>
                            <span className={`text-[11px] font-bold text-right px-1 ${yieldDiff !== null && yieldDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {yieldDiff !== null ? `${yieldDiff >= 0 ? '+' : ''}${yieldDiff.toFixed(2)}%` : '-'}
                            </span>
                            
                            {/* Action */}
                            <div className="flex justify-end pr-1">
                              {yieldRows.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setYieldRows((prev) => prev.filter((_, i) => i !== idx))}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setYieldRows([emptyYieldRow()])}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Running totals — sits under the last row so the sums are
                        visible while another batch is being added. */}
                    {(() => {
                      const totalHon = yieldRows.reduce((s, r) => s + (parseFloat(r.hon_kgs) || 0), 0);
                      const totalHl = yieldRows.reduce((s, r) => s + (parseFloat(r.hl_kgs) || 0), 0);
                      const overall = calculateYield(totalHon, totalHl);
                      const filled = yieldRows.filter((r) => parseFloat(r.hon_kgs) > 0 || parseFloat(r.hl_kgs) > 0).length;
                      return (
                        <div className="grid grid-cols-[120px_100px_90px_90px_120px_120px_60px_60px_70px_32px] gap-1.5 items-center mt-2 pt-2 border-t-2 border-teal-100">
                          <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                            Total · {filled} batch{filled === 1 ? '' : 'es'}
                          </span>
                          <span />
                          <span className="text-xs font-extrabold text-right px-1 text-teal-800">{totalHon.toFixed(3)}</span>
                          <span className="text-xs font-extrabold text-right px-1 text-teal-800">{totalHl.toFixed(3)}</span>
                          <span />
                          <span />
                          <span className="text-[11px] font-extrabold text-right px-1 text-teal-700">
                            {overall !== null ? `${overall.toFixed(2)}%` : '-'}
                          </span>
                          <span />
                          <span />
                          <span />
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Add Batch Button */}
                <button
                  type="button"
                  onClick={() => setYieldRows((prev) => [...prev, emptyYieldRow()])}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Batch
                </button>

                {/* Totals Banner */}
                {yieldRows.some((r) => parseFloat(r.hon_kgs) > 0 || parseFloat(r.hl_kgs) > 0) && (
                  <div className="bg-gradient-to-r from-teal-50 to-teal-100/50 rounded-2xl p-4 border border-teal-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📋</span>
                      <span className="text-sm font-semibold text-teal-700">Totals</span>
                      <span className="ml-auto px-2 py-0.5 bg-teal-600 text-white rounded-full text-[10px] font-bold">
                        {yieldRows.filter((r) => r.batch_id.trim() !== '').length} batches
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/70 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[10px] text-teal-600 font-medium uppercase tracking-wide">Total HON</p>
                        <p className="text-lg font-bold text-teal-800">
                          {yieldRows.reduce((sum, r) => sum + (parseFloat(r.hon_kgs) || 0), 0).toFixed(1)} kg
                        </p>
                      </div>
                      <div className="bg-white/70 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[10px] text-teal-600 font-medium uppercase tracking-wide">Total HL</p>
                        <p className="text-lg font-bold text-teal-800">
                          {yieldRows.reduce((sum, r) => sum + (parseFloat(r.hl_kgs) || 0), 0).toFixed(1)} kg
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Yield Data'
                  )}
                </button>
              </div>
            )}

            {/* ─── Non Local Ladies Tab ──────────────────────────────────── */}
            {activeTab === 'non_local_ladies' && (
              <div className="animate-fade-in space-y-4">

                {/* Info Card */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl p-4 border border-amber-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">👩</span>
                    <h3 className="text-sm font-semibold text-amber-800">Company Ladies</h3>
                  </div>
                  <p className="text-xs text-amber-700">Salary Basic is <strong>₹{SALARY_BASIC.toFixed(2)}</strong> (admin sets it in Reports &amp; Settings). Difference and Profit &amp; Loss are auto-calculated.</p>
                </div>

                {/* NL Ladies Grid */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                  <div className="min-w-[800px] p-3">
                    {/* Header row */}
                    <div className="grid grid-cols-[140px_80px_80px_80px_80px_100px_80px_80px_80px_32px] gap-1.5 mb-2 px-1 border-b border-gray-100 pb-2">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Contractor</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Ladies</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">HL QTY</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">PD QTY</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Total</span>
                      <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider text-right">₹/Head</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Basic</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Diff</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">P&L</span>
                      <span></span>
                    </div>

                    {/* Batch rows */}
                    <div className="space-y-1.5">
                      {nllRows.map((row, idx) => {
                        const noLadies = parseInt(row.no_of_ladies) || 0;
                        const hlQty = parseFloat(row.hl_qty) || 0;
                        const pdQty = parseFloat(row.pd_qty) || 0;
                        const perHead = parseFloat(row.per_head_amount) || 0;
                        const totalQty = hlQty + pdQty;
                        const diff = perHead > 0 ? perHead - SALARY_BASIC : null;
                        const pnl = diff !== null ? diff * noLadies : null;
                        
                        const handleKeyDown = (e: React.KeyboardEvent, colIdx: number) => {
                          let nextRow = idx;
                          let nextCol = colIdx;
                          if (e.key === 'ArrowUp') nextRow = Math.max(0, idx - 1);
                          else if (e.key === 'ArrowDown') nextRow = Math.min(nllRows.length - 1, idx + 1);
                          else if (e.key === 'ArrowLeft') nextCol = Math.max(0, colIdx - 1);
                          else if (e.key === 'ArrowRight') nextCol = Math.min(4, colIdx + 1);
                          else return;
                          
                          if (nextRow !== idx || nextCol !== colIdx) {
                            e.preventDefault();
                            const nextId = `nll-${nextRow}-${nextCol}`;
                            document.getElementById(nextId)?.focus();
                          }
                        };

                        return (
                          <div key={idx} className="grid grid-cols-[140px_80px_80px_80px_80px_100px_80px_80px_80px_32px] gap-1.5 items-center group">
                            <input
                              id={`nll-${idx}-0`}
                              type="text"
                              value={row.batch_name}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, batch_name: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 0)}
                              placeholder="Contractor"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"
                            />
                            <input
                              id={`nll-${idx}-1`}
                              type="number"
                              inputMode="numeric"
                              min="0"
                              value={row.no_of_ladies}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, no_of_ladies: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 1)}
                              placeholder="0"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"
                            />
                            <input
                              id={`nll-${idx}-2`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              min="0"
                              value={row.hl_qty}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, hl_qty: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 2)}
                              placeholder="0"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"
                            />
                            <input
                              id={`nll-${idx}-3`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              min="0"
                              value={row.pd_qty}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, pd_qty: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 3)}
                              placeholder="0"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"
                            />
                            {/* Total QTY (moved before ₹/Head) */}
                            <span className="text-[11px] font-bold text-right px-1 text-gray-700">{totalQty > 0 ? totalQty.toFixed(1) : '-'}</span>

                            <input
                              id={`nll-${idx}-4`}
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={row.per_head_amount}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, per_head_amount: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 4)}
                              placeholder="0.00"
                              className="w-full px-2 py-2 bg-amber-50/50 border border-amber-200 rounded-lg text-xs text-amber-900 text-right placeholder-amber-400 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
                            />
                            
                            {/* Auto calculations continued */}
                            <span className="text-[11px] font-bold text-right px-1 text-gray-500">₹{SALARY_BASIC}</span>
                            <span className={`text-[11px] font-bold text-right px-1 ${diff !== null && diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}` : '-'}
                            </span>
                            <span className={`text-[11px] font-bold text-right px-1 ${pnl !== null && pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {pnl !== null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}` : '-'}
                            </span>
                            
                            {/* Action */}
                            <div className="flex justify-end pr-1">
                              {nllRows.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setNllRows((prev) => prev.filter((_, i) => i !== idx))}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setNllRows([emptyNllRow()])}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Running totals. Only the additive columns are summed —
                        ₹/Head, Basic and Diff are per-head rates, so a sum of
                        them would be a meaningless number. */}
                    {(() => {
                      const totalLadies = nllRows.reduce((s, r) => s + (parseInt(r.no_of_ladies) || 0), 0);
                      const totalHl = nllRows.reduce((s, r) => s + (parseFloat(r.hl_qty) || 0), 0);
                      const totalPd = nllRows.reduce((s, r) => s + (parseFloat(r.pd_qty) || 0), 0);
                      const totalPnl = nllRows.reduce((s, r) => {
                        const perHead = parseFloat(r.per_head_amount) || 0;
                        const ladies = parseInt(r.no_of_ladies) || 0;
                        return perHead > 0 ? s + (perHead - SALARY_BASIC) * ladies : s;
                      }, 0);
                      const filled = nllRows.filter((r) => (parseInt(r.no_of_ladies) || 0) > 0).length;
                      return (
                        <div className="grid grid-cols-[140px_80px_80px_80px_80px_100px_80px_80px_80px_32px] gap-1.5 items-center mt-2 pt-2 border-t-2 border-amber-100">
                          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                            Total · {filled} contractor{filled === 1 ? '' : 's'}
                          </span>
                          <span className="text-xs font-extrabold text-right px-1 text-amber-800">{totalLadies}</span>
                          <span className="text-xs font-extrabold text-right px-1 text-amber-800">{totalHl.toFixed(3)}</span>
                          <span className="text-xs font-extrabold text-right px-1 text-amber-800">{totalPd.toFixed(3)}</span>
                          <span className="text-xs font-extrabold text-right px-1 text-amber-800">{(totalHl + totalPd).toFixed(3)}</span>
                          <span />
                          <span />
                          <span />
                          <span className={`text-xs font-extrabold text-right px-1 ${totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)}
                          </span>
                          <span />
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Add Contractor Button */}
                <button
                  type="button"
                  onClick={() => setNllRows((prev) => [...prev, emptyNllRow()])}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Contractor
                </button>

                {/* Save Button */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold rounded-xl shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Company Ladies Data'
                  )}
                </button>
              </div>
            )}

            {/* ─── HL to VA Tab ──────────────────────────────────────────── */}
            {activeTab === 'hl_va' && (
              <div className="animate-fade-in space-y-4">

                {/* Info Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-4 border border-indigo-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📦</span>
                    <h3 className="text-sm font-semibold text-indigo-800">HL to VA</h3>
                  </div>
                  <p className="text-xs text-indigo-700">Enter batch-wise HL to VA quantities. Grade is auto-picked from Count, and Std % from the standard chart based on Count and Variety. Yield = VA / HL x 100.</p>
                </div>

                {/* HL to VA Grid */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                  <div className="min-w-[1080px] p-3">
                    {/* Header row */}
                    <div className="grid grid-cols-[110px_90px_95px_85px_85px_110px_80px_100px_60px_60px_70px_32px] gap-1.5 mb-2 px-1 border-b border-gray-100 pb-2">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Batch ID</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Count</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Variety</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">HL (KGS)</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">VA (KGS)</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Location</span>
                      <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider text-center">Grade</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Grader Name</span>
                      <span className="text-[10px] font-semibold text-teal-500 uppercase tracking-wider text-right">Yield</span>
                      <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider text-right">Std %</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Diff</span>
                      <span></span>
                    </div>

                    {/* Batch rows */}
                    <div className="space-y-1.5">
                      {hlVaRows.map((row, idx) => {
                        const hlNum = parseFloat(row.hl_kgs) || 0;
                        const vaNum = parseFloat(row.va_kgs) || 0;
                        const yieldPct = calculateYield(hlNum, vaNum);
                        const stdYield = lookupHlVaStandardYield(row.count_text, row.variety);
                        const grade = lookupHlVaCountRange(row.count_text);
                        const yieldDiff = calculateYieldDifference(yieldPct, stdYield);

                        const handleKeyDown = (e: React.KeyboardEvent, colIdx: number) => {
                          let nextRow = idx;
                          let nextCol = colIdx;
                          if (e.key === 'ArrowUp') nextRow = Math.max(0, idx - 1);
                          else if (e.key === 'ArrowDown') nextRow = Math.min(hlVaRows.length - 1, idx + 1);
                          else if (e.key === 'ArrowLeft') nextCol = Math.max(0, colIdx - 1);
                          else if (e.key === 'ArrowRight') nextCol = Math.min(6, colIdx + 1);
                          else return;

                          if (nextRow !== idx || nextCol !== colIdx) {
                            e.preventDefault();
                            const nextId = `hlva-${nextRow}-${nextCol}`;
                            document.getElementById(nextId)?.focus();
                          }
                        };

                        return (
                          <div key={idx} className="grid grid-cols-[110px_90px_95px_85px_85px_110px_80px_100px_60px_60px_70px_32px] gap-1.5 items-center group">
                            {/* Batch ID */}
                            <input
                              id={`hlva-${idx}-0`}
                              type="text"
                              value={row.batch_id}
                              onChange={(e) => setHlVaRows((prev) => prev.map((r, i) => i === idx ? { ...r, batch_id: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 0)}
                              placeholder="Batch ID"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* Count */}
                            <input
                              id={`hlva-${idx}-1`}
                              type="text"
                              value={row.count_text}
                              onChange={(e) => setHlVaRows((prev) => prev.map((r, i) => i === idx ? { ...r, count_text: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 1)}
                              placeholder="Count"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* Variety */}
                            <select
                              id={`hlva-${idx}-2`}
                              value={row.variety}
                              onChange={(e) => setHlVaRows((prev) => prev.map((r, i) => i === idx ? { ...r, variety: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 2)}
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 focus:border-teal-500 appearance-none"
                            >
                              <option value="">Variety...</option>
                              {VA_VARIETIES.map((v) => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                            {/* HL (KGS) */}
                            <input
                              id={`hlva-${idx}-3`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              value={row.hl_kgs}
                              onChange={(e) => setHlVaRows((prev) => prev.map((r, i) => i === idx ? { ...r, hl_kgs: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 3)}
                              placeholder="0.000"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* VA (KGS) */}
                            <input
                              id={`hlva-${idx}-4`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              value={row.va_kgs}
                              onChange={(e) => setHlVaRows((prev) => prev.map((r, i) => i === idx ? { ...r, va_kgs: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 4)}
                              placeholder="0.000"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />
                            {/* Location */}
                            <select
                              id={`hlva-${idx}-5`}
                              value={row.location_id}
                              onChange={(e) => setHlVaRows((prev) => prev.map((r, i) => i === idx ? { ...r, location_id: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 5)}
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 focus:border-teal-500 appearance-none"
                            >
                              <option value="">Location...</option>
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                            </select>
                            {/* Grade (auto from count) */}
                            <span className={`text-[11px] font-bold text-center px-1 py-1.5 rounded-lg ${grade ? 'bg-indigo-50 text-indigo-700' : 'text-gray-300'}`}>
                              {grade || '-'}
                            </span>
                            {/* Grader Name */}
                            <input
                              id={`hlva-${idx}-6`}
                              type="text"
                              value={row.grader_name}
                              onChange={(e) => setHlVaRows((prev) => prev.map((r, i) => i === idx ? { ...r, grader_name: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 6)}
                              placeholder="Name"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                            />

                            {/* Calculated Values */}
                            <span className="text-[11px] font-bold text-right px-1 text-teal-700">{yieldPct !== null ? `${yieldPct.toFixed(2)}%` : '-'}</span>
                            <span className="text-[11px] font-bold text-right px-1 text-purple-700">{stdYield !== null ? `${stdYield.toFixed(2)}%` : '-'}</span>
                            <span className={`text-[11px] font-bold text-right px-1 ${yieldDiff !== null && yieldDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {yieldDiff !== null ? `${yieldDiff >= 0 ? '+' : ''}${yieldDiff.toFixed(2)}%` : '-'}
                            </span>

                            {/* Action */}
                            <div className="flex justify-end pr-1">
                              {hlVaRows.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setHlVaRows((prev) => prev.filter((_, i) => i !== idx))}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setHlVaRows([emptyHlVaRow()])}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Running totals — kept in the grid so each sum sits under
                        the column it belongs to as more batches are added. */}
                    {(() => {
                      const totalHl = hlVaRows.reduce((s, r) => s + (parseFloat(r.hl_kgs) || 0), 0);
                      const totalVa = hlVaRows.reduce((s, r) => s + (parseFloat(r.va_kgs) || 0), 0);
                      const overall = calculateYield(totalHl, totalVa);
                      const filled = hlVaRows.filter((r) => parseFloat(r.hl_kgs) > 0 || parseFloat(r.va_kgs) > 0).length;
                      return (
                        <div className="grid grid-cols-[110px_90px_95px_85px_85px_110px_80px_100px_60px_60px_70px_32px] gap-1.5 items-center mt-2 pt-2 border-t-2 border-indigo-100">
                          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                            Total · {filled} batch{filled === 1 ? '' : 'es'}
                          </span>
                          <span />
                          <span />
                          <span className="text-xs font-extrabold text-right px-1 text-indigo-800">{totalHl.toFixed(3)}</span>
                          <span className="text-xs font-extrabold text-right px-1 text-indigo-800">{totalVa.toFixed(3)}</span>
                          <span />
                          <span />
                          <span />
                          <span className="text-[11px] font-extrabold text-right px-1 text-teal-700">
                            {overall !== null ? `${overall.toFixed(2)}%` : '-'}
                          </span>
                          <span />
                          <span />
                          <span />
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Add Batch Button */}
                <button
                  type="button"
                  onClick={() => setHlVaRows((prev) => [...prev, emptyHlVaRow()])}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Batch
                </button>

                {/* Totals Banner */}
                {hlVaRows.some((r) => parseFloat(r.hl_kgs) > 0 || parseFloat(r.va_kgs) > 0) && (
                  <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 rounded-2xl p-4 border border-indigo-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📋</span>
                      <span className="text-sm font-semibold text-indigo-700">Totals</span>
                      <span className="ml-auto px-2 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold">
                        {hlVaRows.filter((r) => r.batch_id.trim() !== '').length} batches
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/70 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[10px] text-indigo-600 font-medium uppercase tracking-wide">Total HL</p>
                        <p className="text-lg font-bold text-indigo-800">
                          {hlVaRows.reduce((sum, r) => sum + (parseFloat(r.hl_kgs) || 0), 0).toFixed(1)} kg
                        </p>
                      </div>
                      <div className="bg-white/70 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[10px] text-indigo-600 font-medium uppercase tracking-wide">Total VA</p>
                        <p className="text-lg font-bold text-indigo-800">
                          {hlVaRows.reduce((sum, r) => sum + (parseFloat(r.va_kgs) || 0), 0).toFixed(1)} kg
                        </p>
                      </div>
                      <div className="bg-white/70 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[10px] text-indigo-600 font-medium uppercase tracking-wide">Overall Yield</p>
                        <p className="text-lg font-bold text-indigo-800">
                          {(() => {
                            const totalHl = hlVaRows.reduce((sum, r) => sum + (parseFloat(r.hl_kgs) || 0), 0);
                            const totalVa = hlVaRows.reduce((sum, r) => sum + (parseFloat(r.va_kgs) || 0), 0);
                            return totalHl > 0 ? `${((totalVa / totalHl) * 100).toFixed(2)}%` : '-';
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save HL to VA Data'
                  )}
                </button>
              </div>
            )}

            {activeTab === 'grading' && (
              <div className="space-y-4">
                <div className="bg-sky-50 rounded-2xl px-4 py-3 border border-sky-100">
                  <p className="text-xs font-semibold text-sky-700">All PPC&apos;s Grading Data</p>
                  <p className="text-[11px] text-sky-600 mt-0.5">
                    Covers every PPC in one register, so the location selector above doesn&apos;t
                    apply here. Running hours are worked out from the times you enter.
                  </p>
                </div>

                {GRADING_UNITS.map((unit) => {
                  const row = gradingRows.find((r) => r.unit_key === unit.key);
                  if (!row) return null;

                  const update = (field: keyof GradingFormRow, value: string) =>
                    setGradingRows((prev) =>
                      prev.map((r) => (r.unit_key === unit.key ? { ...r, [field]: value } : r))
                    );

                  const hours = runningHours(row.start_time, row.stop_time);

                  return (
                    <div
                      key={unit.key}
                      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-700">{unit.label}</h3>
                        {unit.kind === 'machine' && hours !== null && (
                          <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-[10px] font-bold whitespace-nowrap">
                            {formatHours(hours)}
                          </span>
                        )}
                      </div>

                      {unit.kind === 'note' ? (
                        <input
                          type="text"
                          value={row.note}
                          onChange={(e) => update('note', e.target.value)}
                          placeholder="e.g. 08 AM TO 8.05PM - 6 BOYS"
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                        />
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                Start Time
                              </label>
                              <input
                                type="time"
                                value={row.start_time}
                                onChange={(e) => update('start_time', e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                Stop Time
                              </label>
                              <input
                                type="time"
                                value={row.stop_time}
                                onChange={(e) => update('stop_time', e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                              Total Grading Qty (kg)
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.001"
                              value={row.total_grading_qty}
                              onChange={(e) => update('total_grading_qty', e.target.value)}
                              placeholder="0.000"
                              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-semibold rounded-xl shadow-lg shadow-sky-600/25 transition-all disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Grading Data'
                  )}
                </button>
              </div>
            )}

          </>
        )}
      </div>

      {/* Bottom spacing */}
      <div className="h-6" />

      {/* Save Confirmation Modal */}
      <Modal
        isOpen={isConfirmSaveModalOpen}
        onClose={() => !saving && setIsConfirmSaveModalOpen(false)}
        title="Confirm Save Date"
      >
        <div className="space-y-4">
          <div className="p-3 bg-teal-50 text-teal-800 text-sm rounded-xl border border-teal-100 font-medium dark:bg-teal-950/20 dark:text-teal-300 dark:border-teal-900/30">
            You are saving <strong>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</strong> data for the following date:
            <div className="text-lg font-bold text-teal-650 dark:text-teal-400 mt-1">
              {new Date(selectedDate).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Please confirm that this is the correct date for your entries before saving.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsConfirmSaveModalOpen(false)}
              disabled={saving}
              className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px] dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={executeSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
            >
              {saving ? (
                <>
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Confirm & Save'
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* The generated plan, ready to print, export or send on */}
      <Modal
        isOpen={planSheetOpen}
        onClose={() => setPlanSheetOpen(false)}
        title="Daily Plan"
      >
        <DailyPlanSheet
          honHl={planHonHl}
          hlVa={planHlVa}
          date={selectedDate}
          dateLabel={planDateLabel}
        />
      </Modal>
    </div>
  );
}

'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import NumberStepper from '@/components/ui/NumberStepper';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { useLocations } from '@/hooks/useLocations';
import { useWorkforce } from '@/hooks/useWorkforce';
import { useSanitization } from '@/hooks/useSanitization';
import { useProcessing } from '@/hooks/useProcessing';
import { useSupervisors } from '@/hooks/useSupervisors';
import { useAuth } from '@/hooks/useAuth';
import { useYield } from '@/hooks/useYield';
import { useNonLocalLadies } from '@/hooks/useNonLocalLadies';
import { useGradesVa } from '@/hooks/useGradesVa';
import { lookupStandardYield, lookupCountRange, calculateYield, calculateYieldDifference, YIELD_CHART } from '@/lib/yieldChart';
import { VA_GRADES, VA_COLUMNS } from '@/lib/gradesVa';
import type { Supervisor, TabType, YieldFormRow, NonLocalLadyFormRow, GradesVaFormRow } from '@/types';

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
  const { isSubUser } = useAuth();
  const TODAY = new Date().toISOString().split('T')[0];
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('workforce');
  const [saving, setSaving] = useState(false);
  const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);

  // Sub-users: restrict date to today or yesterday only.
  // If the current selection is outside that window, snap it back to today.
  useEffect(() => {
    if (isSubUser && selectedDate !== TODAY && selectedDate !== YESTERDAY) {
      setSelectedDate(TODAY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubUser, selectedDate]);


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
    entries: gvaEntries,
    loading: gvaLoading,
    fetchEntries: fetchGvaEntries,
    saveEntries: saveGvaEntries,
  } = useGradesVa();

  const SALARY_BASIC = 350;

  // Workforce form state
  const [workforce, setWorkforce] = useState({
    labour_kg_basic: 0,
    labour_daily_wage: 0,
    labour_company: 0,
    labour_non_locals: 0,
    boys_count: 0,
    checking_count: 0,
    cleaning_count: 0,
    qc_count: 0,
    security_count: 0,
  });
  const [labourExpanded, setLabourExpanded] = useState(true);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);

  // Sanitization form state
  const [sanitization, setSanitization] = useState({
    cleaning_labour: 0,
    crates_cleaning: 0,
    nets_cleaning: 0,
    nmr_labour: 0,
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
  const [honToHeadless, setHonToHeadless] = useState('');
  const [headlessToVa, setHeadlessToVa] = useState('');
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

  // Grades VA form state — one fixed row per grade
  const emptyGvaRows = useCallback((): GradesVaFormRow[] => (
    VA_GRADES.map((grade) => ({ grade, pd: '', pud: '', pdto: '', ezpl: '', pvpd: '', pvpdto: '' }))
  ), []);
  const [gvaRows, setGvaRows] = useState<GradesVaFormRow[]>(emptyGvaRows);

  // Set default location when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0].id);
    }
  }, [locations, selectedLocation]);

  // Fetch data when date, location, or active tab changes
  useEffect(() => {
    if (!selectedDate) return;

    if (activeTab === 'yield') {
      fetchYieldEntries(selectedDate);
    } else if (activeTab === 'non_local_ladies') {
      fetchNllEntries(selectedDate);
    } else if (activeTab === 'grades_va') {
      fetchGvaEntries(selectedDate);
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
  }, [selectedDate, selectedLocation, activeTab, fetchWorkforce, fetchSupervisors, fetchSanitization, fetchProcessing, fetchYieldEntries, fetchNllEntries, fetchGvaEntries]);

  // Pre-populate Grades VA rows from fetched data (fixed grade order)
  useEffect(() => {
    setGvaRows(
      VA_GRADES.map((grade) => {
        const e = gvaEntries.find((entry) => entry.grade === grade);
        return {
          grade,
          pd: e && Number(e.pd) ? e.pd.toString() : '',
          pud: e && Number(e.pud) ? e.pud.toString() : '',
          pdto: e && Number(e.pdto) ? e.pdto.toString() : '',
          ezpl: e && Number(e.ezpl) ? e.ezpl.toString() : '',
          pvpd: e && Number(e.pvpd) ? e.pvpd.toString() : '',
          pvpdto: e && Number(e.pvpdto) ? e.pvpdto.toString() : '',
        };
      })
    );
  }, [gvaEntries]);

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
      setWorkforce({
        labour_kg_basic: workforceData.labour_kg_basic ?? 0,
        labour_daily_wage: workforceData.labour_daily_wage ?? 0,
        labour_company: workforceData.labour_company ?? 0,
        labour_non_locals: workforceData.labour_non_locals ?? 0,
        boys_count: workforceData.boys_count ?? 0,
        checking_count: workforceData.checking_count ?? 0,
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
        checking_count: 0,
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
        cleaning_labour: sanitizationData.cleaning_labour ?? 0,
        crates_cleaning: sanitizationData.crates_cleaning ?? 0,
        nets_cleaning: sanitizationData.nets_cleaning ?? 0,
        nmr_labour: sanitizationData.nmr_labour ?? 0,
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
        cleaning_labour: 0,
        crates_cleaning: 0,
        nets_cleaning: 0,
        nmr_labour: 0,
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
      setHonToHeadless(processingData.hon_to_headless?.toString() ?? '0');
      setHeadlessToVa(processingData.headless_to_va?.toString() ?? '0');
      setNotes(processingData.notes ?? '');
    } else {
      setWipHonToHeadless('');
      setWipHeadlessToVa('');
      setHonToHeadless('');
      setHeadlessToVa('');
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
    workforce.checking_count +
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

  const handleSave = () => {
    if (!selectedLocation) return;
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
          hon_to_headless: Math.max(0, parseFloat(honToHeadless) || 0),
          headless_to_va: Math.max(0, parseFloat(headlessToVa) || 0),
          notes,
        });
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
        await saveNllEntries(selectedDate, validRows);
      } else if (activeTab === 'grades_va') {
        const validRows = gvaRows
          .map((r) => ({
            grade: r.grade,
            pd: Math.max(0, parseFloat(r.pd) || 0),
            pud: Math.max(0, parseFloat(r.pud) || 0),
            pdto: Math.max(0, parseFloat(r.pdto) || 0),
            ezpl: Math.max(0, parseFloat(r.ezpl) || 0),
            pvpd: Math.max(0, parseFloat(r.pvpd) || 0),
            pvpdto: Math.max(0, parseFloat(r.pvpdto) || 0),
          }))
          .filter((r) => r.pd > 0 || r.pud > 0 || r.pdto > 0 || r.ezpl > 0 || r.pvpd > 0 || r.pvpdto > 0);
        await saveGvaEntries(selectedDate, validRows);
      }
      showToast(
        `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} data saved successfully!`,
        'success'
      );
      setIsConfirmSaveModalOpen(false);
    } catch {
      showToast('Failed to save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };


  const tabs: { key: TabType; label: string }[] = [
    { key: 'workforce', label: 'Workforce' },
    { key: 'sanitization', label: 'Sanitization' },
    { key: 'processing', label: 'Processing' },
    { key: 'yield', label: 'Yield' },
    { key: 'non_local_ladies', label: 'NL Ladies' },
    { key: 'grades_va', label: 'Grades VA' },
  ];

  const isDataLoading =
    (activeTab === 'workforce' && (workforceLoading || supervisorsLoading)) ||
    (activeTab === 'sanitization' && sanitizationLoading) ||
    (activeTab === 'processing' && processingLoading) ||
    (activeTab === 'yield' && yieldLoading) ||
    (activeTab === 'non_local_ladies' && nllLoading) ||
    (activeTab === 'grades_va' && gvaLoading);

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
          {isSubUser ? (
            // Sub-user: date picker limited to yesterday–today
            <input
              type="date"
              value={selectedDate}
              min={YESTERDAY}
              max={TODAY}
              onChange={(e) => {
                const val = e.target.value;
                if (val === TODAY || val === YESTERDAY) setSelectedDate(val);
              }}
              className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500"
            />
          ) : (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500"
            />
          )}
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
          {tabs.map((tab) => (
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
      </div>

      {/* Tab Content */}
      <div className="px-4 mt-3">
        {isDataLoading ? (
          <LoadingSpinner />
        ) : (
          <>
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
                          label="Company Ladies"
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
                    <NumberStepper label="Checking" value={workforce.checking_count} onChange={(v) => updateWorkforce('checking_count', v)} />
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
                  <NumberStepper label="Cleaning Labour" value={sanitization.cleaning_labour} onChange={(v) => updateSanitization('cleaning_labour', v)} />
                  <NumberStepper label="NMR Labour" value={sanitization.nmr_labour} onChange={(v) => updateSanitization('nmr_labour', v)} />
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

                {/* Processing KGs card — 4 fields in 2 groups */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Processing KGs</h3>
                    <span className="px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-xs font-bold">
                      Total: {((parseFloat(honToHeadless) || 0) + (parseFloat(headlessToVa) || 0)).toFixed(3)} kg
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

                  {/* ── Completed Group ── */}
                  <div className="bg-orange-50 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">✅ Completed</p>

                    {/* Completed HON to Headless */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Completed — HON to Headless
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={honToHeadless}
                          onChange={(e) => setHonToHeadless(e.target.value)}
                          placeholder="0.000"
                          className="w-full px-4 py-3.5 bg-white border border-orange-200 rounded-xl text-gray-900 text-lg font-semibold placeholder-gray-400 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 pr-12"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">kg</span>
                      </div>
                    </div>

                    {/* Completed Headless to VA */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Completed — Headless to VA
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={headlessToVa}
                          onChange={(e) => setHeadlessToVa(e.target.value)}
                          placeholder="0.000"
                          className="w-full px-4 py-3.5 bg-white border border-orange-200 rounded-xl text-gray-900 text-lg font-semibold placeholder-gray-400 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 pr-12"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">kg</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Processed KG banner (completed only) */}
                  <div className="flex items-center justify-between bg-orange-50 rounded-xl px-4 py-3">
                    <span className="text-sm font-semibold text-orange-600">Total Processed KG</span>
                    <span className="text-lg font-bold text-orange-700">
                      {((parseFloat(honToHeadless) || 0) + (parseFloat(headlessToVa) || 0)).toFixed(3)} kg
                    </span>
                  </div>
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
                    <h3 className="text-sm font-semibold text-amber-800">Non Local Ladies</h3>
                  </div>
                  <p className="text-xs text-amber-700">Salary Basic is fixed at <strong>₹{SALARY_BASIC}.00</strong>. Difference and Profit &amp; Loss are auto-calculated.</p>
                </div>

                {/* NL Ladies Grid */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                  <div className="min-w-[800px] p-3">
                    {/* Header row */}
                    <div className="grid grid-cols-[140px_80px_100px_80px_80px_80px_80px_80px_80px_32px] gap-1.5 mb-2 px-1 border-b border-gray-100 pb-2">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Contractor</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Ladies</span>
                      <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider text-right">₹/Head</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">HL QTY</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">PD QTY</span>
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Total</span>
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
                          <div key={idx} className="grid grid-cols-[140px_80px_100px_80px_80px_80px_80px_80px_80px_32px] gap-1.5 items-center group">
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
                              step="0.01"
                              min="0"
                              value={row.per_head_amount}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, per_head_amount: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 2)}
                              placeholder="0.00"
                              className="w-full px-2 py-2 bg-amber-50/50 border border-amber-200 rounded-lg text-xs text-amber-900 text-right placeholder-amber-400 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
                            />
                            <input
                              id={`nll-${idx}-3`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              min="0"
                              value={row.hl_qty}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, hl_qty: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 3)}
                              placeholder="0"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"
                            />
                            <input
                              id={`nll-${idx}-4`}
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              min="0"
                              value={row.pd_qty}
                              onChange={(e) => setNllRows((prev) => prev.map((r, i) => i === idx ? { ...r, pd_qty: e.target.value } : r))}
                              onKeyDown={(e) => handleKeyDown(e, 4)}
                              placeholder="0"
                              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-400 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"
                            />
                            
                            {/* Auto calculations */}
                            <span className="text-[11px] font-bold text-right px-1 text-gray-700">{totalQty > 0 ? totalQty.toFixed(1) : '-'}</span>
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
                    'Save Non Local Ladies Data'
                  )}
                </button>
              </div>
            )}

            {/* ─── Grades VA Tab ─────────────────────────────────────────── */}
            {activeTab === 'grades_va' && (
              <div className="animate-fade-in space-y-4">

                {/* Info Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-4 border border-indigo-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📦</span>
                    <h3 className="text-sm font-semibold text-indigo-800">Grades vs Value Addition (V/A)</h3>
                  </div>
                  <p className="text-xs text-indigo-700">Enter daily V/A quantities (KGS) for each grade. Row and column totals are auto-calculated. Leave blank for no production.</p>
                </div>

                {/* Grades Grid */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                  <div className="min-w-[680px] p-3">
                    {/* Header row */}
                    <div className="grid grid-cols-[90px_repeat(6,1fr)_90px] gap-1.5 mb-2 px-1">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider self-end">Grade</span>
                      {VA_COLUMNS.map((col) => (
                        <span key={col.key} className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center self-end">{col.label}</span>
                      ))}
                      <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider text-right self-end">Total</span>
                    </div>

                    {/* Grade rows */}
                    <div className="space-y-1.5">
                      {gvaRows.map((row, idx) => {
                        const rowTotal = VA_COLUMNS.reduce((sum, col) => sum + (parseFloat(row[col.key]) || 0), 0);
                        return (
                          <div key={row.grade} className="grid grid-cols-[90px_repeat(6,1fr)_90px] gap-1.5 items-center">
                            <span className="text-xs font-bold text-gray-700 px-1">{row.grade}</span>
                            {VA_COLUMNS.map((col, colIdx) => (
                              <input
                                key={col.key}
                                id={`gva-${idx}-${col.key}`}
                                type="number"
                                inputMode="decimal"
                                step="0.001"
                                min="0"
                                value={row[col.key]}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGvaRows((prev) => prev.map((r, i) => i === idx ? { ...r, [col.key]: val } : r));
                                }}
                                onKeyDown={(e) => {
                                  let nextRow = idx;
                                  let nextCol = colIdx;
                                  if (e.key === 'ArrowUp') nextRow = Math.max(0, idx - 1);
                                  else if (e.key === 'ArrowDown') nextRow = Math.min(gvaRows.length - 1, idx + 1);
                                  else if (e.key === 'ArrowLeft') nextCol = Math.max(0, colIdx - 1);
                                  else if (e.key === 'ArrowRight') nextCol = Math.min(VA_COLUMNS.length - 1, colIdx + 1);
                                  else return;
                                  
                                  if (nextRow !== idx || nextCol !== colIdx) {
                                    e.preventDefault();
                                    const nextId = `gva-${nextRow}-${VA_COLUMNS[nextCol].key}`;
                                    document.getElementById(nextId)?.focus();
                                  }
                                }}
                                placeholder="-"
                                className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 text-right placeholder-gray-300 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                              />
                            ))}
                            <span className={`text-xs font-bold text-right px-1 ${rowTotal > 0 ? 'text-indigo-700' : 'text-gray-300'}`}>
                              {rowTotal > 0 ? rowTotal.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '-'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Column totals footer */}
                    <div className="grid grid-cols-[90px_repeat(6,1fr)_90px] gap-1.5 items-center mt-2 pt-2 border-t-2 border-indigo-100 bg-indigo-50/60 rounded-lg px-1 py-2">
                      <span className="text-xs font-bold text-indigo-800">TOTAL</span>
                      {VA_COLUMNS.map((col) => {
                        const colTotal = gvaRows.reduce((sum, r) => sum + (parseFloat(r[col.key]) || 0), 0);
                        return (
                          <span key={col.key} className="text-xs font-bold text-indigo-800 text-right px-1">
                            {colTotal > 0 ? colTotal.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '-'}
                          </span>
                        );
                      })}
                      <span className="text-xs font-bold text-indigo-900 text-right px-1">
                        {(() => {
                          const grand = gvaRows.reduce((sum, r) => sum + VA_COLUMNS.reduce((s, col) => s + (parseFloat(r[col.key]) || 0), 0), 0);
                          return grand > 0 ? grand.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '-';
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total V/A banner */}
                <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 rounded-2xl p-4 border border-indigo-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-indigo-700">Total V/A (QTY)</span>
                  <span className="text-lg font-bold text-indigo-800">
                    {gvaRows.reduce((sum, r) => sum + VA_COLUMNS.reduce((s, col) => s + (parseFloat(r[col.key]) || 0), 0), 0)
                      .toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg
                  </span>
                </div>

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
                    'Save Grades VA Data'
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
    </div>
  );
}

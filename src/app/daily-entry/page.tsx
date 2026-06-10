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
import type { Supervisor, TabType } from '@/types';

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
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('workforce');
  const [saving, setSaving] = useState(false);
  const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);


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
  });

  // Processing form state
  const [wipHonToHeadless, setWipHonToHeadless] = useState('');
  const [wipHeadlessToVa, setWipHeadlessToVa] = useState('');
  const [honToHeadless, setHonToHeadless] = useState('');
  const [headlessToVa, setHeadlessToVa] = useState('');
  const [notes, setNotes] = useState('');

  // Set default location when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0].id);
    }
  }, [locations, selectedLocation]);

  // Fetch data when date, location, or active tab changes
  useEffect(() => {
    if (!selectedDate || !selectedLocation) return;

    if (activeTab === 'workforce') {
      fetchWorkforce(selectedDate, selectedLocation);
      fetchSupervisors();
    } else if (activeTab === 'sanitization') {
      fetchSanitization(selectedDate, selectedLocation);
    } else if (activeTab === 'processing') {
      fetchProcessing(selectedDate, selectedLocation);
    }
  }, [selectedDate, selectedLocation, activeTab, fetchWorkforce, fetchSupervisors, fetchSanitization, fetchProcessing]);

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
      });
    } else {
      setSanitization({
        cleaning_labour: 0,
        crates_cleaning: 0,
        nets_cleaning: 0,
        nmr_labour: 0,
        washroom_cleaning: 0,
        grading_machine_cleaning: 0,
      });
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
        await saveSanitization(selectedDate, selectedLocation, sanitization);
      } else if (activeTab === 'processing') {
        await saveProcessing(selectedDate, selectedLocation, {
          wip_hon_to_headless: parseFloat(wipHonToHeadless) || 0,
          wip_headless_to_va: parseFloat(wipHeadlessToVa) || 0,
          hon_to_headless: parseFloat(honToHeadless) || 0,
          headless_to_va: parseFloat(headlessToVa) || 0,
          notes,
        });
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
  ];

  const isDataLoading =
    (activeTab === 'workforce' && (workforceLoading || supervisorsLoading)) ||
    (activeTab === 'sanitization' && sanitizationLoading) ||
    (activeTab === 'processing' && processingLoading);

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
                      <p className="text-lg font-bold text-teal-800">{monthlyTotal.toFixed(1)} kg</p>
                    </div>
                  </div>
                </div>

                {/* Processing KGs card — 4 fields in 2 groups */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Processing KGs</h3>
                    <span className="px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-xs font-bold">
                      Total: {((parseFloat(honToHeadless) || 0) + (parseFloat(headlessToVa) || 0)).toFixed(1)} kg
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
                          step="0.1"
                          value={wipHonToHeadless}
                          onChange={(e) => setWipHonToHeadless(e.target.value)}
                          placeholder="0.0"
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
                          step="0.1"
                          value={wipHeadlessToVa}
                          onChange={(e) => setWipHeadlessToVa(e.target.value)}
                          placeholder="0.0"
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
                          step="0.1"
                          value={honToHeadless}
                          onChange={(e) => setHonToHeadless(e.target.value)}
                          placeholder="0.0"
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
                          step="0.1"
                          value={headlessToVa}
                          onChange={(e) => setHeadlessToVa(e.target.value)}
                          placeholder="0.0"
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
                      {((parseFloat(honToHeadless) || 0) + (parseFloat(headlessToVa) || 0)).toFixed(1)} kg
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

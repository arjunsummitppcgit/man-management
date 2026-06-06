'use client';

import React, { useState, useCallback, useEffect } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import NumberStepper from '@/components/ui/NumberStepper';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
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
  const selectedNames = supervisors
    .filter((s) => selected.includes(s.id))
    .map((s) => s.name.split(' ')[0]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Trigger row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-teal-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 text-left">Assign Supervisors</p>
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
        <div className="border-t border-gray-100 max-h-64 overflow-y-auto">
          {supervisors.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No supervisors available</p>
          ) : (
            supervisors.map((sup) => {
              const isSelected = selected.includes(sup.id);
              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() => onToggle(sup.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-gray-50 last:border-0 ${
                    isSelected ? 'bg-teal-50/60' : 'hover:bg-gray-50'
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
          {/* Done button */}
          <div className="p-3 bg-gray-50 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setOpen(false)}
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
    labour_count: 0,
    boys_count: 0,
    checking_count: 0,
    cleaning_count: 0,
    qc_count: 0,
    security_count: 0,
  });
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
  const [processedKg, setProcessedKg] = useState('');
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
        labour_count: workforceData.labour_count ?? 0,
        boys_count: workforceData.boys_count ?? 0,
        checking_count: workforceData.checking_count ?? 0,
        cleaning_count: workforceData.cleaning_count ?? 0,
        qc_count: workforceData.qc_count ?? 0,
        security_count: workforceData.security_count ?? 0,
      });
    } else {
      setWorkforce({
        labour_count: 0,
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
      setProcessedKg(processingData.processed_kg?.toString() ?? '');
      setNotes(processingData.notes ?? '');
    } else {
      setProcessedKg('');
      setNotes('');
    }
  }, [processingData]);

  const workforceTotal =
    workforce.labour_count +
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

  const handleSave = async () => {
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
          processed_kg: parseFloat(processedKg) || 0,
          notes,
        });
      }
      showToast(
        `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} data saved successfully!`,
        'success'
      );
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
                  <NumberStepper label="Labour" value={workforce.labour_count} onChange={(v) => updateWorkforce('labour_count', v)} />
                  <NumberStepper label="Boys" value={workforce.boys_count} onChange={(v) => updateWorkforce('boys_count', v)} />
                  <NumberStepper label="Checking" value={workforce.checking_count} onChange={(v) => updateWorkforce('checking_count', v)} />
                  <NumberStepper label="Cleaning" value={workforce.cleaning_count} onChange={(v) => updateWorkforce('cleaning_count', v)} />
                  <NumberStepper label="QC" value={workforce.qc_count} onChange={(v) => updateWorkforce('qc_count', v)} />
                  <NumberStepper label="Security" value={workforce.security_count} onChange={(v) => updateWorkforce('security_count', v)} />
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
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Sanitization Details</h3>
                  <NumberStepper label="Cleaning Labour" value={sanitization.cleaning_labour} onChange={(v) => updateSanitization('cleaning_labour', v)} />
                  <NumberStepper label="Crates Cleaning" value={sanitization.crates_cleaning} onChange={(v) => updateSanitization('crates_cleaning', v)} />
                  <NumberStepper label="Nets Cleaning" value={sanitization.nets_cleaning} onChange={(v) => updateSanitization('nets_cleaning', v)} />
                  <NumberStepper label="NMR Labour" value={sanitization.nmr_labour} onChange={(v) => updateSanitization('nmr_labour', v)} />
                  <NumberStepper label="Washroom Cleaning" value={sanitization.washroom_cleaning} onChange={(v) => updateSanitization('washroom_cleaning', v)} />
                  <NumberStepper label="Grading Machine" value={sanitization.grading_machine_cleaning} onChange={(v) => updateSanitization('grading_machine_cleaning', v)} />
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

                {/* Input */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Processed KGs
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={processedKg}
                    onChange={(e) => setProcessedKg(e.target.value)}
                    placeholder="Enter kg processed today"
                    className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-lg font-semibold placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                  />
                </div>

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
    </div>
  );
}

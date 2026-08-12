'use client';

import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useSupervisors } from '@/hooks/useSupervisors';
import { useAuth } from '@/hooks/useAuth';
import { usePermissionAlert } from '@/components/ui/PermissionAlert';
import { supabase } from '@/lib/supabase/client';
import type { Supervisor } from '@/types';
import MonthlyAttendanceView from '@/components/supervisors/MonthlyAttendanceView';

interface SupervisorModalProps {
  open: boolean;
  onClose: () => void;
  supervisor: Supervisor | null;
  onSave: (name: string, phone: string, joiningDate: string | null, salary: number | null) => void;
  onDelete?: (id: string) => void;
}

function SupervisorModal({ open, onClose, supervisor, onSave, onDelete }: SupervisorModalProps) {
  const [name, setName] = useState(supervisor?.name || '');
  const [phone, setPhone] = useState(supervisor?.phone || '');
  const [joiningDate, setJoiningDate] = useState(supervisor?.joining_date || '');
  const [salary, setSalary] = useState(supervisor?.salary?.toString() || '');

  React.useEffect(() => {
    setName(supervisor?.name || '');
    setPhone(supervisor?.phone || '');
    setJoiningDate(supervisor?.joining_date || '');
    setSalary(supervisor?.salary?.toString() || '');
  }, [supervisor]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

        {/* Header row: title + delete icon (only when editing) */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            {supervisor ? 'Edit Supervisor' : 'Add Supervisor'}
          </h2>
          {supervisor && onDelete && (
            <button
              onClick={() => {
                if (window.confirm(`Delete supervisor "${supervisor.name}"?`)) {
                  onDelete(supervisor.id);
                  onClose();
                }
              }}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 text-red-500 transition-colors border border-red-100"
              title="Delete Supervisor"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter supervisor name"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter phone number"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Joining</label>
            <input
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Salary (Monthly)</label>
            <input
              type="number"
              step="any"
              min="0"
              value={salary}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSalary(isNaN(val) ? '' : Math.max(0, val).toString());
              }}
              placeholder="Enter salary amount"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors min-h-[48px]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const parsedSalary = salary ? parseFloat(salary) : null;
                onSave(name, phone, joiningDate || null, parsedSalary);
                onClose();
              }}
              className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/25 transition-all min-h-[48px]"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AttendanceBySupervisorRecord {
  work_date: string;
  location: { name: string } | null;
  is_present: number | boolean;
}

export default function SupervisorsPage() {
  const { showToast } = useToast();
  const { canModify } = useAuth();
  const { requireModify, reportError } = usePermissionAlert();
  // Marking attendance is a write; view-only users still see the roster.
  const canMarkAttendance = canModify('supervisors');
  const { supervisors, loading, fetchSupervisors, addSupervisor, updateSupervisor, deactivateSupervisor } = useSupervisors();
  const [mainView, setMainView] = useState<'list' | 'attendance' | 'monthly'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupervisor, setEditingSupervisor] = useState<Supervisor | null>(null);

  // Attendance state
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');

  // Attendance data from Supabase
  const [supervisorAttendance, setSupervisorAttendance] = useState<AttendanceBySupervisorRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Fetch supervisors on mount
  useEffect(() => {
    fetchSupervisors();
  }, [fetchSupervisors]);

  // Set default selected supervisor when supervisors load
  useEffect(() => {
    if (supervisors.length > 0 && !selectedSupervisorId) {
      setSelectedSupervisorId(supervisors[0].id);
    }
  }, [supervisors, selectedSupervisorId]);

  // Fetch attendance by supervisor
  useEffect(() => {
    if (!selectedSupervisorId) return;

    const fetchAttendance = async () => {
      setAttendanceLoading(true);
      try {
        const { data, error } = await supabase
          .from('daily_supervisor_assignments')
          .select('*, location:locations(name)')
          .eq('supervisor_id', selectedSupervisorId)
          .gt('is_present', 0)
          .order('work_date', { ascending: false })
          .limit(30);

        if (error) throw error;
        setSupervisorAttendance(data || []);
      } catch (error) {
        console.error('Error fetching supervisor attendance:', error);
        setSupervisorAttendance([]);
      } finally {
        setAttendanceLoading(false);
      }
    };

    fetchAttendance();
  }, [selectedSupervisorId]);

  const filteredSupervisors = useMemo(
    () =>
      supervisors.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [supervisors, searchQuery]
  );

  // Group supervisor attendance by date for display
  const groupedSupervisorAttendance = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const record of supervisorAttendance) {
      const date = record.work_date;
      if (!map.has(date)) map.set(date, []);
      if (record.location?.name) {
        map.get(date)!.push(record.location.name);
      }
    }
    return Array.from(map.entries())
      .map(([date, locations]) => ({ date, locations }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [supervisorAttendance]);

  const handleSaveSupervisor = async (
    name: string,
    phone: string,
    joiningDate: string | null,
    salary: number | null
  ) => {
    // The roster is undated, so Modify on this page is the whole rule.
    if (!requireModify('supervisors')) return;
    try {
      if (editingSupervisor) {
        await updateSupervisor(editingSupervisor.id, { name, phone, joining_date: joiningDate, salary });
        showToast('Supervisor updated successfully', 'success');
      } else {
        await addSupervisor(name, phone, joiningDate, salary);
        showToast('Supervisor added successfully', 'success');
      }
    } catch (error) {
      console.error('Error saving supervisor:', error);
      if (!reportError(error)) showToast('Failed to save supervisor', 'error');
    }
    setEditingSupervisor(null);
  };

  const handleDeleteSupervisor = async (id: string) => {
    if (!requireModify('supervisors')) return;
    try {
      await deactivateSupervisor(id);
      showToast('Supervisor deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting supervisor:', error);
      if (!reportError(error)) showToast('Failed to delete supervisor', 'error');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Supervisors"
        rightAction={
          <button
            onClick={() => {
              // Nothing in this form is readable-only, so refuse at the door
              // rather than after a supervisor has been typed in.
              if (!requireModify('supervisors')) return;
              setEditingSupervisor(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors min-h-[40px]"
          >
            + Add
          </button>
        }
      />

      {/* Segmented Control — attendance needs Modify on this page */}
      {canMarkAttendance && (
        <div className="px-4 mb-4">
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setMainView('list')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                mainView === 'list'
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setMainView('attendance')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                mainView === 'attendance'
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              Name wise details
            </button>
            <button
              onClick={() => setMainView('monthly')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                mainView === 'monthly'
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              Month register attendance
            </button>
          </div>
        </div>
      )}

      {/* List View */}
      {(mainView === 'list' || !canMarkAttendance) && (
        <div className="px-4 space-y-3 animate-fade-in">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search supervisors..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
            />
          </div>

          {/* Supervisor Cards */}
          {filteredSupervisors.map((supervisor) => (
            <button
              key={supervisor.id}
              onClick={() => {
                if (!requireModify('supervisors')) return;
                setEditingSupervisor(supervisor);
                setModalOpen(true);
              }}
              className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-teal-600">
                  {supervisor.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{supervisor.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">📞 {supervisor.phone || 'No phone'}</p>
                {(supervisor.joining_date || supervisor.salary !== null) && (
                  <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1 text-[10px] font-medium text-gray-400">
                    {supervisor.joining_date && (
                      <span className="flex items-center gap-0.5">
                        <span>📅</span>
                        <span>
                          {(() => {
                            try {
                              const dParts = supervisor.joining_date.split('-');
                              const dObj = new Date(Number(dParts[0]), Number(dParts[1]) - 1, Number(dParts[2]));
                              return dObj.toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              });
                            } catch {
                              return supervisor.joining_date;
                            }
                          })()}
                        </span>
                      </span>
                    )}
                    {supervisor.salary !== null && (
                      <span className="flex items-center gap-0.5 text-teal-650 dark:text-teal-400 font-semibold">
                        <span>💰</span>
                        <span>₹{Number(supervisor.salary).toLocaleString('en-IN')}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                  supervisor.is_active
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {supervisor.is_active ? 'Active' : 'Inactive'}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}

          {filteredSupervisors.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No supervisors found</p>
            </div>
          )}
        </div>
      )}

      {/* Attendance View — needs Modify */}
      {mainView === 'attendance' && canMarkAttendance && (
        <div className="px-4 space-y-3 animate-fade-in">
          <select
            value={selectedSupervisorId}
            onChange={(e) => setSelectedSupervisorId(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 appearance-none"
          >
            {supervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {attendanceLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {groupedSupervisorAttendance.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No attendance records</div>
              ) : (
                groupedSupervisorAttendance.map((record, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 border-b border-gray-50 last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(record.date).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {record.locations.map((loc) => (
                        <span
                          key={loc}
                          className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-[10px] font-semibold"
                        >
                          {loc}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Monthly Attendance View — needs Modify */}
      {mainView === 'monthly' && canMarkAttendance && (
        <MonthlyAttendanceView />
      )}

      {/* FAB for adding */}
      {mainView === 'list' && (
        <button
          onClick={() => {
            setEditingSupervisor(null);
            setModalOpen(true);
          }}
          className="fixed bottom-24 right-4 w-14 h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl shadow-xl shadow-teal-600/30 flex items-center justify-center transition-all active:scale-95 z-40"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}

      {/* Supervisor Modal */}
      <SupervisorModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingSupervisor(null);
        }}
        supervisor={editingSupervisor}
        onSave={handleSaveSupervisor}
        onDelete={handleDeleteSupervisor}
      />
    </div>
  );
}

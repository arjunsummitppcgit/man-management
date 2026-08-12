'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { usePermissionAlert } from '@/components/ui/PermissionAlert';
import { useAuth } from '@/hooks/useAuth';
import { getDaysInMonth } from 'date-fns';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const YEARS = [2025, 2026, 2027];

interface SupervisorRecord {
  id: string;
  name: string;
  is_active: boolean;
}

interface AssignmentRecord {
  id: string;
  work_date: string;
  supervisor_id: string;
  location_id: string;
  is_present: number | boolean;
}

export default function MonthlyAttendanceView() {
  const now = new Date();
  const router = useRouter();
  const { canView, loading: authLoading } = useAuth();
  const canSeeSupervisors = canView('supervisors');
  const { showToast } = useToast();
  const { requireEditDate, reportError } = usePermissionAlert();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [year, setYear] = useState(now.getFullYear());
  const [supervisors, setSupervisors] = useState<SupervisorRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Edit Attendance State
  const [editingCell, setEditingCell] = useState<{
    supervisorId: string;
    supervisorName: string;
    dateStr: string;
    dayNum: number;
    currentValue: number;
    locationId: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Needs View on Supervisors — anyone without it goes back to the dashboard
  useEffect(() => {
    if (!authLoading && !canSeeSupervisors) {
      router.replace('/');
    }
  }, [authLoading, canSeeSupervisors, router]);

  // Fetch data when month or year changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch active supervisors
        const { data: activeSups, error: supError } = await supabase
          .from('supervisors')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('name');

        if (supError) throw supError;

        // Fetch active locations
        const { data: activeLocs, error: locError } = await supabase
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .order('sort_order');

        if (!locError && activeLocs) {
          setLocations(activeLocs);
        }

        // 2. Fetch assignments for the selected month/year
        const startOfMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
        const numDays = getDaysInMonth(new Date(year, month - 1));
        const endOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;

        const { data: monthAssignments, error: assignError } = await supabase
          .from('daily_supervisor_assignments')
          .select('id, work_date, supervisor_id, location_id, is_present')
          .gte('work_date', startOfMonthStr)
          .lte('work_date', endOfMonthStr);

        if (assignError) throw assignError;

        // 3. Compile unique supervisor list: include active supervisors, and any inactive ones who have assignments in this month
        const assignmentsList = (monthAssignments || []).map(a => ({
          ...a,
          is_present: typeof a.is_present === 'boolean' ? (a.is_present ? 1.0 : 0.0) : (Number(a.is_present) || 0.0)
        }));
        
        setAssignments(assignmentsList);

        const activeList = activeSups || [];
        const inactiveAssignedSups: SupervisorRecord[] = [];

        // Check if there are inactive supervisors who have assignments in the current month with positive attendance
        const activeIds = new Set(activeList.map((s) => s.id));
        const uniqueAssignedIds = new Set(
          assignmentsList.filter(a => a.is_present > 0).map((a) => a.supervisor_id)
        );

        const missingIds = Array.from(uniqueAssignedIds).filter((id) => !activeIds.has(id));

        if (missingIds.length > 0) {
          const { data: inactiveSups, error: inactiveError } = await supabase
            .from('supervisors')
            .select('id, name, is_active')
            .in('id', missingIds);

          if (!inactiveError && inactiveSups) {
            inactiveAssignedSups.push(...inactiveSups);
          }
        }

        // Combine and sort
        const combined = [...activeList, ...inactiveAssignedSups].sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        setSupervisors(combined);
      } catch (error) {
        console.error('Error fetching monthly attendance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month, year, refreshTrigger]);

  // Calculate days in the selected month
  const daysInMonth = useMemo(() => {
    const numDays = getDaysInMonth(new Date(year, month - 1));
    return Array.from({ length: numDays }, (_, i) => {
      const dayNum = i + 1;
      const date = new Date(year, month - 1, dayNum);
      const isSunday = date.getDay() === 0;
      return {
        dayNum,
        isSunday,
        formattedDate: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
      };
    });
  }, [month, year]);

  // Create a quick lookup map for assignments: supervisorId_dateString -> details
  const assignmentLookup = useMemo(() => {
    const lookup = new Map<string, { isPresent: number; locationId: string; assignmentId: string }>();
    assignments.forEach((a) => {
      const val = typeof a.is_present === 'boolean' ? (a.is_present ? 1.0 : 0.0) : (Number(a.is_present) || 0.0);
      lookup.set(`${a.supervisor_id}_${a.work_date}`, {
        isPresent: val,
        locationId: a.location_id,
        assignmentId: a.id,
      });
    });
    return lookup;
  }, [assignments]);

  // Handle opening edit modal
  const handleEditCell = (supervisorId: string, supervisorName: string, dateStr: string, dayNum: number) => {
    // An assignment row is unlocked by Modify on EITHER page (see
    // can_edit_assignment_on in migration 027). The register already shows the
    // value, so a day that cannot be written has nothing to open.
    if (!requireEditDate(['supervisors', 'daily-entry'], dateStr)) return;
    const assignment = assignmentLookup.get(`${supervisorId}_${dateStr}`);
    const currentValue = assignment ? assignment.isPresent : 0;
    const locationId = assignment?.locationId || (locations[0]?.id || '');
    setEditingCell({
      supervisorId,
      supervisorName,
      dateStr,
      dayNum,
      currentValue,
      locationId,
    });
  };

  // Handle saving attendance changes
  const handleSaveAttendance = async (val: number, selectedLocId: string) => {
    if (!editingCell) return;
    if (!requireEditDate(['supervisors', 'daily-entry'], editingCell.dateStr)) return;
    setSubmitting(true);
    try {
      if (val === 0) {
        // Delete the assignment
        const { error } = await supabase
          .from('daily_supervisor_assignments')
          .delete()
          .eq('work_date', editingCell.dateStr)
          .eq('supervisor_id', editingCell.supervisorId);

        if (error) throw error;
      } else {
        // To avoid conflicts, delete first then insert
        const { error: clearError } = await supabase
          .from('daily_supervisor_assignments')
          .delete()
          .eq('work_date', editingCell.dateStr)
          .eq('supervisor_id', editingCell.supervisorId);

        if (clearError) throw clearError;

        const { error: insertError } = await supabase
          .from('daily_supervisor_assignments')
          .insert({
            work_date: editingCell.dateStr,
            supervisor_id: editingCell.supervisorId,
            location_id: selectedLocId,
            is_present: val,
          });

        if (insertError) throw insertError;
      }

      showToast('Attendance updated successfully', 'success');
      setRefreshTrigger(prev => prev + 1);
      setEditingCell(null);
    } catch (error) {
      console.error('Error saving attendance:', error);
      if (!reportError(error)) showToast('Failed to save attendance', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Map supervisors to their calculated monthly attendance
  const rows = useMemo(() => {
    return supervisors.map((sup, idx) => {
      let presentCount = 0;
      const dailyAttendance = daysInMonth.map((day) => {
        const assignment = assignmentLookup.get(`${sup.id}_${day.formattedDate}`);
        const attendanceValue = assignment ? assignment.isPresent : 0;
        if (attendanceValue > 0) {
          presentCount += attendanceValue;
        }
        return {
          dayNum: day.dayNum,
          attendanceValue,
          formattedDate: day.formattedDate,
          locationId: assignment?.locationId || '',
          assignmentId: assignment?.assignmentId || '',
        };
      });

      const calculatedAbsent = daysInMonth.length - presentCount;
      const absentCount = calculatedAbsent < 0 ? 0 : calculatedAbsent;

      return {
        sNo: idx + 1,
        id: sup.id,
        name: sup.name,
        isActive: sup.is_active,
        dailyAttendance,
        presentCount,
        absentCount,
      };
    });
  }, [supervisors, daysInMonth, assignmentLookup]);

  // Hold the render while the redirect for users without access kicks in
  if (authLoading || !canSeeSupervisors) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-10">

      {/* Month & Year Selectors */}
      <div className="px-4 mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:border-teal-500 appearance-none shadow-sm"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:border-teal-500 appearance-none shadow-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid Container */}
      <div className="px-4">
        {loading ? (
          <LoadingSpinner />
        ) : supervisors.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center shadow-sm">
            <span className="text-4xl mb-2 block">👔</span>
            <p className="text-gray-500 dark:text-gray-400 text-sm">No supervisor data found for this period.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-md overflow-hidden">
            {/* Scrollable Wrapper — capped height so the header can pin to its top */}
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="reg-head bg-gray-50 dark:bg-gray-800/50">
                    {/* Sticky S NO Column */}
                    <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 left-0 z-30 bg-gray-50 dark:bg-gray-800 min-w-[48px] text-center border-r border-gray-100 dark:border-gray-800">
                      S.No
                    </th>
                    {/* Sticky Name Column */}
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 left-[48px] z-30 bg-gray-50 dark:bg-gray-800 min-w-[160px] border-r border-gray-200 dark:border-gray-800">
                      Name
                    </th>
                    {/* Day Columns */}
                    {daysInMonth.map((day) => (
                      <th
                        key={day.dayNum}
                        className={`py-3 px-1 text-center font-bold min-w-[36px] border-r border-gray-100 dark:border-gray-800/30 sticky top-0 z-20 ${
                          day.isSunday
                            ? 'bg-emerald-600 dark:bg-emerald-800 text-white font-black'
                            : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
                        }`}
                      >
                        {day.dayNum}
                      </th>
                    ))}
                    {/* Summary Columns */}
                    <th className="px-3 py-3 font-bold text-emerald-600 dark:text-emerald-400 text-center uppercase tracking-wider min-w-[65px] bg-emerald-50 dark:bg-emerald-950 border-r border-gray-100 dark:border-gray-800 sticky top-0 z-20">
                      Pres
                    </th>
                    <th className="px-3 py-3 font-bold text-rose-600 dark:text-rose-400 text-center uppercase tracking-wider min-w-[65px] bg-rose-50 dark:bg-rose-950 sticky top-0 z-20">
                      Abs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Sticky S NO */}
                      <td className="px-3 py-3 text-center text-gray-400 dark:text-gray-500 font-medium sticky left-0 z-10 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800">
                        {row.sNo}
                      </td>
                      {/* Sticky Name */}
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 sticky left-[48px] z-10 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.02)] truncate max-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          <span>{row.name}</span>
                          {!row.isActive && (
                            <span className="px-1 py-0.2 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded text-[8px] font-normal scale-90">
                              Inact
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Day Attendance Cells */}
                      {row.dailyAttendance.map((cell) => {
                        const val = cell.attendanceValue;
                        let text = '-';
                        let badgeClass = 'text-gray-300 dark:text-gray-700 font-normal';
                        
                        if (val === 0.5) {
                          text = '0.5';
                          badgeClass = 'font-bold text-amber-500 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-950/20 px-1 py-0.5 rounded';
                        } else if (val === 1) {
                          text = '1';
                          badgeClass = 'font-extrabold text-teal-650 dark:text-teal-400 text-sm';
                        } else if (val === 1.5) {
                          text = '1.5';
                          badgeClass = 'font-bold text-purple-650 dark:text-purple-400 text-xs bg-purple-50 dark:bg-purple-950/20 px-1 py-0.5 rounded';
                        } else if (val === 2) {
                          text = '2';
                          badgeClass = 'font-black text-indigo-650 dark:text-indigo-400 text-sm bg-indigo-50 dark:bg-indigo-950/20 px-1 py-0.5 rounded';
                        } else if (val > 0) {
                          text = String(val);
                          badgeClass = 'font-bold text-teal-650 dark:text-teal-400 text-sm';
                        }

                        return (
                          <td
                            key={cell.dayNum}
                            onClick={() => handleEditCell(row.id, row.name, cell.formattedDate, cell.dayNum)}
                            className="py-2 text-center border-r border-gray-100/50 dark:border-gray-800/20 cursor-pointer hover:bg-teal-50/30 dark:hover:bg-teal-900/10 transition-colors"
                          >
                            <span className={badgeClass}>
                              {text}
                            </span>
                          </td>
                        );
                      })}
                      {/* Summaries */}
                      <td className="px-3 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10 border-r border-gray-100 dark:border-gray-800 text-sm">
                        {row.presentCount}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-rose-600 dark:text-rose-400 bg-rose-50/20 dark:bg-rose-950/10 text-sm">
                        {row.absentCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Attendance Modal */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setEditingCell(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 border-t border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle indicator */}
            <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-5" />

            <div className="mb-5">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Edit Attendance</h3>
              <p className="text-xs text-gray-550 dark:text-gray-400 mt-1">
                For <span className="font-semibold text-gray-700 dark:text-gray-300">{editingCell.supervisorName}</span> on{' '}
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {new Date(editingCell.dateStr).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </p>
            </div>

            {/* Location Selector */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                Location
              </label>
              <select
                value={editingCell.locationId}
                onChange={(e) => setEditingCell({ ...editingCell, locationId: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:border-teal-500 focus:outline-none"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Attendance Value Selection */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
                Attendance Value
              </label>
              
              {/* Quick Select Buttons */}
              <div className="grid grid-cols-5 gap-2 mb-4">
                {[
                  { label: 'Absent', val: 0.0, display: '-' },
                  { label: '0.5 Day', val: 0.5, display: '0.5' },
                  { label: 'Full Day', val: 1.0, display: '1' },
                  { label: '1.5 Days', val: 1.5, display: '1.5' },
                  { label: 'Double', val: 2.0, display: '2' },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setEditingCell({ ...editingCell, currentValue: opt.val })}
                    className={`py-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center justify-center gap-1.5 ${
                      editingCell.currentValue === opt.val
                        ? 'bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-600/10'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span className="text-sm font-black">{opt.display}</span>
                    <span className="text-[8px] font-medium opacity-80">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom Input */}
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-550 dark:text-gray-300">Custom Value:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={editingCell.currentValue === 0 ? '' : editingCell.currentValue}
                  onChange={(e) => {
                    const numVal = parseFloat(e.target.value);
                    setEditingCell({ ...editingCell, currentValue: isNaN(numVal) ? 0 : numVal });
                  }}
                  placeholder="0.0"
                  className="flex-1 min-w-0 bg-transparent text-right pr-2 text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSaveAttendance(editingCell.currentValue, editingCell.locationId)}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/20 transition-all min-h-[48px] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

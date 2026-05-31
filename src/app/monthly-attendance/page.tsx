'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { supabase } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
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
  work_date: string;
  supervisor_id: string;
}

export default function MonthlyAttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [year, setYear] = useState(now.getFullYear());
  const [supervisors, setSupervisors] = useState<SupervisorRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data when month or year changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch active supervisors
        const { data: activeSups, error: supError } = await supabase
          .from('supervisors')
          .select('id, name, is_active')
          .order('name');

        if (supError) throw supError;

        // 2. Fetch assignments for the selected month/year
        const startOfMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
        const numDays = getDaysInMonth(new Date(year, month - 1));
        const endOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;

        const { data: monthAssignments, error: assignError } = await supabase
          .from('daily_supervisor_assignments')
          .select('work_date, supervisor_id')
          .gte('work_date', startOfMonthStr)
          .lte('work_date', endOfMonthStr)
          .eq('is_present', true);

        if (assignError) throw assignError;

        // 3. Compile unique supervisor list: include active supervisors, and any inactive ones who have assignments in this month
        const assignmentsList = monthAssignments || [];
        setAssignments(assignmentsList);

        const activeList = activeSups || [];
        const inactiveAssignedSups: SupervisorRecord[] = [];

        // Check if there are inactive supervisors who have assignments in the current month
        const activeIds = new Set(activeList.map((s) => s.id));
        const uniqueAssignedIds = new Set(assignmentsList.map((a) => a.supervisor_id));

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
  }, [month, year]);

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

  // Create a quick lookup map for assignments: supervisorId_dateString -> true
  const assignmentLookup = useMemo(() => {
    const lookup = new Set<string>();
    assignments.forEach((a) => {
      lookup.add(`${a.supervisor_id}_${a.work_date}`);
    });
    return lookup;
  }, [assignments]);

  // Map supervisors to their calculated monthly attendance
  const rows = useMemo(() => {
    return supervisors.map((sup, idx) => {
      let presentCount = 0;
      const dailyAttendance = daysInMonth.map((day) => {
        const isPresent = assignmentLookup.has(`${sup.id}_${day.formattedDate}`);
        if (isPresent) {
          presentCount++;
        }
        return {
          dayNum: day.dayNum,
          isPresent,
        };
      });

      const absentCount = daysInMonth.length - presentCount;

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

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader title="Staff Attendance" />

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
            {/* Scrollable Wrapper */}
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                    {/* Sticky S NO Column */}
                    <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 min-w-[48px] text-center border-r border-gray-100 dark:border-gray-800">
                      S.No
                    </th>
                    {/* Sticky Name Column */}
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-[48px] z-20 bg-gray-50 dark:bg-gray-800 min-w-[160px] border-r border-gray-200 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      Name
                    </th>
                    {/* Day Columns */}
                    {daysInMonth.map((day) => (
                      <th
                        key={day.dayNum}
                        className={`py-3 px-1 text-center font-bold min-w-[36px] border-r border-gray-100 dark:border-gray-800/30 ${
                          day.isSunday
                            ? 'bg-emerald-600 dark:bg-emerald-800 text-white font-black'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {day.dayNum}
                      </th>
                    ))}
                    {/* Summary Columns */}
                    <th className="px-3 py-3 font-bold text-emerald-600 dark:text-emerald-400 text-center uppercase tracking-wider min-w-[65px] bg-emerald-50/50 dark:bg-emerald-950/20 border-r border-gray-100 dark:border-gray-800">
                      Pres
                    </th>
                    <th className="px-3 py-3 font-bold text-rose-600 dark:text-rose-400 text-center uppercase tracking-wider min-w-[65px] bg-rose-50/50 dark:bg-rose-950/20">
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
                      {row.dailyAttendance.map((cell) => (
                        <td
                          key={cell.dayNum}
                          className="py-3 text-center border-r border-gray-100/50 dark:border-gray-800/20"
                        >
                          {cell.isPresent ? (
                            <span className="font-extrabold text-teal-600 dark:text-teal-400 text-sm">
                              1
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-700 font-normal">
                              -
                            </span>
                          )}
                        </td>
                      ))}
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
    </div>
  );
}

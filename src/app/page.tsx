'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { useDashboard } from '@/hooks/useDashboard';
import { useLocations } from '@/hooks/useLocations';



export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkTheme();
    window.addEventListener('themechange', checkTheme);
    return () => window.removeEventListener('themechange', checkTheme);
  }, []);

  const { kpis, locationBreakdowns, loading, fetchDashboard } = useDashboard();
  const { locations, loading: locationsLoading } = useLocations();

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const selectedDateFormatted = useMemo(() => {
    try {
      const dateParts = selectedDate.split('-');
      const dateObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
      return dateObj.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch (e) {
      return selectedDate;
    }
  }, [selectedDate]);

  const handlePreviousDay = () => {
    try {
      const dateParts = selectedDate.split('-');
      const dateObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
      dateObj.setDate(dateObj.getDate() - 1);
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${d}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNextDay = () => {
    try {
      const dateParts = selectedDate.split('-');
      const dateObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
      dateObj.setDate(dateObj.getDate() + 1);
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${d}`);
    } catch (e) {
      console.error(e);
    }
  };

  // Build location filter list from live data
  const locationFilters = useMemo(
    () => ['All', ...locations.map((l) => l.name)],
    [locations]
  );

  // Resolve the location ID for the current filter
  const selectedLocationId = useMemo(() => {
    if (selectedFilter === 'All') return null;
    const loc = locations.find((l) => l.name === selectedFilter);
    return loc?.id ?? null;
  }, [selectedFilter, locations]);

  // Fetch dashboard data when date or filter changes
  useEffect(() => {
    if (locationsLoading) return; // wait for locations to load first
    fetchDashboard(selectedDate, selectedLocationId);
  }, [selectedDate, selectedLocationId, locationsLoading, fetchDashboard]);


  // KPI derived values with null safety
  const progress = kpis
    ? kpis.monthlyTarget > 0
      ? Math.round(kpis.monthlyProgress)
      : 0
    : 0;

  const yesterdayFormatted = useMemo(() => {
    if (!kpis?.yesterdayDate) return '';
    try {
      const dateParts = kpis.yesterdayDate.split('-');
      const dateObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
      return dateObj.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (e) {
      return kpis.yesterdayDate;
    }
  }, [kpis?.yesterdayDate]);

  if (loading || locationsLoading) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Dashboard" subtitle={formattedDate} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!kpis && !loading) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Dashboard" subtitle={formattedDate} />
        {/* Date Navigation Bar */}
        <div className="px-4 mb-3 flex items-center justify-between gap-3">
          <button
            onClick={handlePreviousDay}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-650 transition-all shadow-sm active:scale-95 min-h-[38px]"
          >
            <span>◀</span>
            <span>Previous</span>
          </button>

          <div className="flex-1 text-center py-2 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 shadow-inner min-h-[38px] flex items-center justify-center">
            <span className="text-xs font-bold text-gray-800 dark:text-white truncate max-w-[200px]">
              {selectedDateFormatted}
            </span>
          </div>

          <button
            onClick={handleNextDay}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-650 transition-all shadow-sm active:scale-95 min-h-[38px]"
          >
            <span>Next</span>
            <span>▶</span>
          </button>
        </div>

        {/* Date Picker */}
        <div className="px-4 mb-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
          />
        </div>
        <EmptyState
          icon="📊"
          title="No data available"
          description="No processing data found for the selected date. Try choosing a different date or add entries from the Daily Entry page."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Dashboard" subtitle={formattedDate} />

      {/* Date Navigation Bar */}
      <div className="px-4 mb-3 flex items-center justify-between gap-3">
        <button
          onClick={handlePreviousDay}
          className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-650 transition-all shadow-sm active:scale-95 min-h-[38px]"
        >
          <span>◀</span>
          <span>Previous</span>
        </button>

        <div className="flex-1 text-center py-2 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 shadow-inner min-h-[38px] flex items-center justify-center">
          <span className="text-xs font-bold text-gray-800 dark:text-white truncate max-w-[200px]">
            {selectedDateFormatted}
          </span>
        </div>

        <button
          onClick={handleNextDay}
          className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-650 transition-all shadow-sm active:scale-95 min-h-[38px]"
        >
          <span>Next</span>
          <span>▶</span>
        </button>
      </div>

      {/* Date Picker */}
      <div className="px-4 mb-3">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
        />
      </div>

      {/* Location Filter Pills */}
      <div className="px-4 mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {locationFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 min-h-[36px] ${
                selectedFilter === filter
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/25'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="px-4 mb-4 space-y-3">
        {/* Workforce KPI — Full-width expanded card with breakdowns */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">👷</span>
            <span className="text-sm font-semibold text-gray-700">Workforce & Sanitization Breakdown</span>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Labour Breakdown</p>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold">
                {kpis?.labourTotal ?? 0} total
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* KG Basic */}
              <div className="bg-indigo-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-wide">KG Basic</p>
                <p className="text-xl font-bold text-indigo-700 mt-0.5">{kpis?.labourKgBasic ?? 0}</p>
              </div>
              {/* Daily Wage */}
              <div className="bg-indigo-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-wide">Daily Wage</p>
                <p className="text-xl font-bold text-indigo-700 mt-0.5">{kpis?.labourDailyWage ?? 0}</p>
              </div>
              {/* Company Ladies */}
              <div className="bg-indigo-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-wide">Company Ladies</p>
                <p className="text-xl font-bold text-indigo-700 mt-0.5">{kpis?.labourCompany ?? 0}</p>
              </div>
              {/* Non Locals */}
              <div className="bg-indigo-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-wide">Non Locals</p>
                <p className="text-xl font-bold text-indigo-700 mt-0.5">{kpis?.labourNonLocals ?? 0}</p>
              </div>
            </div>
          </div>

          {/* Remaining Workforce Headcount */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Workforce Breakdown</p>
              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-xs font-bold">
                {((kpis?.boysCount ?? 0) + (kpis?.checkingCount ?? 0) + (kpis?.cleaningCount ?? 0) + (kpis?.qcCount ?? 0) + (kpis?.securityCount ?? 0))} total
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* Boys */}
              <div className="bg-teal-50 rounded-xl px-3 py-2.5 flex flex-col items-center justify-center">
                <p className="text-[10px] text-teal-500 font-medium uppercase tracking-wide">Boys</p>
                <p className="text-xl font-bold text-teal-700 mt-0.5">{kpis?.boysCount ?? 0}</p>
              </div>
              {/* Checking */}
              <div className="bg-teal-50 rounded-xl px-3 py-2.5 flex flex-col items-center justify-center">
                <p className="text-[10px] text-teal-500 font-medium uppercase tracking-wide">Checking</p>
                <p className="text-xl font-bold text-teal-700 mt-0.5">{kpis?.checkingCount ?? 0}</p>
              </div>
              {/* Cleaning */}
              <div className="bg-teal-50 rounded-xl px-3 py-2.5 flex flex-col items-center justify-center">
                <p className="text-[10px] text-teal-500 font-medium uppercase tracking-wide">Cleaning</p>
                <p className="text-xl font-bold text-teal-700 mt-0.5">{kpis?.cleaningCount ?? 0}</p>
              </div>
              {/* QC */}
              <div className="bg-teal-50 rounded-xl px-3 py-2.5 flex flex-col items-center justify-center">
                <p className="text-[10px] text-teal-500 font-medium uppercase tracking-wide">QC</p>
                <p className="text-xl font-bold text-teal-700 mt-0.5">{kpis?.qcCount ?? 0}</p>
              </div>
              {/* Security */}
              <div className="bg-teal-50 rounded-xl px-3 py-2.5 flex flex-col items-center justify-center col-span-2">
                <p className="text-[10px] text-teal-500 font-medium uppercase tracking-wide">Security</p>
                <p className="text-xl font-bold text-teal-700 mt-0.5">{kpis?.securityCount ?? 0}</p>
              </div>
            </div>
          </div>

          {/* Sanitization Headcount */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Sanitization Breakdown</p>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-bold">
                {kpis?.sanitizationTotal ?? 0} total
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Cleaning Labour */}
              <div className="bg-purple-50 rounded-xl px-2 py-2.5 flex flex-col items-center justify-center text-center">
                <p className="text-[9px] text-purple-500 font-medium uppercase tracking-wide leading-tight">Cleaning Labour</p>
                <p className="text-lg font-bold text-purple-700 mt-0.5">{kpis?.sanitizationCleaningLabour ?? 0}</p>
              </div>
              {/* NMR Labour */}
              <div className="bg-purple-50 rounded-xl px-2 py-2.5 flex flex-col items-center justify-center text-center">
                <p className="text-[9px] text-purple-500 font-medium uppercase tracking-wide leading-tight">NMR Labour</p>
                <p className="text-lg font-bold text-purple-700 mt-0.5">{kpis?.sanitizationNmrLabour ?? 0}</p>
              </div>
              {/* Washroom Cleaning */}
              <div className="bg-purple-50 rounded-xl px-2 py-2.5 flex flex-col items-center justify-center text-center">
                <p className="text-[9px] text-purple-500 font-medium uppercase tracking-wide leading-tight">Washroom</p>
                <p className="text-lg font-bold text-purple-700 mt-0.5">{kpis?.sanitizationWashroomCleaning ?? 0}</p>
              </div>
              {/* Grading Machine */}
              <div className="bg-purple-50 rounded-xl px-2 py-2.5 flex flex-col items-center justify-center text-center">
                <p className="text-[9px] text-purple-500 font-medium uppercase tracking-wide leading-tight">Grading M/C</p>
                <p className="text-lg font-bold text-purple-700 mt-0.5">{kpis?.sanitizationGradingMachineCleaning ?? 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Supervisors — Full-width big card with all names */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👔</span>
              <span className="text-sm font-semibold text-gray-700">Supervisors Present</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-teal-600">{kpis?.supervisorsPresent ?? 0}</span>
              {(kpis?.supervisorsPresent ?? 0) > 10 && (
                <span className="px-2 py-0.5 bg-teal-50 text-teal-600 rounded-full text-[10px] font-bold">scroll ↕</span>
              )}
            </div>
          </div>

          {/* Names grid — scrollable after 10 supervisors */}
          {(kpis?.supervisorNames ?? []).length === 0 ? (
            <div className="flex items-center justify-center py-6 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-400">No supervisors present today</p>
            </div>
          ) : (
            <div
              className="overflow-y-auto"
              style={{ maxHeight: (kpis?.supervisorsPresent ?? 0) > 10 ? '220px' : 'none' }}
            >
              <div className="grid grid-cols-2 gap-2">
                {(kpis?.supervisorNames ?? []).map((name, idx) => (
                  <div
                    key={`${name}-${idx}`}
                    className="flex items-center gap-2.5 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2.5"
                  >
                    {/* Avatar circle with initial */}
                    <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-teal-800 truncate">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location breakdown sub-line */}
          {kpis?.supervisorBreakdown && (
            <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100 font-medium">
              📍 {kpis.supervisorBreakdown}
            </p>
          )}
        </div>

        {/* WIP Breakdown Table */}
        {locationBreakdowns.length > 0 && (
          <div className={`rounded-2xl overflow-hidden shadow-sm border ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} flex items-center justify-between`}>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-700'}`}>
                🔄 WIP Breakdown by Location
              </h3>
              <span className="px-2.5 py-0.5 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 rounded-full text-[10px] font-bold">
                Work In Process
              </span>
            </div>
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-purple-600 text-white">
                    <th className="text-left px-3 py-3 font-bold min-w-[80px] tracking-wide">Location</th>
                    <th className="text-center px-2 py-3 font-bold whitespace-nowrap">WIP: HON→HL</th>
                    <th className="text-center px-2 py-3 font-bold whitespace-nowrap">WIP: HL→VA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {locationBreakdowns.map((lb, idx) => {
                    const rowBg = idx % 2 === 0 
                      ? (isDark ? 'bg-gray-800/30' : 'bg-white') 
                      : (isDark ? 'bg-gray-800/10' : 'bg-gray-50/50');
                    return (
                      <tr key={lb.location.id} className={`${rowBg} hover:bg-purple-50/10 dark:hover:bg-purple-900/5 transition-colors`}>
                        <td className={`px-3 py-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {lb.location.name}
                        </td>
                        <td className="text-center px-2 py-3 text-purple-650 dark:text-purple-400 font-semibold">
                          {lb.wipHonToHeadless > 0 ? lb.wipHonToHeadless.toFixed(1) : <span className="text-gray-300 dark:text-gray-700 font-normal">—</span>}
                        </td>
                        <td className="text-center px-2 py-3 text-purple-650 dark:text-purple-400 font-semibold">
                          {lb.wipHeadlessToVa > 0 ? lb.wipHeadlessToVa.toFixed(1) : <span className="text-gray-300 dark:text-gray-700 font-normal">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals Row */}
                  <tr className={`font-bold border-t-2 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-gray-100/70 border-gray-200 text-gray-900'}`}>
                    <td className="px-3 py-3.5 font-bold">Total</td>
                    <td className="text-center px-2 py-3.5 text-purple-750 dark:text-purple-400">
                      {locationBreakdowns.reduce((s, lb) => s + lb.wipHonToHeadless, 0).toFixed(1)}
                    </td>
                    <td className="text-center px-2 py-3.5 text-purple-750 dark:text-purple-400">
                      {locationBreakdowns.reduce((s, lb) => s + lb.wipHeadlessToVa, 0).toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )/* WIP Breakdown Table */ }

        {/* Completed Breakdown Table */}
        {locationBreakdowns.length > 0 && (
          <div className={`rounded-2xl overflow-hidden shadow-sm border ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} flex items-center justify-between`}>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-700'}`}>
                ✅ Completed Breakdown by Location {yesterdayFormatted && `(Yesterday: ${yesterdayFormatted})`}
              </h3>
              <span className="px-2.5 py-0.5 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 rounded-full text-[10px] font-bold">
                Completed Qty
              </span>
            </div>
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-teal-600 text-white">
                    <th className="text-left px-3 py-3 font-bold min-w-[80px] tracking-wide">Location</th>
                    <th className="text-center px-2 py-3 font-bold whitespace-nowrap">Comp: HON→HL</th>
                    <th className="text-center px-2 py-3 font-bold whitespace-nowrap">Comp: HL→VA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {locationBreakdowns.map((lb, idx) => {
                    const rowBg = idx % 2 === 0 
                      ? (isDark ? 'bg-gray-800/30' : 'bg-white') 
                      : (isDark ? 'bg-gray-800/10' : 'bg-gray-50/50');
                    return (
                      <tr key={lb.location.id} className={`${rowBg} hover:bg-teal-50/10 dark:hover:bg-teal-900/5 transition-colors`}>
                        <td className={`px-3 py-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {lb.location.name}
                        </td>
                        <td className="text-center px-2 py-3 text-orange-650 dark:text-orange-450 font-semibold">
                          {lb.completedHonToHeadless > 0 ? lb.completedHonToHeadless.toFixed(1) : <span className="text-gray-300 dark:text-gray-700 font-normal">—</span>}
                        </td>
                        <td className="text-center px-2 py-3 text-orange-650 dark:text-orange-450 font-semibold">
                          {lb.completedHeadlessToVa > 0 ? lb.completedHeadlessToVa.toFixed(1) : <span className="text-gray-300 dark:text-gray-700 font-normal">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals Row */}
                  <tr className={`font-bold border-t-2 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-gray-100/70 border-gray-200 text-gray-900'}`}>
                    <td className="px-3 py-3.5 font-bold">Total</td>
                    <td className="text-center px-2 py-3.5 text-orange-750 dark:text-orange-450">
                      {locationBreakdowns.reduce((s, lb) => s + lb.completedHonToHeadless, 0).toFixed(1)}
                    </td>
                    <td className="text-center px-2 py-3.5 text-orange-750 dark:text-orange-450">
                      {locationBreakdowns.reduce((s, lb) => s + lb.completedHeadlessToVa, 0).toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )/* Completed Breakdown Table */}

        {/* Monthly Progress — full width */}
        <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-2xl p-4 shadow-sm border border-teal-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🎯</span>
            <span className="text-xs font-medium text-teal-600">Monthly Progress</span>
          </div>
          <p className="text-2xl font-bold text-teal-700">
            {kpis?.monthlyProcessed ?? 0}
            <span className="text-sm font-medium text-teal-500">/{kpis?.monthlyTarget ?? 0} kg</span>
          </p>
          <div className="mt-2 bg-teal-200/50 rounded-full h-2 overflow-hidden">
            <div
              className="bg-teal-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-teal-600 mt-1 font-medium">{progress}% complete</p>
        </div>

      </div>


    </div>
  );
}

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


  // Prepare workforce summary data
  const workforceData = useMemo(
    () =>
      locationBreakdowns.map((loc) => ({
        name: loc.location.name,
        headcount: loc.workforce,
        supervisors: loc.supervisors,
      })),
    [locationBreakdowns]
  );

  // KPI derived values with null safety
  const progress = kpis
    ? kpis.monthlyTarget > 0
      ? Math.round(kpis.monthlyProgress)
      : 0
    : 0;

  const dailyNeeded = kpis?.dailyAverageNeeded ?? 0;
  const daysRemaining = kpis?.daysRemaining ?? 0;

  const statusColor =
    dailyNeeded <= 40 ? 'text-emerald-600' : dailyNeeded <= 50 ? 'text-amber-600' : 'text-rose-600';
  const statusBg =
    dailyNeeded <= 40
      ? 'from-emerald-50 to-emerald-100/50 border-emerald-200'
      : dailyNeeded <= 50
      ? 'from-amber-50 to-amber-100/50 border-amber-200'
      : 'from-rose-50 to-rose-100/50 border-rose-200';

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

        {/* Workforce KPI — Full-width expanded card with labour breakdown */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👷</span>
              <span className="text-sm font-semibold text-gray-700">Total Workforce</span>
            </div>
            <span className="text-3xl font-bold text-gray-900">{kpis?.totalWorkforce ?? 0}</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">Total headcount today</p>

          {/* Labour sub-categories */}
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

        {/* Today's Processing — full width with sub-categories */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📦</span>
              <span className="text-sm font-semibold text-gray-700">Processing Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-3xl font-bold text-amber-600">{(kpis?.todaysProcessing ?? 0).toFixed(1)}</span>
              <span className="text-sm font-medium text-gray-400">kg</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Total kg processed today</p>

          {/* Processing sub-categories */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-2">Processing Breakdown</p>
            <div className="grid grid-cols-2 gap-2">
              {/* HON to Headless */}
              <div className="bg-orange-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-orange-500 font-medium uppercase tracking-wide">HON to Headless</p>
                <p className="text-xl font-bold text-orange-700 mt-0.5">
                  {(kpis?.honToHeadless ?? 0).toFixed(1)}
                  <span className="text-xs font-medium text-orange-400 ml-1">kg</span>
                </p>
              </div>
              {/* Headless to VA */}
              <div className="bg-orange-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-orange-500 font-medium uppercase tracking-wide">Headless to VA</p>
                <p className="text-xl font-bold text-orange-700 mt-0.5">
                  {(kpis?.headlessToVa ?? 0).toFixed(1)}
                  <span className="text-xs font-medium text-orange-400 ml-1">kg</span>
                </p>
              </div>
            </div>
          </div>
        </div>

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

      {/* Daily Average Needed Card */}
      <div className="px-4 mb-4">
        <div className={`bg-gradient-to-br ${statusBg} rounded-2xl p-5 border`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Daily Avg Needed</p>
              <p className={`text-4xl font-bold mt-1 ${statusColor}`}>
                {dailyNeeded.toFixed(1)}
                <span className="text-base font-medium ml-1">kg/day</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {daysRemaining} days remaining to reach target
              </p>
            </div>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              dailyNeeded <= 40 ? 'bg-emerald-100' : dailyNeeded <= 50 ? 'bg-amber-100' : 'bg-rose-100'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-7 h-7 ${statusColor}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
          </div>
        </div>
      </div>


      {/* Workforce Summary */}
      <div className="px-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Workforce by Location</h3>
        <div className="space-y-2">
          {workforceData.map((loc) => (
            <div key={loc.name} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <span className="text-sm font-bold text-teal-600">{loc.name.replace('PPC ', '')}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                  <p className="text-xs text-gray-400">{loc.supervisors} supervisors</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900">{loc.headcount}</p>
                <p className="text-xs text-gray-400">workers</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

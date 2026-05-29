'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { useDashboard } from '@/hooks/useDashboard';
import { useLocations } from '@/hooks/useLocations';
import { format, parseISO } from 'date-fns';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

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

  const { kpis, locationBreakdowns, processingTrend, loading, fetchDashboard } = useDashboard();
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

  // Prepare trend chart data: group by date and sum kg across locations
  const trendChartData = useMemo(() => {
    const dateMap = new Map<string, number>();
    for (const entry of processingTrend) {
      const existing = dateMap.get(entry.date) ?? 0;
      dateMap.set(entry.date, existing + entry.kg);
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => ({
        day: format(parseISO(date), 'EEE'),
        kg: Math.round(kg * 10) / 10,
      }));
  }, [processingTrend]);

  // Prepare location bar chart data
  const locationChartData = useMemo(
    () =>
      locationBreakdowns.map((loc) => ({
        name: loc.location.name,
        kg: loc.processing,
      })),
    [locationBreakdowns]
  );

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
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        {/* Total Workforce */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">👷</span>
            <span className="text-xs font-medium text-gray-500">Workforce</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{kpis?.totalWorkforce ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">Total headcount today</p>
        </div>

        {/* Supervisors */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">👔</span>
            <span className="text-xs font-medium text-gray-500">Supervisors</span>
          </div>
          
          <div className="flex items-center gap-3 min-h-[40px]">
            <p className="text-3xl font-bold text-teal-600">{kpis?.supervisorsPresent ?? 0}</p>
            {selectedFilter !== 'All' && kpis?.supervisorNames && kpis.supervisorNames.length > 0 && (
              <div className="flex-1 max-h-12 overflow-y-auto py-0.5 scrollbar-hide">
                <div className="flex flex-wrap gap-1">
                  {kpis.supervisorNames.map((name) => (
                    <span
                      key={name}
                      className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-lg font-semibold text-[10px] whitespace-nowrap"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {selectedFilter === 'All' ? (
            <p className="text-xs text-gray-400 mt-1 font-medium truncate" title={kpis?.supervisorBreakdown}>
              {kpis?.supervisorBreakdown || 'None present today'}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">
              {kpis?.supervisorsPresent === 0 ? 'No supervisors present' : 'Present today'}
            </p>
          )}
        </div>

        {/* Today's Processing */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">📦</span>
            <span className="text-xs font-medium text-gray-500">Processing</span>
          </div>
          <p className="text-3xl font-bold text-amber-600">
            {kpis?.todaysProcessing ?? 0}
            <span className="text-sm font-medium text-gray-400 ml-1">kg</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Processed today</p>
        </div>

        {/* Monthly Progress */}
        <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-2xl p-4 shadow-sm border border-teal-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🎯</span>
            <span className="text-xs font-medium text-teal-600">Monthly</span>
          </div>
          <p className="text-2xl font-bold text-teal-700">
            {kpis?.monthlyProcessed ?? 0}
            <span className="text-sm font-medium text-teal-500">/{kpis?.monthlyTarget ?? 0}</span>
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

      {/* Processing Trend Chart */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Processing Trend (Last 7 Days)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1F2937' : '#F3F4F6'} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{
                    background: isDark ? '#1F2937' : 'white',
                    border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: isDark ? '#F3F4F6' : '#111827' }}
                  labelStyle={{ color: isDark ? '#9CA3AF' : '#6B7280' }}
                  formatter={(value) => [`${value} kg`, 'Processed']}
                />
                <Line
                  type="monotone"
                  dataKey="kg"
                  stroke="#0D9488"
                  strokeWidth={2.5}
                  dot={{ fill: '#0D9488', r: 4, strokeWidth: 2, stroke: 'white' }}
                  activeDot={{ r: 6, fill: '#0D9488', stroke: 'white', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Location Breakdown Chart */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Today&apos;s Processing by Location</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={locationChartData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1F2937' : '#F3F4F6'} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{
                    background: isDark ? '#1F2937' : 'white',
                    border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: isDark ? '#F3F4F6' : '#111827' }}
                  labelStyle={{ color: isDark ? '#9CA3AF' : '#6B7280' }}
                  formatter={(value) => [`${value} kg`, 'Processed']}
                />
                <Bar dataKey="kg" radius={[8, 8, 0, 0]} fill="#0D9488" />
              </BarChart>
            </ResponsiveContainer>
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

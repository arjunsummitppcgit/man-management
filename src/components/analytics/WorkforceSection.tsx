'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { Location } from '@/types';
import type { AnalyticsData, WorkforceRow } from '@/hooks/useAnalytics';
import { sumByDate, sumByLocation } from '@/hooks/useAnalytics';
import {
  ChipRow,
  ChartCard,
  EmptyChart,
  AnalyticsTable,
  ExportButtons,
  chartTheme,
  fmtInt,
  fmtDay,
  SERIES_COLORS,
} from './shared';

const CATEGORIES: { key: keyof WorkforceRow; label: string; color: string }[] = [
  { key: 'labour_count', label: 'Labour', color: '#0d9488' },
  { key: 'boys_count', label: 'Boys', color: '#f59e0b' },
  { key: 'checking_count', label: 'Checking', color: '#6366f1' },
  { key: 'cleaning_count', label: 'Cleaning', color: '#0ea5e9' },
  { key: 'qc_count', label: 'QC', color: '#a855f7' },
  { key: 'security_count', label: 'Security', color: '#f43f5e' },
];

export default function WorkforceSection({
  data,
  locations,
  locationFilter,
  isDark,
  rangeLabel,
}: {
  data: AnalyticsData;
  locations: Location[];
  locationFilter: string | null;
  isDark: boolean;
  rangeLabel: string;
}) {
  const theme = chartTheme(isDark);

  const rows = useMemo(
    () => data.workforce.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.workforce, locationFilter]
  );

  const byDate = useMemo(() => sumByDate(rows, (r) => r.total_headcount), [rows]);
  const byLocation = useMemo(() => sumByLocation(rows, locations, (r) => r.total_headcount), [rows, locations]);

  const total = byDate.reduce((s, d) => s + d.value, 0);
  const activeDays = byDate.filter((d) => d.value > 0).length;
  const dailyAvg = activeDays > 0 ? total / activeDays : 0;
  const peak = byDate.reduce((acc, d) => (d.value > acc.value ? d : acc), { date: '', value: 0 });

  const categoryTotals = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        name: c.label,
        value: rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0),
        color: c.color,
      })).filter((c) => c.value > 0),
    [rows]
  );

  const chips = [
    {
      label: 'Total Attendance',
      value: fmtInt(total),
      sub: `person-days · ${rangeLabel}`,
      accent: 'from-purple-500 to-fuchsia-600',
      icon: '👥',
    },
    {
      label: 'Daily Average',
      value: fmtInt(Math.round(dailyAvg)),
      sub: `across ${activeDays} active day${activeDays === 1 ? '' : 's'}`,
      accent: 'from-teal-500 to-emerald-500',
      icon: '📊',
    },
    {
      label: 'Peak Day',
      value: peak.date ? fmtInt(peak.value) : '—',
      sub: peak.date ? fmtDay(peak.date) : 'no attendance yet',
      accent: 'from-amber-400 to-orange-500',
      icon: '⛰️',
    },
    {
      label: 'Largest Category',
      value: categoryTotals.length > 0 ? categoryTotals.reduce((a, b) => (b.value > a.value ? b : a)).name : '—',
      sub:
        categoryTotals.length > 0
          ? `${fmtInt(categoryTotals.reduce((a, b) => (b.value > a.value ? b : a)).value)} person-days`
          : 'no data',
      accent: 'from-indigo-500 to-violet-600',
      icon: '🏅',
    },
  ];

  const trendData = byDate.map((d) => ({ date: fmtDay(d.date), headcount: d.value }));
  const hasData = total > 0;

  const tableHeaders = ['Date', ...CATEGORIES.map((c) => c.label), 'Total'];
  const tableRows = useMemo(
    () =>
      Array.from(
        rows.reduce((map, r) => {
          const cur = map.get(r.work_date) || new Array(CATEGORIES.length + 1).fill(0);
          CATEGORIES.forEach((c, i) => {
            cur[i] += Number(r[c.key]) || 0;
          });
          cur[CATEGORIES.length] += r.total_headcount || 0;
          map.set(r.work_date, cur);
          return map;
        }, new Map<string, number[]>())
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => [fmtDay(date), ...vals.map((v) => (v > 0 ? fmtInt(v) : 0))]),
    [rows]
  );
  const footer = [
    'Total',
    ...CATEGORIES.map((c) => {
      const t = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      return t > 0 ? fmtInt(t) : '—';
    }),
    fmtInt(total),
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <ChartCard title="Attendance Trend" subtitle={`total headcount per day · ${rangeLabel}`} className="xl:col-span-6">
          {hasData ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trendData} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="wfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="date" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} formatter={(value) => [fmtInt(Number(value)), 'Headcount']} />
                <Area
                  type="monotone"
                  dataKey="headcount"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  fill="url(#wfFill)"
                  dot={{ r: 3, fill: '#a855f7', strokeWidth: 2, stroke: isDark ? '#111827' : '#ffffff' }}
                  activeDot={{ r: 5 }}
                  animationDuration={1100}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No workforce attendance in ${rangeLabel}`} />
          )}
        </ChartCard>

        <ChartCard title="Category Split" subtitle="share of total person-days" className="xl:col-span-3">
          {categoryTotals.length > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={categoryTotals}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="86%"
                    paddingAngle={3}
                    cornerRadius={6}
                    animationDuration={1000}
                  >
                    {categoryTotals.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={theme.tooltipStyle} formatter={(value) => [fmtInt(Number(value))]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
                <p className="text-lg font-bold text-gray-900 font-display leading-none">{fmtInt(total)}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-1">total</p>
              </div>
            </div>
          ) : (
            <EmptyChart message="No category data" />
          )}
        </ChartCard>

        <ChartCard title="By Location" subtitle="total headcount per location" className="xl:col-span-3">
          {byLocation.some((l) => l.value > 0) ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={byLocation} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} formatter={(value) => [fmtInt(Number(value))]} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={40} animationDuration={900}>
                  {byLocation.map((entry, i) => (
                    <Cell key={entry.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No location data" />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Workforce Attendance Detail" subtitle="daily headcount by category">
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Workforce Attendance — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer]}
            filename="workforce-attendance"
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
      </ChartCard>
    </div>
  );
}

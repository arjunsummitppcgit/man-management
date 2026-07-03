'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
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
  AreaChart,
  Area,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { LocationBreakdown } from '@/types';

interface ProcessingChartsProps {
  breakdowns: LocationBreakdown[];
  trend: { date: string; kg: number; location: string }[];
  yesterdayLabel: string;
  isDark: boolean;
}

const PIE_COLORS = ['#0d9488', '#f59e0b', '#6366f1', '#f43f5e', '#a855f7', '#0ea5e9', '#84cc16'];

const fmt = (v: number) =>
  v.toLocaleString('en-IN', { maximumFractionDigits: 3 });

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[240px] gap-2">
      <span className="text-3xl opacity-50">📈</span>
      <p className="text-xs text-gray-400 font-medium">{message}</p>
    </div>
  );
}

export default function ProcessingCharts({
  breakdowns,
  trend,
  yesterdayLabel,
  isDark,
}: ProcessingChartsProps) {
  // Per-location comparison: yesterday's completed vs today's WIP (HL→VA)
  const barData = useMemo(
    () =>
      breakdowns.map((lb) => ({
        name: lb.location.name,
        Yesterday: Number((lb.completedHeadlessToVa || 0).toFixed(3)),
        Today: Number((lb.wipHeadlessToVa || 0).toFixed(3)),
      })),
    [breakdowns]
  );

  const pieData = useMemo(
    () =>
      breakdowns
        .filter((lb) => (lb.completedHeadlessToVa || 0) > 0)
        .map((lb) => ({
          name: lb.location.name,
          value: Number((lb.completedHeadlessToVa || 0).toFixed(3)),
        })),
    [breakdowns]
  );

  // Aggregate the 7-day trend across locations, one point per day
  const trendData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of trend) {
      byDate.set(row.date, (byDate.get(row.date) || 0) + row.kg);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => {
        let label = date;
        try {
          label = format(parseISO(date), 'd MMM');
        } catch {
          /* keep raw date */
        }
        return { date: label, kg: Number(kg.toFixed(3)) };
      });
  }, [trend]);

  const totalYesterday = useMemo(
    () => barData.reduce((s, d) => s + d.Yesterday, 0),
    [barData]
  );
  const totalToday = useMemo(
    () => barData.reduce((s, d) => s + d.Today, 0),
    [barData]
  );
  const totalWeek = useMemo(
    () => trendData.reduce((s, d) => s + d.kg, 0),
    [trendData]
  );

  const diff = totalToday - totalYesterday;
  const diffPct = totalYesterday > 0 ? (diff / totalYesterday) * 100 : null;
  const diffUp = diff >= 0;

  const hasBarData = barData.some((d) => d.Yesterday > 0 || d.Today > 0);
  const hasTrendData = trendData.some((d) => d.kg > 0);

  const axisTick = { fill: isDark ? '#7c8aa0' : '#94a3b8', fontSize: 11, fontWeight: 600 } as const;
  const gridStroke = isDark ? 'rgba(148,163,184,0.12)' : '#eef2f6';
  const tooltipStyle: React.CSSProperties = {
    background: isDark ? 'rgba(17,24,39,0.96)' : 'rgba(255,255,255,0.98)',
    border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : '#e5e7eb'}`,
    borderRadius: 12,
    boxShadow: '0 12px 32px -8px rgba(2,32,30,0.25)',
    fontSize: 12,
    fontWeight: 600,
    color: isDark ? '#f3f4f6' : '#111827',
  };

  const statChips = [
    {
      label: `Completed · ${yesterdayLabel || 'Yesterday'}`,
      value: `${fmt(totalYesterday)} kg`,
      sub: 'HL → VA finished',
      accent: 'from-teal-500 to-teal-600',
      icon: '✅',
    },
    {
      label: 'In Process · Today',
      value: `${fmt(totalToday)} kg`,
      sub: 'HL → VA work in process',
      accent: 'from-amber-400 to-orange-500',
      icon: '⚙️',
    },
    {
      label: 'Difference',
      value: `${diffUp ? '+' : ''}${fmt(diff)} kg`,
      sub: diffPct === null ? 'no baseline yesterday' : `${diffUp ? '▲' : '▼'} ${Math.abs(diffPct).toFixed(1)}% vs yesterday`,
      accent: diffUp ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-500',
      icon: diffUp ? '📈' : '📉',
    },
    {
      label: 'Last 7 Days',
      value: `${fmt(totalWeek)} kg`,
      sub: 'total completed volume',
      accent: 'from-indigo-500 to-violet-600',
      icon: '🗓️',
    },
  ];

  return (
    <section className="hidden lg:block px-4 mb-6">
      {/* Section heading */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-lg font-bold text-gray-900 tracking-tight">Processing Analytics</h2>
          <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[10px] font-bold uppercase tracking-wide">
            Live report
          </span>
        </div>
        {yesterdayLabel && (
          <p className="text-xs text-gray-400 font-medium">Comparing today&apos;s WIP against {yesterdayLabel}</p>
        )}
      </div>

      {/* KPI stat chips */}
      <div className="grid grid-cols-4 gap-4 mb-5 stagger">
        {statChips.map((chip) => (
          <div
            key={chip.label}
            className="relative overflow-hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${chip.accent}`} />
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{chip.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1.5 font-display tracking-tight truncate">
                  {chip.value}
                </p>
                <p className="text-[11px] text-gray-400 mt-1 font-medium truncate">{chip.sub}</p>
              </div>
              <span className="text-xl flex-shrink-0" aria-hidden>{chip.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-12 gap-5">
        {/* Grouped bars: per-location today vs yesterday */}
        <div className="chart-card col-span-12 xl:col-span-6 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Today vs Yesterday by Location</h3>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">HL → VA · completed vs work in process (kg)</p>
            </div>
          </div>
          {hasBarData ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData} barGap={5} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: isDark ? 'rgba(148,163,184,0.06)' : 'rgba(13,148,136,0.05)' }}
                  formatter={(value) => [`${fmt(Number(value))} kg`]}
                />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                <Bar dataKey="Yesterday" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={38} animationDuration={900} animationEasing="ease-out" />
                <Bar dataKey="Today" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={38} animationDuration={900} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No processing recorded for these dates yet" />
          )}
        </div>

        {/* Donut: yesterday's completed share by location */}
        <div className="chart-card col-span-6 xl:col-span-3 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">Completed Share</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-0.5 mb-2">
            {yesterdayLabel ? `by location · ${yesterdayLabel}` : 'by location · yesterday'}
          </p>
          {pieData.length > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={3}
                    cornerRadius={6}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${fmt(Number(value))} kg`]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center total */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
                <p className="text-lg font-bold text-gray-900 font-display leading-none">{fmt(totalYesterday)}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-1">kg total</p>
              </div>
            </div>
          ) : (
            <EmptyChart message="No completed quantity yesterday" />
          )}
        </div>

        {/* 7-day trend area */}
        <div className="chart-card col-span-6 xl:col-span-3 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">7-Day Trend</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-0.5 mb-2">completed kg per day · all locations</p>
          {hasTrendData ? (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={trendData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${fmt(Number(value))} kg`, 'Completed']} />
                <Area
                  type="monotone"
                  dataKey="kg"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fill="url(#trendFill)"
                  dot={{ r: 3, fill: '#0d9488', strokeWidth: 2, stroke: isDark ? '#111827' : '#ffffff' }}
                  activeDot={{ r: 5 }}
                  animationDuration={1100}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No processing in the last 7 days" />
          )}
        </div>
      </div>
    </section>
  );
}

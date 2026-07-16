'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';
import type { Location } from '@/types';
import type { AnalyticsData } from '@/hooks/useAnalytics';
import { ChipRow, ChartCard, EmptyChart, AnalyticsTable, ExportButtons, chartTheme, fmt } from './shared';

export default function VaTargetSection({
  data,
  locations,
  isDark,
}: {
  data: AnalyticsData;
  locations: Location[];
  isDark: boolean;
}) {
  const theme = chartTheme(isDark);

  const targetKg = data.combinedTarget?.target_kg || 0;
  const completedKg = useMemo(
    () => data.monthHlVa.reduce((s, r) => s + (r.va_kgs || 0), 0),
    [data.monthHlVa]
  );
  const pct = targetKg > 0 ? Math.min(100, (completedKg / targetKg) * 100) : 0;
  const remaining = Math.max(0, targetKg - completedKg);

  const donutData = [
    { name: 'Completed', value: completedKg },
    { name: 'Remaining', value: remaining },
  ];

  // Per-location: monthly target vs achieved VA kgs (like the sketch's bar list)
  const locationRows = useMemo(() => {
    const achievedByLoc = new Map<string, number>();
    for (const row of data.monthHlVa) {
      if (!row.location_id) continue;
      achievedByLoc.set(row.location_id, (achievedByLoc.get(row.location_id) || 0) + (row.va_kgs || 0));
    }
    const targetByLoc = new Map<string, number>();
    for (const t of data.locationTargets) {
      if (t.location_id) targetByLoc.set(t.location_id, t.target_kg || 0);
    }
    return locations
      .map((loc) => ({
        name: loc.name,
        Target: Number((targetByLoc.get(loc.id) || 0).toFixed(3)),
        Achieved: Number((achievedByLoc.get(loc.id) || 0).toFixed(3)),
      }))
      .filter((r) => r.Target > 0 || r.Achieved > 0);
  }, [data.monthHlVa, data.locationTargets, locations]);

  const chips = [
    {
      label: `Target · ${data.monthLabel}`,
      value: `${fmt(targetKg)} kg`,
      sub: 'combined monthly VA target',
      accent: 'from-teal-500 to-emerald-500',
      icon: '🎯',
    },
    {
      label: 'Completed',
      value: `${fmt(completedKg)} kg`,
      sub: 'VA kgs graded this month',
      accent: 'from-emerald-500 to-teal-600',
      icon: '✅',
    },
    {
      label: 'Remaining',
      value: `${fmt(remaining)} kg`,
      sub: 'still to process',
      accent: 'from-amber-400 to-orange-500',
      icon: '⏳',
    },
    {
      label: 'Achievement',
      value: `${pct.toFixed(1)}%`,
      sub: 'of the monthly target',
      accent: 'from-indigo-500 to-violet-600',
      icon: '🚀',
    },
  ];

  const tableHeaders = ['Location', 'Target (kg)', 'Achieved (kg)', 'Remaining (kg)', '%'];
  const tableRows = locationRows.map((r) => [
    r.name,
    fmt(r.Target),
    fmt(r.Achieved),
    fmt(Math.max(0, r.Target - r.Achieved)),
    r.Target > 0 ? `${((r.Achieved / r.Target) * 100).toFixed(1)}%` : '—',
  ]);
  const exportRows = [
    ...tableRows,
    ['Combined', fmt(targetKg), fmt(completedKg), fmt(remaining), `${pct.toFixed(1)}%`],
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        {/* Donut: target vs completed */}
        <ChartCard
          title="VA Target Progress"
          subtitle={`target vs completed · ${data.monthLabel}`}
          badge={data.monthLabel}
          className="xl:col-span-5"
        >
          {targetKg > 0 || completedKg > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="66%"
                    outerRadius="90%"
                    paddingAngle={2}
                    cornerRadius={8}
                    startAngle={90}
                    endAngle={-270}
                    animationDuration={1100}
                    animationEasing="ease-out"
                  >
                    <Cell fill="#0d9488" stroke="transparent" />
                    <Cell fill={isDark ? 'rgba(148,163,184,0.15)' : '#e8f0ef'} stroke="transparent" />
                  </Pie>
                  <Tooltip contentStyle={theme.tooltipStyle} formatter={(value) => [`${fmt(Number(value))} kg`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-3xl font-bold text-gray-900 font-display leading-none">{pct.toFixed(1)}%</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-1.5">
                  {fmt(completedKg)} / {fmt(targetKg)} kg
                </p>
              </div>
            </div>
          ) : (
            <EmptyChart message={`No target or VA entries recorded for ${data.monthLabel} yet — set one on the Targets page`} />
          )}
        </ChartCard>

        {/* Horizontal bars per location, like the sketch */}
        <ChartCard
          title="Target vs Achieved by Location"
          subtitle="monthly VA kgs per location"
          className="xl:col-span-7"
        >
          {locationRows.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(260, locationRows.length * 64)}>
              <BarChart data={locationRows} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.gridStroke} />
                <XAxis type="number" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} width={68} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} formatter={(value) => [`${fmt(Number(value))} kg`]} />
                <Bar dataKey="Target" fill={isDark ? 'rgba(148,163,184,0.28)' : '#dbe7e5'} radius={[0, 8, 8, 0]} maxBarSize={16} animationDuration={800}>
                  <LabelList dataKey="Target" position="right" formatter={(v: React.ReactNode) => fmt(Number(v))} style={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#7c8aa0' : '#94a3b8' }} />
                </Bar>
                <Bar dataKey="Achieved" fill="#0d9488" radius={[0, 8, 8, 0]} maxBarSize={16} animationDuration={1100}>
                  <LabelList dataKey="Achieved" position="right" formatter={(v: React.ReactNode) => fmt(Number(v))} style={{ fontSize: 10, fontWeight: 700, fill: '#0d9488' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No per-location targets or VA entries this month" />
          )}
        </ChartCard>
      </div>

      {/* Table + export */}
      <ChartCard title="Location Summary" subtitle={`targets and achievement · ${data.monthLabel}`}>
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`VA Target Report — ${data.monthLabel}`}
            headers={tableHeaders}
            rows={exportRows}
            filename={`va-target-${data.monthLabel.replace(' ', '-').toLowerCase()}`}
          />
        </div>
        <AnalyticsTable
          headers={tableHeaders}
          rows={tableRows}
          footer={['Combined', fmt(targetKg), fmt(completedKg), fmt(remaining), `${pct.toFixed(1)}%`]}
        />
      </ChartCard>
    </div>
  );
}

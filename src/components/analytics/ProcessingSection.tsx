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
  Cell,
} from 'recharts';
import type { Location } from '@/types';
import type { AnalyticsData } from '@/hooks/useAnalytics';
import { sumByDate, sumByLocation } from '@/hooks/useAnalytics';
import {
  ChipRow,
  ChartCard,
  EmptyChart,
  AnalyticsTable,
  ExportButtons,
  chartTheme,
  fmt,
  fmtDay,
  SERIES_COLORS,
} from './shared';

export default function ProcessingSection({
  mode,
  data,
  locations,
  locationFilter,
  isDark,
  rangeLabel,
}: {
  mode: 'hon_hl' | 'hl_va';
  data: AnalyticsData;
  locations: Location[];
  locationFilter: string | null;
  isDark: boolean;
  rangeLabel: string;
}) {
  const theme = chartTheme(isDark);
  const isHonHl = mode === 'hon_hl';
  const title = isHonHl ? 'HON → Headless' : 'Headless → VA';
  const color = isHonHl ? '#6366f1' : '#0ea5e9';
  const pick = useMemo(
    () => (isHonHl
      ? (r: { hon_to_headless: number }) => r.hon_to_headless
      : (r: { headless_to_va: number }) => r.headless_to_va),
    [isHonHl]
  );

  const rows = useMemo(
    () => data.processing.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.processing, locationFilter]
  );

  const byDate = useMemo(() => sumByDate(rows, pick), [rows, pick]);
  const byLocation = useMemo(() => sumByLocation(rows, locations, pick), [rows, locations, pick]);

  const total = byDate.reduce((s, d) => s + d.value, 0);
  const activeDays = byDate.filter((d) => d.value > 0).length;
  const dailyAvg = activeDays > 0 ? total / activeDays : 0;
  const best = byDate.reduce(
    (acc, d) => (d.value > acc.value ? d : acc),
    { date: '', value: 0 }
  );
  const topLocation = byLocation.reduce(
    (acc, l) => (l.value > acc.value ? l : acc),
    { name: '—', value: 0 }
  );

  const chips = [
    {
      label: 'Total Processed',
      value: `${fmt(total)} kg`,
      sub: `${title} · ${rangeLabel}`,
      accent: isHonHl ? 'from-indigo-500 to-violet-600' : 'from-sky-500 to-blue-600',
      icon: isHonHl ? '🔪' : '🍤',
    },
    {
      label: 'Daily Average',
      value: `${fmt(dailyAvg)} kg`,
      sub: `across ${activeDays} active day${activeDays === 1 ? '' : 's'}`,
      accent: 'from-teal-500 to-emerald-500',
      icon: '📊',
    },
    {
      label: 'Best Day',
      value: best.date ? `${fmt(best.value)} kg` : '—',
      sub: best.date ? fmtDay(best.date) : 'no production yet',
      accent: 'from-amber-400 to-orange-500',
      icon: '🏆',
    },
    {
      label: 'Top Location',
      value: topLocation.value > 0 ? topLocation.name : '—',
      sub: topLocation.value > 0 ? `${fmt(topLocation.value)} kg` : 'no data',
      accent: 'from-rose-500 to-pink-600',
      icon: '📍',
    },
  ];

  const chartData = byDate.map((d) => ({ date: fmtDay(d.date), kg: Number(d.value.toFixed(3)) }));
  const hasData = total > 0;

  // Pivot table: date rows × location columns
  const tableHeaders = useMemo(() => {
    const locCols = locationFilter
      ? locations.filter((l) => l.id === locationFilter).map((l) => l.name)
      : locations.map((l) => l.name);
    return ['Date', ...locCols, 'Total'];
  }, [locations, locationFilter]);

  const tableRows = useMemo(() => {
    const visibleLocs = locationFilter ? locations.filter((l) => l.id === locationFilter) : locations;
    const byDateLoc = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!byDateLoc.has(r.work_date)) byDateLoc.set(r.work_date, new Map());
      const m = byDateLoc.get(r.work_date)!;
      m.set(r.location_id, (m.get(r.location_id) || 0) + (pick(r) || 0));
    }
    return Array.from(byDateLoc.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, locMap]) => {
        const vals = visibleLocs.map((l) => locMap.get(l.id) || 0);
        const rowTotal = vals.reduce((s, v) => s + v, 0);
        return [fmtDay(date), ...vals.map((v) => (v > 0 ? fmt(v) : 0)), fmt(rowTotal)];
      })
      .filter((row) => row[row.length - 1] !== '0');
  }, [rows, locations, locationFilter, pick]);

  const footer = useMemo(() => {
    const visibleLocs = locationFilter ? locations.filter((l) => l.id === locationFilter) : locations;
    const totals = visibleLocs.map((l) => {
      const t = rows.filter((r) => r.location_id === l.id).reduce((s, r) => s + (pick(r) || 0), 0);
      return t > 0 ? fmt(t) : '—';
    });
    return ['Total', ...totals, fmt(total)];
  }, [rows, locations, locationFilter, total, pick]);

  const slug = isHonHl ? 'hon-to-hl' : 'hl-to-va';

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <ChartCard title={`${title} by Date`} subtitle={`completed kg per day · ${rangeLabel}`} className="xl:col-span-7">
          {hasData ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id={`fill-${mode}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="date" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} formatter={(value) => [`${fmt(Number(value))} kg`, title]} />
                <Area
                  type="monotone"
                  dataKey="kg"
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#fill-${mode})`}
                  dot={{ r: 3, fill: color, strokeWidth: 2, stroke: isDark ? '#111827' : '#ffffff' }}
                  activeDot={{ r: 5 }}
                  animationDuration={1100}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No ${title} production recorded in ${rangeLabel}`} />
          )}
        </ChartCard>

        <ChartCard title={`${title} by Location`} subtitle="total kg per location" className="xl:col-span-5">
          {byLocation.some((l) => l.value > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byLocation.map((l) => ({ ...l, value: Number(l.value.toFixed(3)) }))} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} formatter={(value) => [`${fmt(Number(value))} kg`]} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={900}>
                  {byLocation.map((entry, i) => (
                    <Cell key={entry.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No location has production in this period" />
          )}
        </ChartCard>
      </div>

      <ChartCard title={`${title} Detail`} subtitle="daily kg by location">
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`${title} Report — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer]}
            filename={`${slug}-report`}
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
      </ChartCard>
    </div>
  );
}

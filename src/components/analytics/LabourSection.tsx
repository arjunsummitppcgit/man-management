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
} from 'recharts';
import type { Location } from '@/types';
import type { AnalyticsData, WorkforceRow } from '@/hooks/useAnalytics';
import {
  ChipRow,
  ChartCard,
  EmptyChart,
  AnalyticsTable,
  ExportButtons,
  chartTheme,
  fmtInt,
  fmtAvg,
  fmtDay,
} from './shared';

const LABOUR_TYPES: { key: keyof WorkforceRow; label: string; color: string }[] = [
  { key: 'labour_kg_basic', label: 'KG Basic', color: '#0d9488' },
  { key: 'labour_daily_wage', label: 'Daily Wage', color: '#f59e0b' },
  { key: 'labour_company', label: 'Company', color: '#6366f1' },
  { key: 'labour_non_locals', label: 'Non Locals', color: '#f43f5e' },
];

export default function LabourSection({
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

  /** Days that actually have attendance recorded — the divisor for a daily average. */
  const recordedDays = useMemo(() => new Set(rows.map((r) => r.work_date)).size, [rows]);

  const typeTotals = useMemo(
    () =>
      LABOUR_TYPES.map((t) => {
        const total = rows.reduce((s, r) => s + (Number(r[t.key]) || 0), 0);
        return { ...t, total, avg: recordedDays > 0 ? total / recordedDays : 0 };
      }),
    [rows, recordedDays]
  );
  const grandTotal = typeTotals.reduce((s, t) => s + t.total, 0);
  const grandAvg = recordedDays > 0 ? grandTotal / recordedDays : 0;

  const chips = typeTotals.map((t, i) => ({
    label: t.label,
    value: fmtInt(t.total),
    sub:
      grandTotal > 0
        ? `avg ${fmtAvg(t.avg)}/day · ${((t.total / grandTotal) * 100).toFixed(1)}%`
        : 'no labour recorded',
    accent: ['from-teal-500 to-emerald-500', 'from-amber-400 to-orange-500', 'from-indigo-500 to-violet-600', 'from-rose-500 to-pink-600'][i],
    icon: ['🧺', '💵', '🏢', '🚌'][i],
  }));

  // Stacked bars: labour type per day
  const byDateStacked = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!map.has(r.work_date)) map.set(r.work_date, {});
      const entry = map.get(r.work_date)!;
      for (const t of LABOUR_TYPES) {
        entry[t.label] = (entry[t.label] || 0) + (Number(r[t.key]) || 0);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: fmtDay(date), ...vals }));
  }, [rows]);

  // Stacked bars: labour type per location
  const byLocationStacked = useMemo(() => {
    const visibleLocs = locationFilter ? locations.filter((l) => l.id === locationFilter) : locations;
    return visibleLocs
      .map((loc) => {
        const locRows = rows.filter((r) => r.location_id === loc.id);
        const entry: Record<string, number | string> = { name: loc.name };
        let total = 0;
        for (const t of LABOUR_TYPES) {
          const v = locRows.reduce((s, r) => s + (Number(r[t.key]) || 0), 0);
          entry[t.label] = v;
          total += v;
        }
        return { entry, total };
      })
      .filter((x) => x.total > 0)
      .map((x) => x.entry);
  }, [rows, locations, locationFilter]);

  const hasData = grandTotal > 0;

  const tableHeaders = ['Date', ...LABOUR_TYPES.map((t) => t.label), 'Total'];
  const tableRows = useMemo(
    () =>
      Array.from(
        rows.reduce((map, r) => {
          const cur = map.get(r.work_date) || [0, 0, 0, 0];
          LABOUR_TYPES.forEach((t, i) => {
            cur[i] += Number(r[t.key]) || 0;
          });
          map.set(r.work_date, cur);
          return map;
        }, new Map<string, number[]>())
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => [
          fmtDay(date),
          ...vals.map((v) => (v > 0 ? fmtInt(v) : 0)),
          fmtInt(vals.reduce((s, v) => s + v, 0)),
        ]),
    [rows]
  );
  const footer = ['Total', ...typeTotals.map((t) => (t.total > 0 ? fmtInt(t.total) : '—')), fmtInt(grandTotal)];
  const avgRow = [
    `Average / day (${recordedDays} day${recordedDays === 1 ? '' : 's'})`,
    ...typeTotals.map((t) => (t.total > 0 ? fmtAvg(t.avg) : '—')),
    fmtAvg(grandAvg),
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <ChartCard title="Labour by Date" subtitle={`daily attendance by type · ${rangeLabel}`} className="xl:col-span-7">
          {hasData ? (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={byDateStacked} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="date" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                {LABOUR_TYPES.map((t, i) => (
                  <Bar
                    key={t.label}
                    dataKey={t.label}
                    stackId="labour"
                    fill={t.color}
                    radius={i === LABOUR_TYPES.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={38}
                    animationDuration={900}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No labour attendance recorded in ${rangeLabel}`} />
          )}
        </ChartCard>

        <ChartCard title="Labour by Location" subtitle="total attendance by type" className="xl:col-span-5">
          {byLocationStacked.length > 0 ? (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={byLocationStacked} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                {LABOUR_TYPES.map((t, i) => (
                  <Bar
                    key={t.label}
                    dataKey={t.label}
                    stackId="labour"
                    fill={t.color}
                    radius={i === LABOUR_TYPES.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={44}
                    animationDuration={900}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No location has labour attendance in this period" />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Labour Attendance Detail"
        subtitle={
          hasData
            ? `daily headcount by labour type · ${rangeLabel} · ${recordedDays} day${recordedDays === 1 ? '' : 's'} recorded`
            : 'daily headcount by labour type'
        }
      >
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Labour Attendance — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer, avgRow]}
            filename="labour-attendance"
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
        {hasData && (
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            {typeTotals.map((t) => (
              <div key={t.label} className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{t.label}</p>
                <p className="text-base font-bold mt-0.5 font-display tracking-tight" style={{ color: t.color }}>
                  {fmtAvg(t.avg)}
                </p>
                <p className="text-[10px] text-gray-400 font-medium">avg per day</p>
              </div>
            ))}
            <div className="bg-teal-50 rounded-xl p-2.5">
              <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider truncate">All Labour</p>
              <p className="text-base font-bold text-teal-800 mt-0.5 font-display tracking-tight">{fmtAvg(grandAvg)}</p>
              <p className="text-[10px] text-teal-700 font-medium">avg per day</p>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

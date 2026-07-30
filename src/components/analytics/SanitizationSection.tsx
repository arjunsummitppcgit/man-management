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
import type { AnalyticsData, SanitizationRow } from '@/hooks/useAnalytics';
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

type PersonColumn = { label: string; value: (r: SanitizationRow) => number };

/** Cleaning Labour + NMR Labour, retired by migration 024 and only present on older dates. */
const retiredLabour = (r: SanitizationRow) => (r.cleaning_labour || 0) + (r.nmr_labour || 0);

// Persons involved in sanitization work per the daily entry form
const PERSON_COLUMNS: PersonColumn[] = [
  { label: 'Outside Cleaning', value: (r) => r.outside_cleaning || 0 },
  { label: 'Local Crates Wash', value: (r) => r.local_crates_wash || 0 },
  { label: 'Company Crates Wash', value: (r) => r.company_crates_wash || 0 },
  { label: 'Washroom', value: (r) => r.washroom_cleaning || 0 },
  { label: 'Grading M/C', value: (r) => r.grading_machine_cleaning || 0 },
];

const RETIRED_COLUMN: PersonColumn = { label: 'Cleaning + NMR (retired)', value: retiredLabour };

// Retired fields stay in the headcount so historical person totals don't shrink.
const personsOf = (r: SanitizationRow) =>
  PERSON_COLUMNS.reduce((s, c) => s + c.value(r), 0) + retiredLabour(r);

export default function SanitizationSection({
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
    () => data.sanitization.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.sanitization, locationFilter]
  );

  const totalCrates = rows.reduce((s, r) => s + (r.crates_cleaning || 0), 0);
  const totalNets = rows.reduce((s, r) => s + (r.nets_cleaning || 0), 0);
  const totalPersons = rows.reduce((s, r) => s + personsOf(r), 0);
  const activeDays = new Set(rows.filter((r) => (r.crates_cleaning || 0) + (r.nets_cleaning || 0) + personsOf(r) > 0).map((r) => r.work_date)).size;

  // Averaged over days that actually had sanitization work, not every calendar day
  const avgCrates = activeDays > 0 ? totalCrates / activeDays : 0;
  const avgNets = activeDays > 0 ? totalNets / activeDays : 0;
  const avgPersons = activeDays > 0 ? totalPersons / activeDays : 0;

  const chips = [
    {
      label: 'Crates Cleaned',
      value: fmtInt(totalCrates),
      sub: activeDays > 0 ? `avg ${fmtAvg(avgCrates)} per active day` : `total in ${rangeLabel}`,
      accent: 'from-sky-500 to-cyan-500',
      icon: '📦',
    },
    {
      label: 'Nets Cleaned',
      value: fmtInt(totalNets),
      sub: activeDays > 0 ? `avg ${fmtAvg(avgNets)} per active day` : `total in ${rangeLabel}`,
      accent: 'from-teal-500 to-emerald-500',
      icon: '🕸️',
    },
    {
      label: 'Persons Deployed',
      value: fmtInt(totalPersons),
      sub: activeDays > 0 ? `avg ${fmtAvg(avgPersons)} per active day` : 'cleaning, crates wash, washroom, grading',
      accent: 'from-amber-400 to-orange-500',
      icon: '🧑‍🔧',
    },
    {
      label: 'Active Days',
      value: fmtInt(activeDays),
      sub: 'days with sanitization work',
      accent: 'from-indigo-500 to-violet-600',
      icon: '📅',
    },
  ];

  // Daily trend: crates / nets / persons
  const byDate = useMemo(() => {
    const map = new Map<string, { Crates: number; Nets: number; Persons: number }>();
    for (const r of rows) {
      const cur = map.get(r.work_date) || { Crates: 0, Nets: 0, Persons: 0 };
      cur.Crates += r.crates_cleaning || 0;
      cur.Nets += r.nets_cleaning || 0;
      cur.Persons += personsOf(r);
      map.set(r.work_date, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: fmtDay(date), ...vals }))
      .filter((d) => d.Crates > 0 || d.Nets > 0 || d.Persons > 0);
  }, [rows]);

  // By location
  const byLocation = useMemo(() => {
    const visibleLocs = locationFilter ? locations.filter((l) => l.id === locationFilter) : locations;
    return visibleLocs
      .map((loc) => {
        const locRows = rows.filter((r) => r.location_id === loc.id);
        return {
          name: loc.name,
          Crates: locRows.reduce((s, r) => s + (r.crates_cleaning || 0), 0),
          Nets: locRows.reduce((s, r) => s + (r.nets_cleaning || 0), 0),
          Persons: locRows.reduce((s, r) => s + personsOf(r), 0),
        };
      })
      .filter((r) => r.Crates > 0 || r.Nets > 0 || r.Persons > 0);
  }, [rows, locations, locationFilter]);

  const hasData = totalCrates > 0 || totalNets > 0 || totalPersons > 0;

  // The retired column only earns its place when the period contains pre-split
  // dates; without it those rows wouldn't add up to their own Persons Total.
  const personColumns = rows.some((r) => retiredLabour(r) > 0)
    ? [...PERSON_COLUMNS, RETIRED_COLUMN]
    : PERSON_COLUMNS;

  const columnTotal = (c: PersonColumn) => rows.reduce((s, r) => s + c.value(r), 0);

  const tableHeaders = ['Date', 'Crates', 'Nets', ...personColumns.map((c) => c.label), 'Persons Total'];
  const tableRows = Array.from(
    rows.reduce((map, r) => {
      const cur = map.get(r.work_date) || new Array(personColumns.length + 3).fill(0);
      cur[0] += r.crates_cleaning || 0;
      cur[1] += r.nets_cleaning || 0;
      personColumns.forEach((c, i) => {
        cur[i + 2] += c.value(r);
      });
      cur[personColumns.length + 2] += personsOf(r);
      map.set(r.work_date, cur);
      return map;
    }, new Map<string, number[]>())
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => [fmtDay(date), ...vals.map((v) => (v > 0 ? fmtInt(v) : 0))])
    .filter((row) => row.slice(1).some((v) => v !== 0));

  const footer = [
    'Total',
    fmtInt(totalCrates),
    fmtInt(totalNets),
    ...personColumns.map((c) => fmtInt(columnTotal(c))),
    fmtInt(totalPersons),
  ];

  const perActiveDay = (total: number) => (activeDays > 0 ? fmtAvg(total / activeDays) : '—');
  const avgRow = [
    `Average / active day (${activeDays} day${activeDays === 1 ? '' : 's'})`,
    perActiveDay(totalCrates),
    perActiveDay(totalNets),
    ...personColumns.map((c) => perActiveDay(columnTotal(c))),
    perActiveDay(totalPersons),
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <ChartCard title="Daily Sanitization" subtitle={`crates, nets & persons per day · ${rangeLabel}`} className="xl:col-span-7">
          {hasData && byDate.length > 0 ? (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={byDate} margin={{ top: 4, right: 8, left: -14, bottom: 0 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="date" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                <Bar dataKey="Crates" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={900} />
                <Bar dataKey="Nets" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={900} />
                <Bar dataKey="Persons" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No sanitization work recorded in ${rangeLabel}`} />
          )}
        </ChartCard>

        <ChartCard title="By Location" subtitle="crates, nets & persons per location" className="xl:col-span-5">
          {byLocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={byLocation} margin={{ top: 4, right: 8, left: -10, bottom: 0 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Bar dataKey="Crates" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={900} />
                <Bar dataKey="Nets" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={900} />
                <Bar dataKey="Persons" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No location has sanitization work in this period" />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Sanitization Detail"
        subtitle={
          activeDays > 0
            ? `crates / nets / persons per day · ${rangeLabel} · ${activeDays} active day${activeDays === 1 ? '' : 's'}`
            : 'crates / nets / persons per day'
        }
      >
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Sanitization Report — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer, avgRow]}
            filename="sanitization-report"
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
        {activeDays > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {[
              { label: 'Crates', value: avgCrates, color: '#0ea5e9' },
              { label: 'Nets', value: avgNets, color: '#0d9488' },
              { label: 'Persons', value: avgPersons, color: '#f59e0b' },
            ].map((t) => (
              <div key={t.label} className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{t.label}</p>
                <p className="text-base font-bold mt-0.5 font-display tracking-tight" style={{ color: t.color }}>
                  {fmtAvg(t.value)}
                </p>
                <p className="text-[10px] text-gray-400 font-medium">avg per active day</p>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

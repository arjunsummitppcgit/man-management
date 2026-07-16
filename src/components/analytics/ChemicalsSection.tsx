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
  Cell,
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
  fmt,
  fmtInt,
} from './shared';

const CHEMICAL_ITEMS: { key: keyof SanitizationRow; label: string; group: 'Chlorine' | 'Soap Oil' | 'Essentials' }[] = [
  { key: 'chlorine_ppc', label: 'Chlorine · PPC', group: 'Chlorine' },
  { key: 'chlorine_crates', label: 'Chlorine · Crates', group: 'Chlorine' },
  { key: 'chlorine_washrooms', label: 'Chlorine · Washrooms', group: 'Chlorine' },
  { key: 'chlorine_grading_machine', label: 'Chlorine · Grading M/C', group: 'Chlorine' },
  { key: 'soap_oil_ppc', label: 'Soap Oil · PPC', group: 'Soap Oil' },
  { key: 'soap_oil_crates', label: 'Soap Oil · Crates', group: 'Soap Oil' },
  { key: 'soap_oil_washrooms', label: 'Soap Oil · Washrooms', group: 'Soap Oil' },
  { key: 'soap_oil_grading_machine', label: 'Soap Oil · Grading M/C', group: 'Soap Oil' },
  { key: 'gloves', label: 'Gloves', group: 'Essentials' },
  { key: 'head_cap', label: 'Head Caps', group: 'Essentials' },
  { key: 'masks', label: 'Masks', group: 'Essentials' },
];

const GROUP_COLORS: Record<string, string> = {
  Chlorine: '#0ea5e9',
  'Soap Oil': '#f59e0b',
  Essentials: '#f43f5e',
};

export default function ChemicalsSection({
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

  const itemTotals = useMemo(
    () =>
      CHEMICAL_ITEMS.map((item) => ({
        ...item,
        total: rows.reduce((s, r) => s + (Number(r[item.key]) || 0), 0),
      })),
    [rows]
  );

  const chlorineTotal = itemTotals.filter((i) => i.group === 'Chlorine').reduce((s, i) => s + i.total, 0);
  const soapOilTotal = itemTotals.filter((i) => i.group === 'Soap Oil').reduce((s, i) => s + i.total, 0);
  const glovesTotal = itemTotals.find((i) => i.key === 'gloves')?.total || 0;
  const capsMasksTotal =
    (itemTotals.find((i) => i.key === 'head_cap')?.total || 0) +
    (itemTotals.find((i) => i.key === 'masks')?.total || 0);

  const chips = [
    {
      label: 'Chlorine Used',
      value: fmt(chlorineTotal),
      sub: 'PPC, crates, washrooms, grading',
      accent: 'from-sky-500 to-blue-600',
      icon: '🧪',
    },
    {
      label: 'Soap Oil Used',
      value: fmt(soapOilTotal),
      sub: 'all usage points',
      accent: 'from-amber-400 to-orange-500',
      icon: '🧴',
    },
    {
      label: 'Gloves',
      value: fmtInt(glovesTotal),
      sub: `issued in ${rangeLabel}`,
      accent: 'from-rose-500 to-pink-600',
      icon: '🧤',
    },
    {
      label: 'Caps & Masks',
      value: fmtInt(capsMasksTotal),
      sub: 'head caps + masks issued',
      accent: 'from-indigo-500 to-violet-600',
      icon: '😷',
    },
  ];

  const byTypeData = itemTotals
    .filter((i) => i.total > 0)
    .map((i) => ({ name: i.label, value: Number(i.total.toFixed(3)), fill: GROUP_COLORS[i.group] }));

  // Grouped by location: chlorine vs soap oil vs essentials totals
  const byLocationData = useMemo(() => {
    const visibleLocs = locationFilter ? locations.filter((l) => l.id === locationFilter) : locations;
    return visibleLocs
      .map((loc) => {
        const locRows = rows.filter((r) => r.location_id === loc.id);
        const sumGroup = (group: string) =>
          CHEMICAL_ITEMS.filter((i) => i.group === group).reduce(
            (s, i) => s + locRows.reduce((s2, r) => s2 + (Number(r[i.key]) || 0), 0),
            0
          );
        return {
          name: loc.name,
          Chlorine: Number(sumGroup('Chlorine').toFixed(3)),
          'Soap Oil': Number(sumGroup('Soap Oil').toFixed(3)),
          Essentials: Number(sumGroup('Essentials').toFixed(3)),
        };
      })
      .filter((r) => r.Chlorine > 0 || r['Soap Oil'] > 0 || r.Essentials > 0);
  }, [rows, locations, locationFilter]);

  // Table: item rows × location columns
  const visibleLocs = locationFilter ? locations.filter((l) => l.id === locationFilter) : locations;
  const tableHeaders = ['Item', ...visibleLocs.map((l) => l.name), 'Total'];
  const tableRows = itemTotals
    .filter((i) => i.total > 0)
    .map((item) => {
      const perLoc = visibleLocs.map((loc) => {
        const v = rows
          .filter((r) => r.location_id === loc.id)
          .reduce((s, r) => s + (Number(r[item.key]) || 0), 0);
        return v > 0 ? fmt(v) : 0;
      });
      return [item.label, ...perLoc, fmt(item.total)];
    });
  const footer = [
    'Total',
    ...visibleLocs.map((loc) => {
      const v = CHEMICAL_ITEMS.reduce(
        (s, item) =>
          s +
          rows.filter((r) => r.location_id === loc.id).reduce((s2, r) => s2 + (Number(r[item.key]) || 0), 0),
        0
      );
      return v > 0 ? fmt(v) : '—';
    }),
    fmt(itemTotals.reduce((s, i) => s + i.total, 0)),
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <ChartCard title="Usage by Type" subtitle={`total consumption per item · ${rangeLabel}`} className="xl:col-span-7">
          {byTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(260, byTypeData.length * 34)}>
              <BarChart data={byTypeData} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.gridStroke} />
                <XAxis type="number" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ ...theme.axisTick, fontSize: 10 }} tickLine={false} axisLine={false} width={140} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} formatter={(value) => [fmt(Number(value))]} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={18} animationDuration={900}>
                  {byTypeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No chemical or essential usage recorded in ${rangeLabel}`} />
          )}
        </ChartCard>

        <ChartCard title="Usage by Location" subtitle="chlorine vs soap oil vs essentials" className="xl:col-span-5">
          {byLocationData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byLocationData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Bar dataKey="Chlorine" fill={GROUP_COLORS.Chlorine} radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={900} />
                <Bar dataKey="Soap Oil" fill={GROUP_COLORS['Soap Oil']} radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={900} />
                <Bar dataKey="Essentials" fill={GROUP_COLORS.Essentials} radius={[6, 6, 0, 0]} maxBarSize={24} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No location has usage in this period" />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Essentials & Chemicals Detail" subtitle="total by item and location">
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Essentials & Chemicals — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer]}
            filename="essentials-chemicals"
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
      </ChartCard>
    </div>
  );
}

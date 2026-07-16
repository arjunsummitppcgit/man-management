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
import { sumByDate } from '@/hooks/useAnalytics';
import {
  ChipRow,
  ChartCard,
  EmptyChart,
  AnalyticsTable,
  ExportButtons,
  chartTheme,
  fmt,
  fmtInt,
  fmtDay,
  SERIES_COLORS,
} from './shared';

export default function PerHeadSection({
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

  // ── Per-head amount (non-local ladies; not location-scoped) ──
  const ladies = data.nonLocal;
  const totalLadies = ladies.reduce((s, r) => s + (r.no_of_ladies || 0), 0);
  const totalHlQty = ladies.reduce((s, r) => s + (r.hl_qty || 0), 0);
  const avgPerHead = useMemo(() => {
    const withAmount = ladies.filter((r) => (r.per_head_amount || 0) > 0);
    if (withAmount.length === 0) return 0;
    return withAmount.reduce((s, r) => s + r.per_head_amount, 0) / withAmount.length;
  }, [ladies]);

  const perHeadByDate = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of ladies) {
      if ((r.per_head_amount || 0) <= 0) continue;
      const cur = map.get(r.work_date) || { sum: 0, n: 0 };
      cur.sum += r.per_head_amount;
      cur.n += 1;
      map.set(r.work_date, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, n }]) => ({ date: fmtDay(date), amount: Number((sum / n).toFixed(2)) }));
  }, [ladies]);

  // ── Productivity: processed kg per labour head ──
  const processingRows = useMemo(
    () => data.processing.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.processing, locationFilter]
  );
  const workforceRows = useMemo(
    () => data.workforce.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.workforce, locationFilter]
  );

  const kgByDate = useMemo(() => sumByDate(processingRows, (r) => r.processed_kg), [processingRows]);
  const labourByDate = useMemo(() => sumByDate(workforceRows, (r) => r.labour_count), [workforceRows]);

  const productivityByDate = useMemo(() => {
    const labourMap = new Map(labourByDate.map((d) => [d.date, d.value]));
    return kgByDate
      .map((d) => {
        const heads = labourMap.get(d.date) || 0;
        return {
          rawDate: d.date,
          date: fmtDay(d.date),
          kg: d.value,
          heads,
          perHead: heads > 0 ? Number((d.value / heads).toFixed(3)) : 0,
        };
      })
      .filter((d) => d.kg > 0 || d.heads > 0);
  }, [kgByDate, labourByDate]);

  const totalKg = kgByDate.reduce((s, d) => s + d.value, 0);
  const totalHeads = labourByDate.reduce((s, d) => s + d.value, 0);
  const overallPerHead = totalHeads > 0 ? totalKg / totalHeads : 0;

  const productivityByLocation = useMemo(() => {
    const visibleLocs = locationFilter ? locations.filter((l) => l.id === locationFilter) : locations;
    return visibleLocs
      .map((loc, i) => {
        const kg = processingRows.filter((r) => r.location_id === loc.id).reduce((s, r) => s + (r.processed_kg || 0), 0);
        const heads = workforceRows.filter((r) => r.location_id === loc.id).reduce((s, r) => s + (r.labour_count || 0), 0);
        return {
          name: loc.name,
          value: heads > 0 ? Number((kg / heads).toFixed(3)) : 0,
          fill: SERIES_COLORS[i % SERIES_COLORS.length],
        };
      })
      .filter((r) => r.value > 0);
  }, [processingRows, workforceRows, locations, locationFilter]);

  const chips = [
    {
      label: 'Avg Per Head Amount',
      value: avgPerHead > 0 ? `₹${fmt(Number(avgPerHead.toFixed(2)))}` : '—',
      sub: `non-local ladies · ${rangeLabel}`,
      accent: 'from-emerald-500 to-teal-600',
      icon: '💰',
    },
    {
      label: 'Total Ladies',
      value: fmtInt(totalLadies),
      sub: `${fmt(totalHlQty)} kg HL handled`,
      accent: 'from-rose-500 to-pink-600',
      icon: '👩',
    },
    {
      label: 'Kg Per Labour Head',
      value: overallPerHead > 0 ? `${fmt(Number(overallPerHead.toFixed(3)))} kg` : '—',
      sub: 'processed kg ÷ labour attendance',
      accent: 'from-teal-500 to-emerald-500',
      icon: '⚖️',
    },
    {
      label: 'Total Labour Heads',
      value: fmtInt(totalHeads),
      sub: `person-days in ${rangeLabel}`,
      accent: 'from-amber-400 to-orange-500',
      icon: '👷',
    },
  ];

  const tableHeaders = ['Date', 'Processed (kg)', 'Labour Heads', 'Kg / Head'];
  const tableRows = productivityByDate.map((d) => [
    d.date,
    fmt(d.kg),
    fmtInt(d.heads),
    d.perHead > 0 ? fmt(d.perHead) : 0,
  ]);
  const footer = ['Total', fmt(totalKg), fmtInt(totalHeads), overallPerHead > 0 ? fmt(Number(overallPerHead.toFixed(3))) : '—'];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <ChartCard
          title="Per Head Amount Trend"
          subtitle="average ₹ per head per day (non-local ladies)"
          className="xl:col-span-6"
        >
          {perHeadByDate.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={perHeadByDate} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="phFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="date" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} formatter={(value) => [`₹${fmt(Number(value))}`, 'Per head']} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#phFill)"
                  dot={{ r: 3, fill: '#10b981', strokeWidth: 2, stroke: isDark ? '#111827' : '#ffffff' }}
                  activeDot={{ r: 5 }}
                  animationDuration={1100}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No per-head amounts recorded in ${rangeLabel}`} />
          )}
        </ChartCard>

        <ChartCard
          title="Productivity by Location"
          subtitle="processed kg per labour head"
          className="xl:col-span-6"
        >
          {productivityByLocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={productivityByLocation} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={theme.tooltipStyle} cursor={theme.cursorFill} formatter={(value) => [`${fmt(Number(value))} kg / head`]} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={900}>
                  {productivityByLocation.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Needs both processing and labour attendance data" />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Daily Productivity Detail" subtitle="processed kg against labour attendance">
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Labour Per Head — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer]}
            filename="labour-per-head"
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
      </ChartCard>
    </div>
  );
}

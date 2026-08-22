'use client';

import React, { useMemo, useState } from 'react';
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
  yieldPct,
  batchCompany,
  RZ,
  SUMMIT,
  SERIES_COLORS,
} from './shared';
import type { BatchCompany } from './shared';

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

  // ─── Detail table: one row per date + batch, broken out by location ────────
  // The daily_processing figures driving the chips and charts above hold no
  // batch id, so the detail table reads the graders' batch registers instead.
  // Since migration 029 the two are the same quantity: a stage's completed
  // figure IS its register's output total, so the chips tie out to this table's
  // HL (or VA) column. Dates entered before the registers existed still carry
  // their hand-typed figure and can differ.
  const [company, setCompany] = useState<'all' | BatchCompany>('all');

  const locationName = useMemo(() => {
    const byId = new Map(locations.map((l) => [l.id, l.name]));
    return (id: string | null) => (id && byId.get(id)) || '';
  }, [locations]);

  /** Input → output for this stage: HON→HL, or HL→VA. */
  const inLabel = isHonHl ? 'HON' : 'HL';
  const outLabel = isHonHl ? 'HL' : 'VA';

  const batchRows = useMemo(() => {
    const src = isHonHl
      ? data.yieldBatches.map((r) => ({
          work_date: r.work_date,
          location_id: r.location_id as string | null,
          batch_id: r.batch_id,
          count_text: r.count_text || '',
          inKg: r.hon_kgs || 0,
          outKg: r.hl_kgs || 0,
        }))
      : data.hlVa.map((r) => ({
          work_date: r.work_date,
          location_id: r.location_id,
          batch_id: r.batch_id,
          count_text: r.count_text || '',
          inKg: r.hl_kgs || 0,
          outKg: r.va_kgs || 0,
        }));
    return src.filter(
      (r) =>
        (!locationFilter || r.location_id === locationFilter) &&
        (company === 'all' || batchCompany(r.batch_id) === company)
    );
  }, [data.yieldBatches, data.hlVa, isHonHl, locationFilter, company]);

  const tableHeaders = useMemo(
    () => [
      'Date',
      'Batch ID',
      'Count',
      'Company',
      'Location',
      `${inLabel} (Kgs)`,
      `${outLabel} (Kgs)`,
      'Yield %',
    ],
    [inLabel, outLabel]
  );

  const tableRows = useMemo(() => {
    const groups = new Map<
      string,
      {
        date: string;
        batchId: string;
        locs: Set<string>;
        counts: Set<string>;
        inKg: number;
        outKg: number;
      }
    >();
    for (const r of batchRows) {
      const key = `${r.work_date}|${r.batch_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          date: r.work_date,
          batchId: r.batch_id,
          locs: new Set(),
          counts: new Set(),
          inKg: 0,
          outKg: 0,
        };
        groups.set(key, g);
      }
      // A yield batch is unique per date, so this is one location. HL→VA splits
      // a batch across counts and varieties, which can in principle span two —
      // and may carry none at all, hence the fallback.
      const name = locationName(r.location_id);
      if (name) g.locs.add(name);
      // Same reason the counts are a set: one HL→VA batch is graded across
      // several counts, and the grouped row has to name all of them rather
      // than silently keep whichever came back first.
      if (r.count_text) g.counts.add(r.count_text);
      g.inKg += r.inKg;
      g.outKg += r.outKg;
    }
    return Array.from(groups.values())
      .filter((g) => g.inKg > 0 || g.outKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.batchId.localeCompare(b.batchId))
      .map((g) => [
        fmtDay(g.date),
        g.batchId,
        Array.from(g.counts)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
          .join(', ') || '—',
        batchCompany(g.batchId),
        Array.from(g.locs).sort().join(', ') || '—',
        fmt(g.inKg),
        fmt(g.outKg),
        yieldPct(g.inKg, g.outKg),
      ]);
  }, [batchRows, locationName]);

  const footer = useMemo(() => {
    const grandIn = batchRows.reduce((s, r) => s + r.inKg, 0);
    const grandOut = batchRows.reduce((s, r) => s + r.outKg, 0);
    return ['Total', '', '', '', '', fmt(grandIn), fmt(grandOut), yieldPct(grandIn, grandOut)];
  }, [batchRows]);

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

      <ChartCard title={`${title} Detail`} subtitle="batch-wise kg by location · from the grader batch register">
        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
          <label htmlFor={`company-${mode}`} className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-auto">
            Company
          </label>
          <select
            id={`company-${mode}`}
            value={company}
            onChange={(e) => setCompany(e.target.value as 'all' | BatchCompany)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200"
          >
            <option value="all">All companies</option>
            <option value={RZ}>{RZ}</option>
            <option value={SUMMIT}>{SUMMIT}</option>
          </select>
          <ExportButtons
            title={`${title} Report — ${rangeLabel}${company === 'all' ? '' : ` — ${company}`}`}
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

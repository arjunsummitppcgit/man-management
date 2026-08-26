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

/** Batch ids and prawn counts read as numbers where they can: 46 before 100. */
const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** One line of a grader's register, normalised across the two stages. */
interface StageRow {
  work_date: string;
  /** '' when the register line never named one. */
  location_id: string;
  batch_id: string;
  count_text: string;
  inKg: number;
  outKg: number;
}

/** One labelled dropdown of the detail table's filter bar. */
function Picker({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[11rem] px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

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

  // ─── Detail table: one row per date + batch + count + location ────────
  // The daily_processing figures driving the chips and charts above hold no
  // batch id, so the detail table reads the graders' batch registers instead.
  // Since migration 029 the two are the same quantity: a stage's completed
  // figure IS its register's output total, so the chips tie out to this table's
  // HL (or VA) column. Dates entered before the registers existed still carry
  // their hand-typed figure and can differ.
  //
  // A register line is per date + location + batch + count, and the table keeps
  // that grain rather than collapsing a batch's counts and locations into
  // comma-joined cells — every row is one count at one location, with its own
  // kgs and its own yield.
  const [company, setCompany] = useState<'all' | BatchCompany>('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [countFilter, setCountFilter] = useState('all');
  const [locFilter, setLocFilter] = useState('all');

  const locationName = useMemo(() => {
    const byId = new Map(locations.map((l) => [l.id, l.name]));
    return (id: string | null) => (id && byId.get(id)) || '';
  }, [locations]);

  /** Input → output for this stage: HON→HL, or HL→VA. */
  const inLabel = isHonHl ? 'HON' : 'HL';
  const outLabel = isHonHl ? 'HL' : 'VA';

  /** Every register line in range, before the table's own dropdowns. */
  const sourceRows = useMemo<StageRow[]>(() => {
    const src: StageRow[] = isHonHl
      ? data.yieldBatches.map((r) => ({
          work_date: r.work_date,
          location_id: r.location_id || '',
          // Registers are typed by hand, and a stray space would otherwise put
          // '80 ' and '80' on two rows and two lines of the dropdown.
          batch_id: r.batch_id.trim(),
          count_text: (r.count_text || '').trim(),
          inKg: r.hon_kgs || 0,
          outKg: r.hl_kgs || 0,
        }))
      : data.hlVa.map((r) => ({
          work_date: r.work_date,
          location_id: r.location_id || '',
          batch_id: r.batch_id.trim(),
          count_text: (r.count_text || '').trim(),
          inKg: r.hl_kgs || 0,
          outKg: r.va_kgs || 0,
        }));
    // Lines with nothing on either side would only pad the dropdowns with
    // counts that lead nowhere.
    return src.filter(
      (r) => (!locationFilter || r.location_id === locationFilter) && (r.inKg > 0 || r.outKg > 0)
    );
  }, [data.yieldBatches, data.hlVa, isHonHl, locationFilter]);

  /**
   * The four dropdowns cascade: each one's options are what survives *the
   * other* three, so picking a batch narrows the count and location lists to
   * what that batch actually has and no combination lands on an empty table.
   */
  const matches = useMemo(
    () => (r: StageRow, skip?: 'batch' | 'count' | 'loc') =>
      (company === 'all' || batchCompany(r.batch_id) === company) &&
      (skip === 'batch' || batchFilter === 'all' || r.batch_id === batchFilter) &&
      (skip === 'count' || countFilter === 'all' || r.count_text === countFilter) &&
      (skip === 'loc' || locFilter === 'all' || r.location_id === locFilter),
    [company, batchFilter, countFilter, locFilter]
  );

  const batchOptions = useMemo(() => {
    const ids = new Set(sourceRows.filter((r) => matches(r, 'batch')).map((r) => r.batch_id));
    // A pick the new date range or company no longer covers stays on the list,
    // so an empty table has a visible cause the user can undo.
    if (batchFilter !== 'all') ids.add(batchFilter);
    return Array.from(ids)
      .sort(byText)
      .map((id) => ({ value: id, label: id }));
  }, [sourceRows, matches, batchFilter]);

  const countOptions = useMemo(() => {
    const counts = new Set(sourceRows.filter((r) => matches(r, 'count')).map((r) => r.count_text));
    if (countFilter !== 'all') counts.add(countFilter);
    return Array.from(counts)
      .sort(byText)
      .map((c) => ({ value: c, label: c || '—' }));
  }, [sourceRows, matches, countFilter]);

  const locOptions = useMemo(() => {
    const ids = new Set(sourceRows.filter((r) => matches(r, 'loc')).map((r) => r.location_id));
    if (locFilter !== 'all') ids.add(locFilter);
    return Array.from(ids)
      .map((id) => ({ value: id, label: locationName(id) || 'Unassigned' }))
      .sort((a, b) => byText(a.label, b.label));
  }, [sourceRows, matches, locFilter, locationName]);

  const batchRows = useMemo(() => sourceRows.filter((r) => matches(r)), [sourceRows, matches]);

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
        count: string;
        locId: string;
        inKg: number;
        outKg: number;
      }
    >();
    for (const r of batchRows) {
      const key = `${r.work_date}|${r.batch_id}|${r.count_text}|${r.location_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          date: r.work_date,
          batchId: r.batch_id,
          count: r.count_text,
          locId: r.location_id,
          inKg: 0,
          outKg: 0,
        };
        groups.set(key, g);
      }
      // Still a sum, not a copy: HL→VA splits one count further by variety and
      // grade, and those belong on the same line.
      g.inKg += r.inKg;
      g.outKg += r.outKg;
    }
    return Array.from(groups.values())
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          byText(a.batchId, b.batchId) ||
          byText(a.count, b.count) ||
          byText(locationName(a.locId), locationName(b.locId))
      )
      .map((g) => [
        fmtDay(g.date),
        g.batchId,
        g.count || '—',
        batchCompany(g.batchId),
        locationName(g.locId) || '—',
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

  /** What the dropdowns are narrowed to, for the PDF/Excel header line. */
  const filterNote = useMemo(() => {
    const parts: string[] = [];
    if (company !== 'all') parts.push(company);
    if (batchFilter !== 'all') parts.push(`Batch ${batchFilter}`);
    if (countFilter !== 'all') parts.push(`Count ${countFilter || '—'}`);
    if (locFilter !== 'all') parts.push(locationName(locFilter) || 'Unassigned');
    return parts.length > 0 ? ` — ${parts.join(' · ')}` : '';
  }, [company, batchFilter, countFilter, locFilter, locationName]);

  const clearFilters = () => {
    setCompany('all');
    setBatchFilter('all');
    setCountFilter('all');
    setLocFilter('all');
  };

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

      <ChartCard title={`${title} Detail`} subtitle="one row per count per location · from the grader batch register">
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <Picker
            id={`company-${mode}`}
            label="Company"
            value={company}
            allLabel="All companies"
            options={[
              { value: RZ, label: RZ },
              { value: SUMMIT, label: SUMMIT },
            ]}
            onChange={(v) => setCompany(v as 'all' | BatchCompany)}
          />
          <Picker
            id={`batch-${mode}`}
            label="Batch"
            value={batchFilter}
            allLabel="All batches"
            options={batchOptions}
            onChange={setBatchFilter}
          />
          <Picker
            id={`count-${mode}`}
            label="Count"
            value={countFilter}
            allLabel="All counts"
            options={countOptions}
            onChange={setCountFilter}
          />
          <Picker
            id={`location-${mode}`}
            label="Location"
            value={locFilter}
            allLabel="All locations"
            options={locOptions}
            onChange={setLocFilter}
          />
          {filterNote && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95"
            >
              Clear
            </button>
          )}
          <div className="ml-auto">
            <ExportButtons
              title={`${title} Report — ${rangeLabel}${filterNote}`}
              headers={tableHeaders}
              rows={[...tableRows, footer]}
              filename={`${slug}-report`}
            />
          </div>
        </div>
        <AnalyticsTable
          headers={tableHeaders}
          rows={tableRows}
          footer={footer}
          emptyMessage="No batches match these filters"
        />
      </ChartCard>
    </div>
  );
}

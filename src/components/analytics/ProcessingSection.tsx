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
import { normaliseVariety, VA_VARIETIES } from '@/lib/hlVa';
import GradeVaSection from './GradeVaSection';
import MultiPicker from './MultiPicker';

/** Batch ids and prawn counts read as numbers where they can: 46 before 100. */
const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Varieties read back in the order the register's own chips offer them, so the
 * dropdown matches the screen the graders type on. Anything the chart no longer
 * names — an old spelling normalisation missed — falls in after them.
 */
const varietyRank = (v: string) => {
  const i = (VA_VARIETIES as readonly string[]).indexOf(v);
  return i === -1 ? VA_VARIETIES.length : i;
};
const byVariety = (a: string, b: string) => varietyRank(a) - varietyRank(b) || byText(a, b);

/** One line of a grader's register, normalised across the two stages. */
interface StageRow {
  work_date: string;
  /** '' when the register line never named one. */
  location_id: string;
  batch_id: string;
  count_text: string;
  /** Always '' for HON→HL — that register has no variety to carry. */
  variety: string;
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
  fromDate,
  toDate,
}: {
  mode: 'hon_hl' | 'hl_va';
  data: AnalyticsData;
  locations: Location[];
  locationFilter: string | null;
  isDark: boolean;
  rangeLabel: string;
  /** The raw range behind `rangeLabel` — the Grade Vs VA export names its file with it. */
  fromDate: string;
  toDate: string;
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
  // A register line is per date + location + batch + count (+ variety and grade
  // on HL→VA), and the table keeps that grain rather than collapsing a batch's
  // counts and locations into comma-joined cells — every row is one count at one
  // location, with its own kgs and its own yield. HL→VA carries the variety too,
  // so a count split across PD and PDTO reads as two lines there.
  const [company, setCompany] = useState<'all' | BatchCompany>('all');
  const [batchFilter, setBatchFilter] = useState('all');
  // Counts are the one column people compare across rather than drill into, so
  // this filter takes several at once. Empty means every count.
  const [countFilters, setCountFilters] = useState<string[]>([]);
  // HL→VA only: HON→HL never renders this picker, so it stays on 'all' there.
  const [varietyFilter, setVarietyFilter] = useState('all');
  // Locations compare the same way counts do — "how did PPC 2 and PLK do on
  // this batch" — so this filter takes several at once as well. Empty means
  // every location.
  const [locFilters, setLocFilters] = useState<string[]>([]);

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
          variety: '',
          inKg: r.hon_kgs || 0,
          outKg: r.hl_kgs || 0,
        }))
      : data.hlVa.map((r) => ({
          work_date: r.work_date,
          location_id: r.location_id || '',
          batch_id: r.batch_id.trim(),
          count_text: (r.count_text || '').trim(),
          // Normalised so the 38 rows still spelled 'BTFLY' sit on the BTFY
          // line rather than opening a column of their own.
          variety: normaliseVariety(r.variety),
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
   * The same range of HL→VA lines for the Grade Vs VA sheet at the foot of the
   * section. Kept separate from `sourceRows` because that one is normalised to
   * in/out kgs across both stages and drops the grade and variety the sheet is
   * built out of.
   */
  const gradeVaEntries = useMemo(
    () => data.hlVa.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.hlVa, locationFilter]
  );

  /**
   * The dropdowns cascade: each one's options are what survives *the others*,
   * so picking a batch narrows the count, variety and location lists to what
   * that batch actually has and no combination lands on an empty table.
   */
  const matches = useMemo(
    () => (r: StageRow, skip?: 'batch' | 'count' | 'variety' | 'loc') =>
      (company === 'all' || batchCompany(r.batch_id) === company) &&
      (skip === 'batch' || batchFilter === 'all' || r.batch_id === batchFilter) &&
      (skip === 'count' || countFilters.length === 0 || countFilters.includes(r.count_text)) &&
      (skip === 'variety' || varietyFilter === 'all' || r.variety === varietyFilter) &&
      (skip === 'loc' || locFilters.length === 0 || locFilters.includes(r.location_id)),
    [company, batchFilter, countFilters, varietyFilter, locFilters]
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
    for (const c of countFilters) counts.add(c);
    return Array.from(counts)
      .sort(byText)
      .map((c) => ({ value: c, label: c || '—' }));
  }, [sourceRows, matches, countFilters]);

  const varietyOptions = useMemo(() => {
    const varieties = new Set(
      sourceRows.filter((r) => matches(r, 'variety')).map((r) => r.variety)
    );
    if (varietyFilter !== 'all') varieties.add(varietyFilter);
    return Array.from(varieties)
      .sort(byVariety)
      .map((v) => ({ value: v, label: v || '—' }));
  }, [sourceRows, matches, varietyFilter]);

  const locOptions = useMemo(() => {
    const ids = new Set(sourceRows.filter((r) => matches(r, 'loc')).map((r) => r.location_id));
    for (const id of locFilters) ids.add(id);
    return Array.from(ids)
      .map((id) => ({ value: id, label: locationName(id) || 'Unassigned' }))
      .sort((a, b) => byText(a.label, b.label));
  }, [sourceRows, matches, locFilters, locationName]);

  const batchRows = useMemo(() => sourceRows.filter((r) => matches(r)), [sourceRows, matches]);

  const tableHeaders = useMemo(
    () => [
      'Date',
      'Batch ID',
      'Count',
      // HON→HL has no variety, so that stage keeps its eight columns.
      ...(isHonHl ? [] : ['Variety']),
      'Company',
      'Location',
      `${inLabel} (Kgs)`,
      `${outLabel} (Kgs)`,
      'Yield %',
    ],
    [inLabel, outLabel, isHonHl]
  );

  const tableRows = useMemo(() => {
    const groups = new Map<
      string,
      {
        date: string;
        batchId: string;
        count: string;
        variety: string;
        locId: string;
        inKg: number;
        outKg: number;
      }
    >();
    for (const r of batchRows) {
      const key = `${r.work_date}|${r.batch_id}|${r.count_text}|${r.variety}|${r.location_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          date: r.work_date,
          batchId: r.batch_id,
          count: r.count_text,
          variety: r.variety,
          locId: r.location_id,
          inKg: 0,
          outKg: 0,
        };
        groups.set(key, g);
      }
      // Still a sum, not a copy: HL→VA splits one count and variety further by
      // grade, and those grades belong on the same line.
      g.inKg += r.inKg;
      g.outKg += r.outKg;
    }
    return Array.from(groups.values())
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          byText(a.batchId, b.batchId) ||
          byText(a.count, b.count) ||
          byText(a.variety, b.variety) ||
          byText(locationName(a.locId), locationName(b.locId))
      )
      .map((g) => [
        fmtDay(g.date),
        g.batchId,
        g.count || '—',
        ...(isHonHl ? [] : [g.variety || '—']),
        batchCompany(g.batchId),
        locationName(g.locId) || '—',
        fmt(g.inKg),
        fmt(g.outKg),
        yieldPct(g.inKg, g.outKg),
      ]);
  }, [batchRows, locationName, isHonHl]);

  const footer = useMemo(() => {
    const grandIn = batchRows.reduce((s, r) => s + r.inKg, 0);
    const grandOut = batchRows.reduce((s, r) => s + r.outKg, 0);
    const blanks = isHonHl ? ['', '', '', ''] : ['', '', '', '', ''];
    return ['Total', ...blanks, fmt(grandIn), fmt(grandOut), yieldPct(grandIn, grandOut)];
  }, [batchRows, isHonHl]);

  /** What the dropdowns are narrowed to, for the PDF/Excel header line. */
  const filterNote = useMemo(() => {
    const parts: string[] = [];
    if (company !== 'all') parts.push(company);
    if (batchFilter !== 'all') parts.push(`Batch ${batchFilter}`);
    // A handful of counts are worth naming on the sheet; a long list would push
    // the batch and location out of a PDF header line, so it gets a count.
    if (countFilters.length > 0) {
      // Ticked in whatever order they were clicked; read back in register order.
      const named = [...countFilters].sort(byText).map((c) => c || '—');
      parts.push(
        named.length <= 4
          ? `Count ${named.join(', ')}`
          : `${named.length} counts (${named.slice(0, 3).join(', ')}…)`
      );
    }
    if (varietyFilter !== 'all') parts.push(varietyFilter || '—');
    if (locFilters.length > 0) {
      const named = locFilters.map((id) => locationName(id) || 'Unassigned').sort(byText);
      parts.push(
        named.length <= 4
          ? named.join(', ')
          : `${named.length} locations (${named.slice(0, 3).join(', ')}…)`
      );
    }
    return parts.length > 0 ? ` — ${parts.join(' · ')}` : '';
  }, [company, batchFilter, countFilters, varietyFilter, locFilters, locationName]);

  const clearFilters = () => {
    setCompany('all');
    setBatchFilter('all');
    setCountFilters([]);
    setVarietyFilter('all');
    setLocFilters([]);
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

      <ChartCard
        title={`${title} Detail`}
        subtitle={`one row per count${isHonHl ? '' : ' per variety'} per location · from the grader batch register`}
      >
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
          <MultiPicker
            id={`count-${mode}`}
            label="Count"
            allLabel="All counts"
            options={countOptions}
            selected={countFilters}
            onChange={setCountFilters}
          />
          {!isHonHl && (
            <Picker
              id={`variety-${mode}`}
              label="Variety"
              value={varietyFilter}
              allLabel="All varieties"
              options={varietyOptions}
              onChange={setVarietyFilter}
            />
          )}
          <MultiPicker
            id={`location-${mode}`}
            label="Location"
            allLabel="All locations"
            options={locOptions}
            selected={locFilters}
            onChange={setLocFilters}
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
              // Nine columns with the variety in — portrait squeezes the batch
              // ids and the kg figures into two lines apiece.
              pdfOrientation={isHonHl ? undefined : 'landscape'}
            />
          </div>
        </div>
        <AnalyticsTable
          headers={tableHeaders}
          rows={tableRows}
          footer={footer}
          emptyMessage="No batches match these filters"
          // A month of registers is several hundred lines — the one table on
          // this page long enough to bury everything under it.
          pageSize={50}
        />
      </ChartCard>

      {/* ─── Grade Vs VA: the register's grade × variety sheet over the range ──
          Only HL→VA carries grades and varieties — the HON→HL register has
          neither, so there is nothing to lay out for that stage. It reads the
          page's range and location, not the detail table's dropdowns above,
          which narrow that table alone. */}
      {!isHonHl && (
        <GradeVaSection
          entries={gradeVaEntries}
          rangeLabel={rangeLabel}
          fromDate={fromDate}
          toDate={toDate}
          locationLabel={locationFilter ? locationName(locationFilter) || undefined : undefined}
        />
      )}
    </div>
  );
}

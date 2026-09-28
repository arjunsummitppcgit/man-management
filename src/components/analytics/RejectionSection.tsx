'use client';

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
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
import {
  normaliseVariety,
  VA_VARIETIES,
  RJ_SUFFIX,
  hlVaBatchLabel,
  lookupHlVaCountRange,
  standardForHlVaEntry,
} from '@/lib/hlVa';
import { calculateYield } from '@/lib/yieldChart';
import GradeVaSection from './GradeVaSection';
import MultiPicker from './MultiPicker';
import Picker from './Picker';

/** Batch ids and prawn counts read as numbers where they can: 46 before 100. */
const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Varieties in the register's own chip order, as on the HL → VA detail table. */
const varietyRank = (v: string) => {
  const i = (VA_VARIETIES as readonly string[]).indexOf(v);
  return i === -1 ? VA_VARIETIES.length : i;
};
const byVariety = (a: string, b: string) => varietyRank(a) - varietyRank(b) || byText(a, b);

const pct1 = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
const signed1 = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);

/** One rejection line of the HL→VA register, as the table reads it. */
interface RjLine {
  work_date: string;
  batch_id: string;
  count_text: string;
  variety: string;
  grade: string;
  /** '' when the register line never named one. */
  location_id: string;
  grader: string;
  hl: number;
  va: number;
  /** The standard the line is measured against — the same chart as fresh batches. */
  std: number | null;
}

/**
 * HL weighted standard over the lines that have one. A plain average would
 * let a 3 kg line pull as hard as a 300 kg one.
 */
function weightedStd(lines: RjLine[]): number | null {
  let hl = 0;
  let weighted = 0;
  for (const l of lines) {
    if (l.std === null || l.hl <= 0) continue;
    hl += l.hl;
    weighted += l.hl * l.std;
  }
  return hl > 0 ? weighted / hl : null;
}

/**
 * Rejection (RJ) batches — VA sent back and re-worked, ticked RJ on the HL to
 * VA register (migration 038). Every other section counts fresh production
 * only; this is where the re-work is laid out: how much, where, which batches,
 * against the same standard chart, and the grade × variety sheet of it.
 *
 * Reads the page's range and location like the HL → VA section beside it.
 */
export default function RejectionSection({
  data,
  locations,
  locationFilter,
  isDark,
  rangeLabel,
  fromDate,
  toDate,
}: {
  data: AnalyticsData;
  locations: Location[];
  locationFilter: string | null;
  isDark: boolean;
  rangeLabel: string;
  fromDate: string;
  toDate: string;
}) {
  const theme = chartTheme(isDark);
  const color = '#f43f5e';

  const locationName = useMemo(() => {
    const byId = new Map(locations.map((l) => [l.id, l.name]));
    return (id: string | null) => (id && byId.get(id)) || '';
  }, [locations]);

  const atLocation = useMemo(
    () => (r: { location_id: string | null }) => !locationFilter || r.location_id === locationFilter,
    [locationFilter]
  );

  /** RJ rows in range at the chosen location, straight from the register. */
  const rjRows = useMemo(() => data.hlVaRejections.filter(atLocation), [data.hlVaRejections, atLocation]);

  const lines = useMemo<RjLine[]>(
    () =>
      rjRows
        .map((r) => ({
          work_date: r.work_date,
          // Typed by hand — a stray space would otherwise split one batch in two
          batch_id: r.batch_id.trim(),
          count_text: (r.count_text || '').trim(),
          // BTFLY rows read as BTFY, as everywhere else
          variety: normaliseVariety(r.variety),
          grade: (r.grade || '').trim() || lookupHlVaCountRange(r.count_text || '') || '—',
          location_id: r.location_id || '',
          grader: (r.grader_name || '').trim(),
          hl: Number(r.hl_kgs) || 0,
          va: Number(r.va_kgs) || 0,
          std: standardForHlVaEntry(r),
        }))
        .filter((l) => l.hl > 0 || l.va > 0),
    [rjRows]
  );

  // ─── Headline figures ──────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const hl = lines.reduce((s, l) => s + l.hl, 0);
    const va = lines.reduce((s, l) => s + l.va, 0);
    const batches = new Set(lines.map((l) => l.batch_id)).size;
    const days = new Set(lines.map((l) => l.work_date)).size;
    return { hl, va, batches, days, std: weightedStd(lines) };
  }, [lines]);

  const freshVa = useMemo(
    () => data.hlVa.filter(atLocation).reduce((s, r) => s + (Number(r.va_kgs) || 0), 0),
    [data.hlVa, atLocation]
  );

  const rjYield = calculateYield(totals.hl, totals.va);
  const rjDiff = rjYield !== null && totals.std !== null ? rjYield - totals.std : null;
  const allVa = freshVa + totals.va;

  const chips = [
    {
      label: `Rejection (${RJ_SUFFIX}) VA`,
      value: `${fmt(totals.va)} kg`,
      sub: `from ${fmt(totals.hl)} kg HL · ${rangeLabel}`,
      accent: 'from-rose-500 to-pink-600',
      icon: '♻️',
    },
    {
      label: 'Re-work Yield',
      value: pct1(rjYield),
      sub:
        totals.std !== null
          ? `std ${totals.std.toFixed(1)}% · ${signed1(rjDiff)}`
          : 'no standard for these counts',
      accent: 'from-teal-500 to-emerald-500',
      icon: '🎯',
    },
    {
      label: `${RJ_SUFFIX} Batches`,
      value: String(totals.batches),
      sub: `${lines.length} line${lines.length === 1 ? '' : 's'} over ${totals.days} day${totals.days === 1 ? '' : 's'}`,
      accent: 'from-amber-400 to-orange-500',
      icon: '📦',
    },
    {
      label: 'Share of all VA',
      value: allVa > 0 ? `${((totals.va / allVa) * 100).toFixed(1)}%` : '—',
      sub: `of ${fmt(allVa)} kg (fresh ${fmt(freshVa)} kg)`,
      accent: 'from-indigo-500 to-violet-600',
      icon: '📊',
    },
  ];

  const byDate = useMemo(() => sumByDate(rjRows, (r) => Number(r.va_kgs) || 0), [rjRows]);
  const byLocation = useMemo(
    () => sumByLocation(rjRows, locations, (r) => Number(r.va_kgs) || 0),
    [rjRows, locations]
  );
  const chartData = byDate.map((d) => ({ date: fmtDay(d.date), kg: Number(d.value.toFixed(3)) }));

  // ─── Detail table: every RJ line, filterable like the HL → VA table ───────
  const [company, setCompany] = useState<'all' | BatchCompany>('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [countFilters, setCountFilters] = useState<string[]>([]);
  const [varietyFilter, setVarietyFilter] = useState('all');
  const [locFilters, setLocFilters] = useState<string[]>([]);

  /** Each dropdown's options are what survives the others, as on HL → VA. */
  const matches = useMemo(
    () => (l: RjLine, skip?: 'batch' | 'count' | 'variety' | 'loc') =>
      (company === 'all' || batchCompany(l.batch_id) === company) &&
      (skip === 'batch' || batchFilter === 'all' || l.batch_id === batchFilter) &&
      (skip === 'count' || countFilters.length === 0 || countFilters.includes(l.count_text)) &&
      (skip === 'variety' || varietyFilter === 'all' || l.variety === varietyFilter) &&
      (skip === 'loc' || locFilters.length === 0 || locFilters.includes(l.location_id)),
    [company, batchFilter, countFilters, varietyFilter, locFilters]
  );

  const batchOptions = useMemo(() => {
    const ids = new Set(lines.filter((l) => matches(l, 'batch')).map((l) => l.batch_id));
    if (batchFilter !== 'all') ids.add(batchFilter);
    return Array.from(ids)
      .sort(byText)
      .map((id) => ({ value: id, label: hlVaBatchLabel(id, true) }));
  }, [lines, matches, batchFilter]);

  const countOptions = useMemo(() => {
    const counts = new Set(lines.filter((l) => matches(l, 'count')).map((l) => l.count_text));
    for (const c of countFilters) counts.add(c);
    return Array.from(counts)
      .sort(byText)
      .map((c) => ({ value: c, label: c || '—' }));
  }, [lines, matches, countFilters]);

  const varietyOptions = useMemo(() => {
    const varieties = new Set(lines.filter((l) => matches(l, 'variety')).map((l) => l.variety));
    if (varietyFilter !== 'all') varieties.add(varietyFilter);
    return Array.from(varieties)
      .sort(byVariety)
      .map((v) => ({ value: v, label: v || '—' }));
  }, [lines, matches, varietyFilter]);

  const locOptions = useMemo(() => {
    const ids = new Set(lines.filter((l) => matches(l, 'loc')).map((l) => l.location_id));
    for (const id of locFilters) ids.add(id);
    return Array.from(ids)
      .map((id) => ({ value: id, label: locationName(id) || 'Unassigned' }))
      .sort((a, b) => byText(a.label, b.label));
  }, [lines, matches, locFilters, locationName]);

  const shown = useMemo(
    () =>
      lines
        .filter((l) => matches(l))
        .sort(
          (a, b) =>
            a.work_date.localeCompare(b.work_date) ||
            byText(a.batch_id, b.batch_id) ||
            byText(a.count_text, b.count_text) ||
            byVariety(a.variety, b.variety)
        ),
    [lines, matches]
  );

  const tableHeaders = useMemo(
    () => [
      'Date',
      'Batch',
      'Count',
      'Variety',
      'Grade',
      'Company',
      'Location',
      'Grader',
      'HL (Kgs)',
      'VA (Kgs)',
      'Yield %',
      'Std %',
      'Diff',
    ],
    []
  );

  const tableRows = useMemo(
    () =>
      shown.map((l) => {
        const y = calculateYield(l.hl, l.va);
        return [
          fmtDay(l.work_date),
          hlVaBatchLabel(l.batch_id, true),
          l.count_text || '—',
          l.variety || '—',
          l.grade,
          batchCompany(l.batch_id),
          locationName(l.location_id) || '—',
          l.grader || '—',
          fmt(l.hl),
          fmt(l.va),
          pct1(y),
          l.std === null ? '—' : `${l.std.toFixed(1)}%`,
          signed1(y !== null && l.std !== null ? y - l.std : null),
        ];
      }),
    [shown, locationName]
  );

  const footer = useMemo(() => {
    const hl = shown.reduce((s, l) => s + l.hl, 0);
    const va = shown.reduce((s, l) => s + l.va, 0);
    const y = calculateYield(hl, va);
    const std = weightedStd(shown);
    return [
      'Total',
      `${shown.length} line${shown.length === 1 ? '' : 's'}`,
      '',
      '',
      '',
      '',
      '',
      '',
      fmt(hl),
      fmt(va),
      pct1(y),
      std === null ? '—' : `${std.toFixed(1)}%`,
      signed1(y !== null && std !== null ? y - std : null),
    ];
  }, [shown]);

  const filterNote = useMemo(() => {
    const parts: string[] = [];
    if (company !== 'all') parts.push(company);
    if (batchFilter !== 'all') parts.push(`Batch ${hlVaBatchLabel(batchFilter, true)}`);
    if (countFilters.length > 0) {
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

  // ─── By batch: which batches keep coming back ─────────────────────────────
  const batchHeaders = useMemo(
    () => ['Batch', 'Company', 'Lines', 'First', 'Last', 'HL (Kgs)', 'VA (Kgs)', 'Yield %'],
    []
  );

  const batchSummary = useMemo(() => {
    const groups = new Map<string, { lines: number; first: string; last: string; hl: number; va: number }>();
    for (const l of lines) {
      let g = groups.get(l.batch_id);
      if (!g) {
        g = { lines: 0, first: l.work_date, last: l.work_date, hl: 0, va: 0 };
        groups.set(l.batch_id, g);
      }
      g.lines += 1;
      if (l.work_date < g.first) g.first = l.work_date;
      if (l.work_date > g.last) g.last = l.work_date;
      g.hl += l.hl;
      g.va += l.va;
    }
    const rows = Array.from(groups.entries())
      // Most re-worked first — the batches worth asking about
      .sort(([a, x], [b, y]) => y.va - x.va || byText(a, b))
      .map(([batchId, g]) => [
        hlVaBatchLabel(batchId, true),
        batchCompany(batchId),
        String(g.lines),
        fmtDay(g.first),
        fmtDay(g.last),
        fmt(g.hl),
        fmt(g.va),
        yieldPct(g.hl, g.va),
      ]);
    const footerRow = [
      'Total',
      '',
      String(lines.length),
      '',
      '',
      fmt(totals.hl),
      fmt(totals.va),
      yieldPct(totals.hl, totals.va),
    ];
    return { rows, footer: footerRow };
  }, [lines, totals.hl, totals.va]);

  const locationLabel = locationFilter ? locationName(locationFilter) || undefined : undefined;

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <ChartCard title={`${RJ_SUFFIX} VA by Date`} subtitle={`re-worked VA kg per day · ${rangeLabel}`} className="xl:col-span-7">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.gridStroke} />
                <XAxis dataKey="date" tick={theme.axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={theme.axisTick} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={theme.tooltipStyle}
                  cursor={theme.cursorFill}
                  formatter={(value) => [`${fmt(Number(value))} kg`, `${RJ_SUFFIX} VA`]}
                />
                <Bar dataKey="kg" fill={color} radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No rejection batches in ${rangeLabel}`} />
          )}
        </ChartCard>

        <ChartCard title={`${RJ_SUFFIX} VA by Location`} subtitle="re-worked kg per location" className="xl:col-span-5">
          {byLocation.some((l) => l.value > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={byLocation.map((l) => ({ ...l, value: Number(l.value.toFixed(3)) }))}
                margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
              >
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
            <EmptyChart message="No location re-worked anything in this period" />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Rejection Batch Detail"
        subtitle={`every ${RJ_SUFFIX} line on the HL → VA register · measured against the same standard chart as fresh batches`}
      >
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <Picker
            id="company-rj"
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
            id="batch-rj"
            label="Batch"
            value={batchFilter}
            allLabel="All batches"
            options={batchOptions}
            onChange={setBatchFilter}
          />
          <MultiPicker
            id="count-rj"
            label="Count"
            allLabel="All counts"
            options={countOptions}
            selected={countFilters}
            onChange={setCountFilters}
          />
          <Picker
            id="variety-rj"
            label="Variety"
            value={varietyFilter}
            allLabel="All varieties"
            options={varietyOptions}
            onChange={setVarietyFilter}
          />
          <MultiPicker
            id="location-rj"
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
              title={`Rejection (${RJ_SUFFIX}) Batches — ${rangeLabel}${locationLabel ? ` · ${locationLabel}` : ''}${filterNote}`}
              headers={tableHeaders}
              rows={[...tableRows, footer]}
              filename="rejection-batches-report"
              pdfOrientation="landscape"
            />
          </div>
        </div>
        <AnalyticsTable
          headers={tableHeaders}
          rows={tableRows}
          footer={footer}
          emptyMessage={lines.length === 0 ? `No rejection batches in ${rangeLabel}` : 'No lines match these filters'}
          pageSize={50}
        />
      </ChartCard>

      <ChartCard
        title={`${RJ_SUFFIX} by Batch`}
        subtitle="one row per batch that came back · most re-worked VA first"
      >
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Rejection (${RJ_SUFFIX}) by Batch — ${rangeLabel}${locationLabel ? ` · ${locationLabel}` : ''}`}
            headers={batchHeaders}
            rows={[...batchSummary.rows, batchSummary.footer]}
            filename="rejection-by-batch"
          />
        </div>
        <AnalyticsTable
          headers={batchHeaders}
          rows={batchSummary.rows}
          footer={batchSummary.footer}
          emptyMessage={`No rejection batches in ${rangeLabel}`}
          pageSize={25}
        />
      </ChartCard>

      <GradeVaSection
        rejection
        entries={rjRows}
        rangeLabel={rangeLabel}
        fromDate={fromDate}
        toDate={toDate}
        locationLabel={locationLabel}
      />
    </div>
  );
}

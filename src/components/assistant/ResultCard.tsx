'use client';

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { CanvasResult, ColumnTone, KpiTile, ResultColumn } from '@/lib/assistant/types';
import { toDdMm, toDdMmYy, humanizeDates } from '@/lib/assistant/format';
import { exportToExcel, exportToPDF } from '@/lib/export';

/**
 * Meaning-based palette: the colour says WHAT the number is, so the same metric
 * reads the same everywhere. Held as hex (not Tailwind classes) and picked with
 * the live `isDark` flag, so dark mode needs no parallel rules in globals.css.
 */
const TONE_COLORS: Record<ColumnTone, { light: string; dark: string }> = {
  company: { light: '#0F766E', dark: '#2DD4BF' }, // teal
  outside: { light: '#B45309', dark: '#FBBF24' }, // amber
  kgBasic: { light: '#4338CA', dark: '#A5B4FC' }, // indigo
  dailyWage: { light: '#BE123C', dark: '#FB7185' }, // rose
  total: { light: '#0F172A', dark: '#E2E8F0' }, // near-black / near-white
  hon: { light: '#0369A1', dark: '#7DD3FC' }, // sky
  hl: { light: '#0F766E', dark: '#2DD4BF' }, // teal
  va: { light: '#7C3AED', dark: '#C4B5FD' }, // violet
  wip: { light: '#64748B', dark: '#94A3B8' }, // slate (still in process)
  present: { light: '#047857', dark: '#34D399' }, // emerald
  absent: { light: '#BE123C', dark: '#FB7185' }, // rose
  neutral: { light: '#374151', dark: '#D1D5DB' },
};

const MUTED = { light: '#9CA3AF', dark: '#6B7280' };

function toneColor(tone: ColumnTone | undefined, isDark: boolean | undefined): string {
  const entry = TONE_COLORS[tone ?? 'neutral'];
  return isDark ? entry.dark : entry.light;
}

function isNumericColumn(c: ResultColumn): boolean {
  return c.format === 'number' || c.format === 'kg' || c.format === 'currency' || c.format === 'percent';
}

/** Sum unless told otherwise; percent columns average instead of summing. */
function totalModeFor(c: ResultColumn): 'sum' | 'avg' | 'none' {
  if (c.total) return c.total;
  if (c.format === 'percent') return 'avg';
  return isNumericColumn(c) ? 'sum' : 'none';
}

function formatCell(value: string | number | null, format?: ResultColumn['format']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (format === 'kg') return `${value.toLocaleString('en-IN')} kg`;
    if (format === 'currency') return `₹${value.toLocaleString('en-IN')}`;
    if (format === 'percent') return `${value.toLocaleString('en-IN')}%`;
    return value.toLocaleString('en-IN');
  }
  if (format === 'date') return toDdMmYy(String(value));
  return String(value);
}

function kpiTone(tone?: KpiTile['tone']): string {
  switch (tone) {
    case 'success':
      return 'text-emerald-600';
    case 'danger':
      return 'text-rose-600';
    case 'accent':
      return 'text-teal-600';
    default:
      return 'text-gray-900';
  }
}

export default function ResultCard({ result, isDark }: { result: CanvasResult; isDark?: boolean }) {
  const columns = result.columns;
  const rows = result.rows;
  const hasTable = !!columns?.length && !!rows?.length;

  /** Column totals, computed once — drives both the footer row and the shares. */
  const totals = useMemo(() => {
    if (!columns || !rows?.length) return null;
    const out: Record<string, { value: number; mode: 'sum' | 'avg' }> = {};
    for (const c of columns) {
      const mode = totalModeFor(c);
      if (mode === 'none') continue;
      const nums = rows
        .map((r) => r[c.key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (!nums.length) continue;
      const sum = nums.reduce((s, n) => s + n, 0);
      // Averages ignore non-reporting rows so one idle location can't drag a rate down.
      const nonZero = nums.filter((n) => n !== 0);
      const value =
        mode === 'avg'
          ? Math.round((nonZero.length ? sum / nonZero.length : 0) * 10) / 10
          : Math.round(sum * 1000) / 1000;
      out[c.key] = { value, mode };
    }
    return out;
  }, [columns, rows]);

  /** Show a share % under a cell only where it genuinely adds information. */
  const showsShare = (c: ResultColumn): boolean => {
    if (c.share === false) return false;
    if (totalModeFor(c) !== 'sum') return false;
    if (!rows || rows.length < 2) return false;
    const t = totals?.[c.key];
    return !!t && t.value > 0;
  };

  const periodLabelText =
    result.meta.period_label ?? (result.meta.date_resolved ? humanizeDates(result.meta.date_resolved) : '');

  const handleExport = (type: 'xlsx' | 'pdf') => {
    if (!columns || !rows) return;
    const headers = columns.map((c) => c.label);
    const body = rows.map((r) =>
      columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined) return '';
        return c.format === 'date' && typeof v === 'string' ? toDdMmYy(v) : v;
      })
    );
    // The totals the user sees on screen travel into the file with the data.
    if (totals && Object.keys(totals).length) {
      body.push(
        columns.map((c, i) => {
          if (i === 0) return 'TOTAL';
          const t = totals[c.key];
          if (!t) return '';
          return t.mode === 'avg' ? `${t.value} (avg)` : t.value;
        })
      );
    }
    const heading = periodLabelText ? `${result.title} — ${periodLabelText}` : result.title;
    const filename = result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (type === 'xlsx') exportToExcel(heading, headers, body, filename);
    else exportToPDF(heading, headers, body, filename);
  };

  const xIsDate = !!result.chart && columns?.find((c) => c.key === result.chart!.xKey)?.format === 'date';
  const seriesColor = (key: string, i: number): string => {
    const col = columns?.find((c) => c.key === key);
    if (col?.tone) return toneColor(col.tone, isDark);
    const fallback: ColumnTone[] = ['company', 'outside', 'kgBasic', 'dailyWage'];
    return toneColor(fallback[i % fallback.length], isDark);
  };

  return (
    <div className="bg-white rounded-2xl p-4 lg:p-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] lg:text-base font-bold text-gray-900 leading-tight">
            {result.title}
          </h3>
          {result.subtitle && (
            <p className="text-[11px] text-gray-500 font-medium mt-0.5 leading-snug">{result.subtitle}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {periodLabelText && (
              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[10px] font-bold">
                {periodLabelText}
              </span>
            )}
            {result.meta.person_resolved && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold">
                {result.meta.person_resolved}
              </span>
            )}
            {!!result.meta.row_count && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold">
                {result.meta.row_count} {result.meta.row_count === 1 ? 'row' : 'rows'}
              </span>
            )}
            <span className="text-[10px] text-gray-400 font-medium truncate">“{result.question}”</span>
          </div>
        </div>
        {hasTable && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => handleExport('xlsx')}
              title="Export Excel"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-bold"
            >
              XLS
            </button>
            <button
              onClick={() => handleExport('pdf')}
              title="Export PDF"
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-[10px] font-bold"
            >
              PDF
            </button>
          </div>
        )}
      </div>

      {/* No data */}
      {result.meta.no_data && (
        <div className="flex items-center gap-2.5 px-3.5 py-3 bg-amber-50 rounded-xl mb-1">
          <span className="text-lg">📭</span>
          <p className="text-xs font-semibold text-amber-700">
            No data was entered for this date — these are not real zeros.
          </p>
        </div>
      )}

      {/* KPI tiles */}
      {!!result.kpis?.length && !result.meta.no_data && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {result.kpis.map((k) => (
            <div key={k.label} className="bg-gray-50 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold text-gray-500 truncate">{k.label}</p>
              <p className={`text-xl font-bold leading-tight ${kpiTone(k.tone)}`}>
                {typeof k.value === 'number' ? k.value.toLocaleString('en-IN') : k.value}
                {k.unit && <span className="text-[10px] font-semibold text-gray-400 ml-1">{k.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Card fields (details / analysis) */}
      {!!result.fields?.length && (
        <div className="space-y-2">
          {result.fields.map((f) => (
            <div key={f.label} className="flex gap-3 px-3.5 py-2.5 bg-gray-50 rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 w-24 flex-shrink-0 pt-0.5">{f.label}</span>
              <span className="text-[13px] font-medium text-gray-900 whitespace-pre-wrap min-w-0">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart — bar compares locations, line shows a day-by-day trend */}
      {result.chart && !!rows?.length && !result.meta.no_data && (
        <div className="h-56 mb-3 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            {result.chart.type === 'line' ? (
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#f3f4f6'} vertical={false} />
                <XAxis
                  dataKey={result.chart.xKey}
                  tickFormatter={xIsDate ? (v: string) => toDdMm(v) : undefined}
                  tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={12}
                />
                <YAxis tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  labelFormatter={xIsDate ? (v) => toDdMmYy(String(v)) : undefined}
                  contentStyle={{
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {result.chart.series.map((s, i) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={seriesColor(s.key, i)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#f3f4f6'} vertical={false} />
                <XAxis
                  dataKey={result.chart.xKey}
                  tickFormatter={xIsDate ? (v: string) => toDdMm(v) : undefined}
                  tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  labelFormatter={xIsDate ? (v) => toDdMmYy(String(v)) : undefined}
                  contentStyle={{
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {result.chart.series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={seriesColor(s.key, i)}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {hasTable && !result.meta.no_data && (
        <div className="overflow-x-auto -mx-4 px-4 lg:-mx-5 lg:px-5">
          <table className="w-full text-left border-collapse min-w-[420px]">
            <thead>
              <tr>
                {columns!.map((c, i) => (
                  <th
                    key={c.key}
                    style={c.tone ? { color: toneColor(c.tone, isDark) } : undefined}
                    className={`bg-gray-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${
                      c.tone ? '' : 'text-gray-500'
                    } ${i === 0 ? 'rounded-l-lg' : ''} ${
                      i === columns!.length - 1 ? 'rounded-r-lg' : ''
                    } ${isNumericColumn(c) ? 'text-right' : ''}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows!.map((row, ri) => (
                <tr key={ri} className="border-t border-gray-50">
                  {columns!.map((c) => {
                    const raw = row[c.key] ?? null;
                    const numeric = isNumericColumn(c);
                    const isZero = raw === 0 || raw === null;
                    const share =
                      showsShare(c) && typeof raw === 'number' && raw !== 0
                        ? Math.round((raw / totals![c.key].value) * 1000) / 10
                        : null;
                    const cellStyle = numeric
                      ? { color: isZero ? (isDark ? MUTED.dark : MUTED.light) : toneColor(c.tone, isDark) }
                      : undefined;
                    return (
                      <td
                        key={c.key}
                        style={cellStyle}
                        className={`px-3 py-2 text-xs align-top ${
                          numeric ? 'text-right tabular-nums font-semibold' : 'font-medium text-gray-700'
                        }`}
                      >
                        {formatCell(raw, c.format)}
                        {share !== null && (
                          <span className="block text-[9px] font-semibold text-gray-400 mt-0.5">{share}%</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {!!totals && Object.keys(totals).length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  {columns!.map((c, i) => {
                    const t = totals[c.key];
                    if (i === 0) {
                      return (
                        <td
                          key={c.key}
                          className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500"
                        >
                          Total
                        </td>
                      );
                    }
                    return (
                      <td
                        key={c.key}
                        style={t ? { color: toneColor(c.tone ?? 'total', isDark) } : undefined}
                        className="px-3 py-2 text-xs font-bold text-right tabular-nums"
                      >
                        {t ? formatCell(t.value, c.format) : ''}
                        {t?.mode === 'avg' && (
                          <span className="block text-[9px] font-semibold text-gray-400 mt-0.5">avg</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-400 font-medium mt-3">{result.askedAt}</p>
    </div>
  );
}

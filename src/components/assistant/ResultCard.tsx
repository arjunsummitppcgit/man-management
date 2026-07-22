'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { CanvasResult, KpiTile, ResultColumn } from '@/lib/assistant/types';
import { exportToExcel, exportToPDF } from '@/lib/export';

const SERIES_COLORS = ['#0D9488', '#F59E0B', '#6366F1', '#F43F5E'];

function formatCell(value: string | number | null, format?: ResultColumn['format']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (format === 'kg') return `${value.toLocaleString('en-IN')} kg`;
    if (format === 'currency') return `₹${value.toLocaleString('en-IN')}`;
    return value.toLocaleString('en-IN');
  }
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
  const hasTable = !!result.columns?.length && !!result.rows?.length;

  const handleExport = (type: 'xlsx' | 'pdf') => {
    if (!result.columns || !result.rows) return;
    const headers = result.columns.map((c) => c.label);
    const rows = result.rows.map((r) =>
      result.columns!.map((c) => {
        const v = r[c.key];
        return v === null || v === undefined ? '' : v;
      })
    );
    const filename = result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (type === 'xlsx') exportToExcel(result.title, headers, rows, filename);
    else exportToPDF(result.title, headers, rows, filename);
  };

  return (
    <div className="bg-white rounded-2xl p-4 lg:p-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] lg:text-base font-bold text-gray-900 leading-tight truncate">
            {result.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {result.meta.date_resolved && (
              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[10px] font-bold">
                {result.meta.date_resolved}
              </span>
            )}
            {result.meta.person_resolved && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold">
                {result.meta.person_resolved}
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

      {/* Chart */}
      {result.chart && !!result.rows?.length && !result.meta.no_data && (
        <div className="h-56 mb-3 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={result.rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#f3f4f6'} vertical={false} />
              <XAxis
                dataKey={result.chart.xKey}
                tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip
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
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {hasTable && !result.meta.no_data && (
        <div className="overflow-x-auto -mx-4 px-4 lg:-mx-5 lg:px-5">
          <table className="w-full text-left border-collapse min-w-[420px]">
            <thead>
              <tr>
                {result.columns!.map((c, i) => (
                  <th
                    key={c.key}
                    className={`bg-gray-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 ${
                      i === 0 ? 'rounded-l-lg' : ''
                    } ${i === result.columns!.length - 1 ? 'rounded-r-lg' : ''} ${
                      c.format && c.format !== 'text' && c.format !== 'date' ? 'text-right' : ''
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows!.map((row, ri) => (
                <tr key={ri} className="border-t border-gray-50">
                  {result.columns!.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 text-xs font-medium ${
                        c.format && c.format !== 'text' && c.format !== 'date'
                          ? 'text-right text-gray-900 tabular-nums'
                          : 'text-gray-700'
                      }`}
                    >
                      {formatCell(row[c.key] ?? null, c.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-400 font-medium mt-3">{result.askedAt}</p>
    </div>
  );
}

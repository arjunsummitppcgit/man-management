'use client';

import React, { useSyncExternalStore } from 'react';
import { format, parseISO } from 'date-fns';
import { exportToPDF, exportToExcel } from '@/lib/export';
import type { Location } from '@/types';

// ─── Formatting ──────────────────────────────────────────────────────────────

export const fmt = (v: number) =>
  v.toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const fmtInt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 });

/** Per-day averages read better with one decimal — "85.6/day" isn't an exact count. */
export const fmtAvg = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 1 });

export const fmtDay = (date: string) => {
  try {
    return format(parseISO(date), 'd MMM');
  } catch {
    return date;
  }
};

// ─── Dark mode detection (class-based, kept in sync with the .dark toggle) ──

function subscribeToThemeClass(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeToThemeClass,
    () => document.documentElement.classList.contains('dark'),
    () => false
  );
}

// ─── Recharts theming that matches the dashboard charts ─────────────────────

export function chartTheme(isDark: boolean) {
  return {
    axisTick: { fill: isDark ? '#7c8aa0' : '#94a3b8', fontSize: 11, fontWeight: 600 } as const,
    gridStroke: isDark ? 'rgba(148,163,184,0.12)' : '#eef2f6',
    tooltipStyle: {
      background: isDark ? 'rgba(17,24,39,0.96)' : 'rgba(255,255,255,0.98)',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : '#e5e7eb'}`,
      borderRadius: 12,
      boxShadow: '0 12px 32px -8px rgba(2,32,30,0.25)',
      fontSize: 12,
      fontWeight: 600,
      color: isDark ? '#f3f4f6' : '#111827',
    } as React.CSSProperties,
    cursorFill: { fill: isDark ? 'rgba(148,163,184,0.06)' : 'rgba(13,148,136,0.05)' },
  };
}

export const SERIES_COLORS = ['#0d9488', '#f59e0b', '#6366f1', '#f43f5e', '#a855f7', '#0ea5e9', '#84cc16', '#fb923c'];

// ─── Stat chips ──────────────────────────────────────────────────────────────

export interface Chip {
  label: string;
  value: string;
  sub: string;
  accent: string; // tailwind gradient e.g. 'from-teal-500 to-teal-600'
  icon: string;
  action?: React.ReactNode; // optional control rendered under the icon (e.g. an Edit button)
}

export function ChipRow({ chips }: { chips: Chip[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 stagger">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="ana-chip relative overflow-hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
        >
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${chip.accent}`} />
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{chip.label}</p>
              <p className="text-xl lg:text-2xl font-bold text-gray-900 mt-1.5 font-display tracking-tight truncate">
                {chip.value}
              </p>
              <p className="text-[11px] text-gray-400 mt-1 font-medium truncate">{chip.sub}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="text-xl" aria-hidden>{chip.icon}</span>
              {chip.action}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Chart card wrapper ──────────────────────────────────────────────────────

export function ChartCard({
  title,
  subtitle,
  badge,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`chart-card bg-white rounded-2xl p-4 lg:p-5 shadow-sm border border-gray-100 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-400 font-medium mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[220px] gap-2">
      <span className="text-3xl opacity-50">📈</span>
      <p className="text-xs text-gray-400 font-medium text-center px-4">{message}</p>
    </div>
  );
}

// ─── Export buttons (PDF / Excel via existing lib/export) ───────────────────

export function ExportButtons({
  title,
  headers,
  rows,
  filename,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  filename: string;
}) {
  const disabled = rows.length === 0;
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => exportToPDF(title, headers, rows, filename)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        PDF
      </button>
      <button
        onClick={() => exportToExcel(title, headers, rows, filename)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-4.875c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5A1.125 1.125 0 0112 10.875v-1.5c0-.621.504-1.125 1.125-1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5c0-.621.504-1.125 1.125-1.125M20.625 15.75h-7.5A1.125 1.125 0 0112 14.625" />
        </svg>
        Excel
      </button>
    </div>
  );
}

// ─── Generic data table ──────────────────────────────────────────────────────

export function AnalyticsTable({
  headers,
  rows,
  footer,
  emptyMessage = 'No data for the selected period',
}: {
  headers: string[];
  rows: (string | number)[][];
  footer?: (string | number)[];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 bg-gray-50 rounded-xl">
        <p className="text-xs text-gray-400 font-medium">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto -mx-4 lg:mx-0 px-4 lg:px-0">
      <table className="w-full text-xs min-w-[560px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                className={`bg-gray-50 px-3 py-2 font-bold text-gray-500 uppercase tracking-wider text-[10px] whitespace-nowrap ${
                  i === 0 ? 'text-left rounded-l-lg' : 'text-center'
                } ${i === headers.length - 1 ? 'rounded-r-lg' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-teal-50/40 transition-colors">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2.5 whitespace-nowrap ${
                    ci === 0 ? 'text-left font-semibold text-gray-900' : 'text-center text-gray-600 font-medium'
                  }`}
                >
                  {cell === 0 || cell === '0' ? <span className="text-gray-300">—</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {footer.map((cell, ci) => (
                <td
                  key={ci}
                  className={`bg-teal-50 px-3 py-2.5 font-bold text-teal-800 whitespace-nowrap ${
                    ci === 0 ? 'text-left rounded-l-lg' : 'text-center'
                  } ${ci === footer.length - 1 ? 'rounded-r-lg' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Filter bar: date presets + custom range + location ─────────────────────

export type PresetKey = 'today' | '7d' | '30d' | 'month' | 'custom';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

export function FilterBar({
  preset,
  onPreset,
  fromDate,
  toDate,
  onFromDate,
  onToDate,
  locations,
  locationFilter,
  onLocationFilter,
  showLocation = true,
}: {
  preset: PresetKey;
  onPreset: (p: PresetKey) => void;
  fromDate: string;
  toDate: string;
  onFromDate: (d: string) => void;
  onToDate: (d: string) => void;
  locations: Location[];
  locationFilter: string | null;
  onLocationFilter: (id: string | null) => void;
  showLocation?: boolean;
}) {
  return (
    <div className="ana-filterbar bg-white rounded-2xl p-3 lg:p-3.5 shadow-sm border border-gray-100 flex flex-wrap items-center gap-2.5">
      {/* Date presets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
              preset === p.key
                ? 'ana-preset-active text-white shadow-md shadow-teal-500/25'
                : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom range inputs */}
      {preset === 'custom' && (
        <div className="flex items-center gap-2 animate-fade-in">
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => e.target.value && onFromDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white"
          />
          <span className="text-gray-400 text-xs font-bold">→</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => e.target.value && onToDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white"
          />
        </div>
      )}

      {/* Location filter */}
      {showLocation && (
        <div className="flex items-center gap-1.5 flex-wrap lg:ml-auto">
          <button
            onClick={() => onLocationFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
              locationFilter === null
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                : 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            All Locations
          </button>
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => onLocationFilter(loc.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                locationFilter === loc.id
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                  : 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

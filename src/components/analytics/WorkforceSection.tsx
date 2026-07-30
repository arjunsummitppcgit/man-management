'use client';

import React, { useMemo } from 'react';
import type { AnalyticsData, WorkforceRow } from '@/hooks/useAnalytics';
import { ChartCard, AnalyticsTable, ExportButtons, fmtInt, fmtDay } from './shared';

type Column = { label: string; value: (r: WorkforceRow) => number };

/** Checking recorded before migration 023 sits in the total alone, with both sub-columns at 0. */
const unsplitChecking = (r: WorkforceRow) =>
  Math.max(0, (r.checking_count || 0) - (r.checking_waste || 0) - (r.checking_pd || 0));

const LEADING_COLUMNS: Column[] = [
  { label: 'Labour', value: (r) => r.labour_count || 0 },
  { label: 'Boys', value: (r) => r.boys_count || 0 },
  { label: 'Waste Checking', value: (r) => r.checking_waste || 0 },
  { label: 'PD Checking', value: (r) => r.checking_pd || 0 },
];

const TRAILING_COLUMNS: Column[] = [
  { label: 'Cleaning', value: (r) => r.cleaning_count || 0 },
  { label: 'QC', value: (r) => r.qc_count || 0 },
  { label: 'Security', value: (r) => r.security_count || 0 },
];

export default function WorkforceSection({
  data,
  locationFilter,
  rangeLabel,
}: {
  data: AnalyticsData;
  locationFilter: string | null;
  rangeLabel: string;
}) {
  const rows = useMemo(
    () => data.workforce.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.workforce, locationFilter]
  );

  const total = rows.reduce((s, r) => s + (r.total_headcount || 0), 0);

  // The unsplit column only earns its place when the period actually contains
  // pre-split dates; without it those rows wouldn't add up to their own Total.
  const columns = rows.some((r) => unsplitChecking(r) > 0)
    ? [...LEADING_COLUMNS, { label: 'Checking (unsplit)', value: unsplitChecking }, ...TRAILING_COLUMNS]
    : [...LEADING_COLUMNS, ...TRAILING_COLUMNS];

  const tableHeaders = ['Date', ...columns.map((c) => c.label), 'Total'];
  const tableRows = Array.from(
    rows.reduce((map, r) => {
      const cur = map.get(r.work_date) || new Array(columns.length + 1).fill(0);
      columns.forEach((c, i) => {
        cur[i] += c.value(r);
      });
      cur[columns.length] += r.total_headcount || 0;
      map.set(r.work_date, cur);
      return map;
    }, new Map<string, number[]>())
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => [fmtDay(date), ...vals.map((v) => (v > 0 ? fmtInt(v) : 0))]);

  const footer = [
    'Total',
    ...columns.map((c) => {
      const t = rows.reduce((s, r) => s + c.value(r), 0);
      return t > 0 ? fmtInt(t) : '—';
    }),
    fmtInt(total),
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChartCard title="Workforce Attendance Detail" subtitle="daily headcount by category">
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Workforce Attendance — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer]}
            filename="workforce-attendance"
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
      </ChartCard>
    </div>
  );
}

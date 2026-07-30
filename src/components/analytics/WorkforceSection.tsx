'use client';

import React, { useMemo } from 'react';
import type { AnalyticsData, WorkforceRow } from '@/hooks/useAnalytics';
import { ChartCard, AnalyticsTable, ExportButtons, fmtInt, fmtDay } from './shared';

const CATEGORIES: { key: keyof WorkforceRow; label: string }[] = [
  { key: 'labour_count', label: 'Labour' },
  { key: 'boys_count', label: 'Boys' },
  { key: 'checking_count', label: 'Checking' },
  { key: 'cleaning_count', label: 'Cleaning' },
  { key: 'qc_count', label: 'QC' },
  { key: 'security_count', label: 'Security' },
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

  const tableHeaders = ['Date', ...CATEGORIES.map((c) => c.label), 'Total'];
  const tableRows = Array.from(
    rows.reduce((map, r) => {
      const cur = map.get(r.work_date) || new Array(CATEGORIES.length + 1).fill(0);
      CATEGORIES.forEach((c, i) => {
        cur[i] += Number(r[c.key]) || 0;
      });
      cur[CATEGORIES.length] += r.total_headcount || 0;
      map.set(r.work_date, cur);
      return map;
    }, new Map<string, number[]>())
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => [fmtDay(date), ...vals.map((v) => (v > 0 ? fmtInt(v) : 0))]);
  const footer = [
    'Total',
    ...CATEGORIES.map((c) => {
      const t = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
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

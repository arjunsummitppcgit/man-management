'use client';

import React, { useMemo } from 'react';
import type { AnalyticsData, SanitizationRow } from '@/hooks/useAnalytics';
import { ChartCard, AnalyticsTable, ExportButtons, fmt, fmtDay } from './shared';

const CHEMICAL_ITEMS: { key: keyof SanitizationRow; label: string }[] = [
  { key: 'chlorine_ppc', label: 'Chlorine · PPC' },
  { key: 'chlorine_crates', label: 'Chlorine · Crates' },
  { key: 'chlorine_washrooms', label: 'Chlorine · Washrooms' },
  { key: 'chlorine_grading_machine', label: 'Chlorine · Grading M/C' },
  { key: 'soap_oil_ppc', label: 'Soap Oil · PPC' },
  { key: 'soap_oil_crates', label: 'Soap Oil · Crates' },
  { key: 'soap_oil_washrooms', label: 'Soap Oil · Washrooms' },
  { key: 'soap_oil_grading_machine', label: 'Soap Oil · Grading M/C' },
  { key: 'gloves', label: 'Gloves' },
  { key: 'head_cap', label: 'Head Caps' },
  { key: 'masks', label: 'Masks' },
];

export default function ChemicalsSection({
  data,
  locationFilter,
  rangeLabel,
}: {
  data: AnalyticsData;
  locationFilter: string | null;
  rangeLabel: string;
}) {
  const rows = useMemo(
    () => data.sanitization.filter((r) => !locationFilter || r.location_id === locationFilter),
    [data.sanitization, locationFilter]
  );

  // Only show columns for items that were actually used in the period
  const items = CHEMICAL_ITEMS.filter((item) => rows.some((r) => (Number(r[item.key]) || 0) > 0));

  // Table: date rows × item columns
  const tableHeaders = ['Date', ...items.map((i) => i.label), 'Total'];
  const tableRows = Array.from(
    rows.reduce((map, r) => {
      const cur = map.get(r.work_date) || new Array(items.length + 1).fill(0);
      items.forEach((item, i) => {
        const v = Number(r[item.key]) || 0;
        cur[i] += v;
        cur[items.length] += v;
      });
      map.set(r.work_date, cur);
      return map;
    }, new Map<string, number[]>())
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => [fmtDay(date), ...vals.map((v) => (v > 0 ? fmt(v) : 0))]);

  const itemTotals = items.map((item) => rows.reduce((s, r) => s + (Number(r[item.key]) || 0), 0));
  const footer = [
    'Total',
    ...itemTotals.map((t) => (t > 0 ? fmt(t) : '—')),
    fmt(itemTotals.reduce((s, t) => s + t, 0)),
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChartCard title="Essentials & Chemicals Detail" subtitle="daily usage by item">
        <div className="flex justify-end mb-3">
          <ExportButtons
            title={`Essentials & Chemicals — ${rangeLabel}`}
            headers={tableHeaders}
            rows={[...tableRows, footer]}
            filename="essentials-chemicals"
          />
        </div>
        <AnalyticsTable headers={tableHeaders} rows={tableRows} footer={footer} />
      </ChartCard>
    </div>
  );
}

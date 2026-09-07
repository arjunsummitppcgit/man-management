'use client';

import React, { useMemo } from 'react';
import GradeVaReport from '@/components/reports/GradeVaReport';
import { ExportButtons } from './shared';
import { buildGradeVaMatrix, REPORT_VARIETIES, type GradeVaEntry } from '@/lib/gradeVa';
import { formatVaQty } from '@/lib/hlVa';
import type { ExportCell } from '@/lib/export';

/** Indian grouping, three decimals — the register's own precision. */
const EXCEL_NUMBER_FORMAT = '##,##,##0.000';

/**
 * The Daily Report's Grade Vs VA sheet, run across the analytics date range
 * instead of a single day: the same grade × variety matrix over every HL→VA
 * entry in the selected span, with PDF and Excel of what's on screen.
 *
 * The range and the location come from the filter bar at the top of the page,
 * so "Custom → from → to" drives this sheet like it drives everything else in
 * the section. A second pair of date pickers here would only give the page two
 * ranges to disagree about.
 */
export default function GradeVaSection({
  entries,
  rangeLabel,
  fromDate,
  toDate,
  locationLabel,
}: {
  /** HL→VA rows for the range, already narrowed to the chosen location. */
  entries: GradeVaEntry[];
  rangeLabel: string;
  fromDate: string;
  toDate: string;
  /** Name of the chosen location, when the page is filtered to one. */
  locationLabel?: string;
}) {
  const { rows, varietyTotals, grandTotal } = useMemo(() => buildGradeVaMatrix(entries), [entries]);

  const headers = useMemo(() => ['GRADES', ...REPORT_VARIETIES, 'TOTAL'], []);

  /**
   * Two shapes of the same sheet: strings for the PDF, so it reads exactly like
   * the card above (dashes and all), and raw numbers for Excel, so the columns
   * stay summable there. Idle cells go out as `null` rather than 0 — a zero in
   * every empty cell of a mostly-empty grade sheet is noise to look past.
   */
  const { exportRows, excelRows } = useMemo(() => {
    if (grandTotal <= 0) return { exportRows: [], excelRows: [] };

    const text: ExportCell[][] = rows.map((r) => [
      r.grade,
      ...r.cells.map((v) => (v > 0 ? formatVaQty(v) : '-')),
      r.total > 0 ? formatVaQty(r.total) : '-',
    ]);
    text.push([
      'TOTAL',
      ...varietyTotals.map((v) => (v > 0 ? formatVaQty(v) : '-')),
      formatVaQty(grandTotal),
    ]);

    const nums: ExportCell[][] = rows.map((r) => [
      r.grade,
      ...r.cells.map((v) => (v > 0 ? v : null)),
      r.total > 0 ? r.total : null,
    ]);
    nums.push(['TOTAL', ...varietyTotals.map((v) => (v > 0 ? v : null)), grandTotal]);

    return { exportRows: text, excelRows: nums };
  }, [rows, varietyTotals, grandTotal]);

  const title = `Grade Vs VA Report — ${rangeLabel}${locationLabel ? ` · ${locationLabel}` : ''}`;
  const filename =
    fromDate === toDate ? `grade-vs-va-${fromDate}` : `grade-vs-va-${fromDate}-to-${toDate}`;

  return (
    <GradeVaReport
      entries={entries}
      date={toDate}
      dateLabel={rangeLabel}
      actions={
        <ExportButtons
          title={title}
          headers={headers}
          rows={exportRows}
          excelRows={excelRows}
          excelNumberFormat={EXCEL_NUMBER_FORMAT}
          filename={filename}
        />
      }
    />
  );
}

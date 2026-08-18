'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import { HEAD_WASTE_RATE, VA_WASTE_RATE, type HeadWasteByDate } from '@/lib/headWaste';
import { WasteCells, WasteHeader } from '@/components/reports/headWasteShared';

/**
 * The date-wise Head Waste statement: every worked date carries its own
 * location lines and a day subtotal, closing on the grand total for the range.
 *
 * Dates with no in-house processing are left out rather than printed empty —
 * see buildHeadWasteByDate. The date is written once per day group instead of
 * being carried in a rowspan, which survives a page break intact when printed;
 * the export repeats it on every line so the sheet can be sorted and filtered.
 */
export default function HeadWasteByDateTable({
  byDate,
  multiplier,
}: {
  byDate: HeadWasteByDate;
  multiplier: number;
}) {
  const { days, grandTotal } = byDate;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <WasteHeader
          leading={[{ label: 'Date' }, { label: 'Location' }]}
          headRate={HEAD_WASTE_RATE}
          vaRate={VA_WASTE_RATE}
          multiplier={multiplier}
        />

        <tbody className="divide-y divide-gray-50">
          {days.map((day) => (
            <React.Fragment key={day.date}>
              {day.rows.map((row, index) => (
                <tr
                  key={`${day.date}-${row.key}`}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${
                    // A rule across the top of each group is what separates one
                    // day from the next once the dates stop repeating
                    index === 0 ? 'border-t-2 border-gray-200 dark:border-gray-700' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap align-top">
                    {index === 0 && <DateCell date={day.date} />}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {row.label}
                  </td>
                  <WasteCells row={row} multiplier={multiplier} />
                </tr>
              ))}

              <tr className="bg-amber-50 border-t border-amber-100 dark:border-amber-900/40">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-sm font-bold text-amber-900 whitespace-nowrap">
                  {day.total.label}
                </td>
                <WasteCells row={day.total} multiplier={multiplier} tone="subtotal" />
              </tr>
            </React.Fragment>
          ))}
        </tbody>

        <tfoot>
          <tr className="bg-teal-50 dark:bg-teal-900/30 border-t-2 border-teal-100 dark:border-teal-800">
            <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">
              {days.length} {days.length === 1 ? 'day' : 'days'}
            </td>
            <td className="px-4 py-3 text-sm font-bold text-teal-900 whitespace-nowrap">
              {grandTotal.label}
            </td>
            <WasteCells row={grandTotal} multiplier={multiplier} tone="total" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** '05 Aug 2026' over the weekday — the day name makes a gap in the dates read
 *  as a Sunday rather than as missing data. */
function DateCell({ date }: { date: string }) {
  let day = date;
  let weekday = '';
  try {
    const parsed = parseISO(date);
    day = format(parsed, 'dd MMM yyyy');
    weekday = format(parsed, 'EEE');
  } catch {
    // an unparseable date still prints as stored rather than breaking the row
  }
  return (
    <>
      {day}
      {weekday && (
        <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          {weekday}
        </span>
      )}
    </>
  );
}

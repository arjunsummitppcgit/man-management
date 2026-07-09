'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getDaysInMonth } from 'date-fns';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const formatAmount = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

interface BatchRecord {
  id: string;
  name: string;
  sort_order: number;
}

interface LadiesPerHeadAmountSectionProps {
  /** Any date within the month to display, format YYYY-MM-DD */
  selectedDate: string;
}

/**
 * Daily Report section: full-month grid of ladies per-head amount for the
 * month of `selectedDate` — entry values shown as-is (no calculation).
 * Rows = batches, row Total = sum of amounts, bottom Total row = per-day sum,
 * plus a grand total.
 */
export default function LadiesPerHeadAmountSection({ selectedDate }: LadiesPerHeadAmountSectionProps) {
  const [year, month] = useMemo(() => {
    const d = new Date(selectedDate);
    return [d.getFullYear(), d.getMonth() + 1] as const;
  }, [selectedDate]);

  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [amountLookup, setAmountLookup] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Load locations once
  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (!error && data) {
        setLocations(data);
        if (data.length > 0) setLocationId((prev) => prev || data[0].id);
      }
    };
    fetchLocations();
  }, []);

  // Fetch batches + amounts for the month
  useEffect(() => {
    if (!locationId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
        const numDays = getDaysInMonth(new Date(year, month - 1));
        const endStr = `${year}-${String(month).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;

        const [batchRes, amtRes] = await Promise.all([
          supabase
            .from('local_ladies_batches')
            .select('id, name, sort_order')
            .eq('location_id', locationId)
            .eq('is_active', true)
            .order('sort_order'),
          supabase
            .from('local_ladies_per_head_amount')
            .select('batch_id, work_date, per_head_amount')
            .eq('location_id', locationId)
            .gte('work_date', startStr)
            .lte('work_date', endStr),
        ]);

        if (batchRes.error) throw batchRes.error;
        setBatches(batchRes.data || []);

        const amtMap = new Map<string, number>();
        (amtRes.data || []).forEach((a) => {
          amtMap.set(`${a.batch_id}_${a.work_date}`, Number(a.per_head_amount) || 0);
        });
        setAmountLookup(amtMap);
      } catch (error) {
        console.error('Error loading ladies per-head amount section:', error);
        setBatches([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [locationId, year, month]);

  const daysInMonth = useMemo(() => {
    const numDays = getDaysInMonth(new Date(year, month - 1));
    return Array.from({ length: numDays }, (_, i) => {
      const dayNum = i + 1;
      const date = new Date(year, month - 1, dayNum);
      return {
        dayNum,
        isSunday: date.getDay() === 0,
        formattedDate: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
      };
    });
  }, [year, month]);

  const rows = useMemo(() => {
    return batches.map((batch, idx) => {
      let total = 0;
      const daily = daysInMonth.map((day) => {
        const amount = amountLookup.get(`${batch.id}_${day.formattedDate}`) ?? 0;
        total += amount;
        return { dayNum: day.dayNum, amount };
      });
      return { sNo: idx + 1, id: batch.id, name: batch.name, daily, total };
    });
  }, [batches, daysInMonth, amountLookup]);

  const columnTotals = useMemo(() => {
    const perDay = daysInMonth.map((day) => {
      let sum = 0;
      batches.forEach((batch) => {
        sum += amountLookup.get(`${batch.id}_${day.formattedDate}`) ?? 0;
      });
      return sum;
    });
    return { perDay, grand: perDay.reduce((a, b) => a + b, 0) };
  }, [batches, daysInMonth, amountLookup]);

  const hasData = rows.some((r) => r.total > 0);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 bg-amber-50/50 dark:bg-amber-950/10">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide truncate">
            Ladies Per Head Amount — {MONTH_LABELS[month - 1]} {year}
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Amounts as entered (whole month)</p>
        </div>
        {locations.length > 1 && (
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-200 focus:border-teal-500 appearance-none shadow-sm flex-shrink-0"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
      ) : !hasData ? (
        <div className="p-8 text-center">
          <span className="text-3xl mb-2 block">💰</span>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No per-head amounts for {MONTH_LABELS[month - 1]} {year} yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 min-w-[48px] text-center border-r border-gray-100 dark:border-gray-800">
                  S.No
                </th>
                <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-[48px] z-20 bg-gray-50 dark:bg-gray-800 min-w-[150px] border-r border-gray-200 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  Batch Name
                </th>
                {daysInMonth.map((day) => (
                  <th
                    key={day.dayNum}
                    className={`py-3 px-1 text-center font-bold min-w-[48px] border-r border-gray-100 dark:border-gray-800/30 ${
                      day.isSunday ? 'bg-emerald-600 dark:bg-emerald-800 text-white font-black' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {day.dayNum}
                  </th>
                ))}
                <th className="px-3 py-3 font-bold text-amber-600 dark:text-amber-400 text-center uppercase tracking-wider min-w-[90px] bg-amber-50/50 dark:bg-amber-950/20">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-3 py-3 text-center text-gray-400 dark:text-gray-500 font-medium sticky left-0 z-10 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800">
                    {row.sNo}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 sticky left-[48px] z-10 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.02)] truncate max-w-[150px]">
                    {row.name}
                  </td>
                  {row.daily.map((cell) => (
                    <td key={cell.dayNum} className="py-2 px-1 text-center border-r border-gray-100/50 dark:border-gray-800/20">
                      {cell.amount > 0 ? (
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-[11px]">{formatAmount(cell.amount)}</span>
                      ) : (
                        <span className="font-bold text-rose-400 dark:text-rose-500 text-xs">A</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-bold text-amber-600 dark:text-amber-400 bg-amber-50/20 dark:bg-amber-950/10 text-sm">
                    {formatAmount(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700 font-bold">
                <td className="px-3 py-3 sticky left-0 z-10 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700" />
                <td className="px-4 py-3 text-gray-700 dark:text-gray-200 uppercase tracking-wider sticky left-[48px] z-10 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  Total
                </td>
                {columnTotals.perDay.map((sum, i) => (
                  <td key={i} className="py-3 px-1 text-center text-gray-700 dark:text-gray-200 border-r border-gray-200/60 dark:border-gray-700/40 text-[11px]">
                    {sum > 0 ? formatAmount(sum) : <span className="text-gray-300 dark:text-gray-600">0</span>}
                  </td>
                ))}
                <td className="px-3 py-3 text-center text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/40 text-sm">
                  {formatAmount(columnTotals.grand)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

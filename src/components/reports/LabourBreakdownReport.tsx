'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface LabourBreakdownReportProps {
  date: string;
}

interface Row {
  key: string;
  label: string;
  kgBasic: number;
  dailyWage: number;
  company: number;
  nonLocals: number;
  total: number;
}

// Headcounts are whole people; a zero reads as '-' like the other registers
const fmt = (value: number): string => (value > 0 ? value.toLocaleString('en-IN') : '-');

export default function LabourBreakdownReport({ date }: LabourBreakdownReportProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('daily_workforce')
          .select('location_id, labour_kg_basic, labour_daily_wage, labour_company, labour_non_locals, location:locations(name)')
          .eq('work_date', date);
        if (error) throw error;

        // One row per location that actually has labour on this date. The total is
        // summed from the four sub-categories rather than read from labour_count,
        // so every row visibly adds up and matches the dashboard's labour card.
        const next = (data || [])
          .map((w: Record<string, unknown>) => {
            const kgBasic = Number(w.labour_kg_basic) || 0;
            const dailyWage = Number(w.labour_daily_wage) || 0;
            const company = Number(w.labour_company) || 0;
            const nonLocals = Number(w.labour_non_locals) || 0;
            return {
              key: (w.location_id as string) || 'unknown',
              label: (w.location as { name: string } | null)?.name || 'Unknown',
              kgBasic,
              dailyWage,
              company,
              nonLocals,
              total: kgBasic + dailyWage + company + nonLocals,
            };
          })
          .filter((r) => r.total > 0)
          .sort((a, b) => b.total - a.total);

        if (!cancelled) setRows(next);
      } catch (err) {
        console.error('Error fetching labour breakdown:', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          kgBasic: acc.kgBasic + r.kgBasic,
          dailyWage: acc.dailyWage + r.dailyWage,
          company: acc.company + r.company,
          nonLocals: acc.nonLocals + r.nonLocals,
          total: acc.total + r.total,
        }),
        { kgBasic: 0, dailyWage: 0, company: 0, nonLocals: 0, total: 0 }
      ),
    [rows]
  );

  const dateLabel = useMemo(() => {
    try {
      return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return date;
    }
  }, [date]);

  return (
    <div className="space-y-4">
      <div className="pt-2 pb-1">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Labour Breakdown
          <span className="ml-2 text-sm font-semibold text-gray-400">All locations</span>
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Labour headcount by sub-category on {dateLabel}.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-3 text-indigo-600 text-xl">
              👷
            </div>
            <p className="text-sm font-semibold text-gray-900">No labour recorded on this date</p>
            <p className="text-sm text-gray-500 mt-1">
              Nothing was entered for {dateLabel} on the Daily Entry page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Location
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">
                    KG Basic
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                    Daily Wage
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                    Company Labour
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right">
                    Non Locals
                  </th>
                  <th className="px-4 py-2 text-[10px] font-semibold text-indigo-600 uppercase tracking-wider whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">
                    Labour Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => (
                  <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{row.label}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium border-l border-gray-100 dark:border-gray-800">{fmt(row.kgBasic)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.dailyWage)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.company)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap text-right font-medium">{fmt(row.nonLocals)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap text-right border-l border-gray-100 dark:border-gray-800">{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                {/* .dark .text-indigo-900 in globals.css lightens this for dark mode */}
                <tr className="bg-indigo-50 dark:bg-indigo-900/30 border-t-2 border-indigo-100 dark:border-indigo-800">
                  <td className="px-4 py-3 text-sm font-bold text-indigo-900 whitespace-nowrap">TOTAL</td>
                  <td className="px-4 py-3 text-sm font-bold text-indigo-900 whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">{fmt(totals.kgBasic)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-indigo-900 whitespace-nowrap text-right">{fmt(totals.dailyWage)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-indigo-900 whitespace-nowrap text-right">{fmt(totals.company)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-indigo-900 whitespace-nowrap text-right">{fmt(totals.nonLocals)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-indigo-900 whitespace-nowrap text-right border-l border-gray-200 dark:border-gray-700">{fmt(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

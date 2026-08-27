'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/layout/PageHeader';
import { supabase } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { usePermissionAlert } from '@/components/ui/PermissionAlert';
import { useAuth } from '@/hooks/useAuth';
import { getDaysInMonth } from 'date-fns';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const YEARS = [2025, 2026, 2027];

const formatAmount = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const InlineInput = ({
  initialValue,
  onSave,
  id,
  rowIndex,
  colIndex,
  maxRow,
  maxCol,
  gridPrefix,
}: {
  initialValue: number;
  /** Resolves false when the save was refused — the cell then goes back to the stored figure. */
  onSave: (val: number) => Promise<boolean>;
  id: string;
  rowIndex: number;
  colIndex: number;
  maxRow: number;
  maxCol: number;
  gridPrefix: string;
}) => {
  const [val, setVal] = useState(initialValue === 0 ? '' : String(initialValue));

  useEffect(() => {
    setVal(initialValue === 0 ? '' : String(initialValue));
  }, [initialValue]);

  const handleBlur = async () => {
    const numVal = parseFloat(val);
    const finalVal = isNaN(numVal) || numVal < 0 ? 0 : numVal;
    if (finalVal !== initialValue) {
      // A refused save must not leave the typed figure sitting in the cell
      // looking stored — that is what made a lost entry so hard to notice.
      const saved = await onSave(finalVal);
      if (!saved) {
        setVal(initialValue === 0 ? '' : String(initialValue));
        return;
      }
    }
    setVal(finalVal === 0 ? '' : String(finalVal));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      let r = rowIndex;
      let c = colIndex;

      if (e.key === 'ArrowUp') {
        r = Math.max(0, r - 1);
      } else if (e.key === 'ArrowDown') {
        r = Math.min(maxRow - 1, r + 1);
      } else if (e.key === 'ArrowLeft') {
        if (e.currentTarget.selectionStart === 0) {
          c = Math.max(0, c - 1);
        } else {
          return;
        }
      } else if (e.key === 'ArrowRight') {
        if (e.currentTarget.selectionEnd === e.currentTarget.value.length) {
          c = Math.min(maxCol - 1, c + 1);
        } else {
          return;
        }
      }

      if (r !== rowIndex || c !== colIndex) {
        e.preventDefault();
        const nextId = `${gridPrefix}-${r}-${c}`;
        const el = document.getElementById(nextId);
        if (el) {
          (el as HTMLInputElement).focus();
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = Math.min(maxRow - 1, rowIndex + 1);
      if (r !== rowIndex) {
        const nextId = `${gridPrefix}-${r}-${colIndex}`;
        const el = document.getElementById(nextId);
        if (el) {
          (el as HTMLInputElement).focus();
        }
      } else {
        e.currentTarget.blur();
      }
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onFocus={(e) => e.target.select()}
      className="w-full h-[36px] text-center bg-transparent focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded text-sm font-bold text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-700 transition-colors m-0 p-0"
      placeholder="-"
    />
  );
};

interface BatchRecord {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface AmountRecord {
  id: string;
  work_date: string;
  batch_id: string;
  location_id: string;
  per_head_amount: number;
}

export default function LadiesPerHeadAmountPage() {
  const now = new Date();
  const router = useRouter();
  const { canView, canModify, loading: authLoading } = useAuth();
  const canSeePage = canView('ladies-per-head-amount');
  const { showToast } = useToast();
  const { requireEditDate, requireAdmin, reportError } = usePermissionAlert();
  const amountReadOnly = !canModify('ladies-per-head-amount');
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [year, setYear] = useState(now.getFullYear());
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [amounts, setAmounts] = useState<AmountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Add / manage batch modal state
  const [batchModal, setBatchModal] = useState<{ mode: 'add' } | { mode: 'edit'; batch: BatchRecord } | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);

  // Needs View on this page — everyone else goes back to the dashboard
  useEffect(() => {
    if (!authLoading && !canSeePage) {
      router.replace('/');
    }
  }, [authLoading, canSeePage, router]);

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

  // Fetch batches + amounts when location / month / year changes
  useEffect(() => {
    if (!locationId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: batchData, error: batchError } = await supabase
          .from('local_ladies_batches')
          .select('id, name, sort_order, is_active')
          .eq('location_id', locationId)
          .eq('is_active', true)
          .order('sort_order');

        if (batchError) throw batchError;
        setBatches(batchData || []);

        const startOfMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
        const numDays = getDaysInMonth(new Date(year, month - 1));
        const endOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;

        const { data: monthAmounts, error: amtError } = await supabase
          .from('local_ladies_per_head_amount')
          .select('id, work_date, batch_id, location_id, per_head_amount')
          .eq('location_id', locationId)
          .gte('work_date', startOfMonthStr)
          .lte('work_date', endOfMonthStr);

        if (amtError) throw amtError;
        setAmounts(monthAmounts || []);
      } catch (error) {
        console.error('Error fetching ladies per-head amounts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [locationId, month, year, refreshTrigger]);

  const daysInMonth = useMemo(() => {
    const numDays = getDaysInMonth(new Date(year, month - 1));
    return Array.from({ length: numDays }, (_, i) => {
      const dayNum = i + 1;
      const date = new Date(year, month - 1, dayNum);
      const isSunday = date.getDay() === 0;
      return {
        dayNum,
        isSunday,
        formattedDate: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
      };
    });
  }, [month, year]);

  const amountLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    amounts.forEach((a) => {
      lookup.set(`${a.batch_id}_${a.work_date}`, Number(a.per_head_amount) || 0);
    });
    return lookup;
  }, [amounts]);

  // Asks permission BEFORE writing, and reports the outcome so a refused cell
  // can be rolled back. RLS lets a blocked DELETE match zero rows without
  // raising anything, so a save that never happened used to leave the typed
  // figure on screen and be discovered only the next morning.
  const saveAmountCell = async (batchId: string, dateStr: string, val: number): Promise<boolean> => {
    if (!requireEditDate('ladies-per-head-amount', dateStr)) return false;
    try {
      const { error: deleteError } = await supabase
        .from('local_ladies_per_head_amount')
        .delete()
        .eq('work_date', dateStr)
        .eq('batch_id', batchId);
      if (deleteError) throw deleteError;

      if (val > 0) {
        const { error: insertError } = await supabase
          .from('local_ladies_per_head_amount')
          .insert({
            work_date: dateStr,
            batch_id: batchId,
            location_id: locationId,
            per_head_amount: val,
          });
        if (insertError) throw insertError;
      }

      setAmounts(prev => {
        const filtered = prev.filter(a => !(a.batch_id === batchId && a.work_date === dateStr));
        if (val > 0) {
            filtered.push({ id: Math.random().toString(), work_date: dateStr, batch_id: batchId, location_id: locationId, per_head_amount: val });
        }
        return filtered;
      });
      return true;
    } catch (error) {
      console.error('Error saving amount:', error);
      if (!reportError(error)) showToast('Failed to save amount', 'error');
      return false;
    }
  };

  // ── Batch add / rename / remove (shared roster with attendance) ────────────
  // Reference data: admins only (migration 027). Say so when the form is opened
  // rather than after a name has been typed.
  const openAddBatch = () => {
    if (!requireAdmin('The batch list')) return;
    setBatchName('');
    setBatchModal({ mode: 'add' });
  };
  const openEditBatch = (batch: BatchRecord) => {
    if (!requireAdmin('The batch list')) return;
    setBatchName(batch.name);
    setBatchModal({ mode: 'edit', batch });
  };

  const handleSaveBatch = async () => {
    if (!batchModal) return;
    const trimmed = batchName.trim();
    if (!trimmed) {
      showToast('Enter a batch name', 'error');
      return;
    }
    setBatchSaving(true);
    try {
      if (batchModal.mode === 'add') {
        const nextOrder = batches.reduce((max, b) => Math.max(max, b.sort_order), 0) + 1;
        const { error } = await supabase
          .from('local_ladies_batches')
          .insert({ name: trimmed, location_id: locationId, sort_order: nextOrder });
        if (error) throw error;
        showToast('Batch added', 'success');
      } else {
        const { error } = await supabase
          .from('local_ladies_batches')
          .update({ name: trimmed })
          .eq('id', batchModal.batch.id);
        if (error) throw error;
        showToast('Batch renamed', 'success');
      }
      setBatchModal(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Error saving batch:', error);
      if (!reportError(error)) showToast('Failed to save batch', 'error');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleRemoveBatch = async () => {
    if (!batchModal || batchModal.mode !== 'edit') return;
    setBatchSaving(true);
    try {
      const { error } = await supabase
        .from('local_ladies_batches')
        .update({ is_active: false })
        .eq('id', batchModal.batch.id);
      if (error) throw error;
      showToast('Batch removed', 'success');
      setBatchModal(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Error removing batch:', error);
      if (!reportError(error)) showToast('Failed to remove batch', 'error');
    } finally {
      setBatchSaving(false);
    }
  };

  const rows = useMemo(() => {
    return batches.map((batch, idx) => {
      let total = 0;
      const daily = daysInMonth.map((day) => {
        const amount = amountLookup.get(`${batch.id}_${day.formattedDate}`) ?? 0;
        total += amount;
        return { dayNum: day.dayNum, amount, formattedDate: day.formattedDate };
      });
      return { sNo: idx + 1, id: batch.id, name: batch.name, batch, daily, total };
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
    const grand = perDay.reduce((a, b) => a + b, 0);
    return { perDay, grand };
  }, [batches, daysInMonth, amountLookup]);

  const locationName = locations.find((l) => l.id === locationId)?.name ?? '';

  if (authLoading || !canSeePage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader title="Ladies Per Head Amount" />

      {/* Sibling toggle: Attendance ⇄ Per Head Amount */}
      <div className="px-4 mb-4">
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 text-xs font-semibold">
          <Link
            href="/local-ladies-attendance"
            className="px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Attendance
          </Link>
          <span className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 text-teal-600 dark:text-teal-400 shadow-sm">
            Per Head Amount
          </span>
        </div>
      </div>

      {/* Location / Month / Year Selectors */}
      <div className="px-4 mb-4 grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:border-teal-500 appearance-none shadow-sm"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:border-teal-500 appearance-none shadow-sm"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:border-teal-500 appearance-none shadow-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Warn before anything is typed; the popup on save is the backstop. */}
      {amountReadOnly && (
        <div className="px-4 mb-4">
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
            <span className="text-sm leading-5 flex-shrink-0" aria-hidden>
              🔒
            </span>
            <p className="text-[11px] font-bold text-amber-700 leading-4">
              View-only: you don&apos;t have Modify rights for Per Head Amount. Ask your admin before
              entering data — anything typed here will not be saved.
            </p>
          </div>
        </div>
      )}

      {/* Sheet title + Add Batch */}
      <div className="px-4 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide truncate">
          {locationName ? `${locationName} Ladies Per Head Amount` : 'Ladies Per Head Amount'}
        </h2>
        <button
          type="button"
          onClick={openAddBatch}
          disabled={!locationId}
          className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm shadow-teal-600/20 transition-colors flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Batch
        </button>
      </div>

      {/* Grid Container */}
      <div className="px-4">
        {loading ? (
          <LoadingSpinner />
        ) : batches.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center shadow-sm">
            <span className="text-4xl mb-2 block">💰</span>
            <p className="text-gray-500 dark:text-gray-400 text-sm">No batches yet. Tap “Add Batch” to start.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-md overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="reg-head bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 left-0 z-30 bg-gray-50 dark:bg-gray-800 min-w-[48px] text-center border-r border-gray-100 dark:border-gray-800">
                      S.No
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 left-[48px] z-30 bg-gray-50 dark:bg-gray-800 min-w-[160px] border-r border-gray-200 dark:border-gray-800">
                      Batch Name
                    </th>
                    {daysInMonth.map((day) => (
                      <th
                        key={day.dayNum}
                        className={`py-3 px-1 text-center font-bold min-w-[48px] border-r border-gray-100 dark:border-gray-800/30 sticky top-0 z-20 ${
                          day.isSunday
                            ? 'bg-emerald-600 dark:bg-emerald-800 text-white font-black'
                            : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
                        }`}
                      >
                        {day.dayNum}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-bold text-teal-600 dark:text-teal-400 text-center uppercase tracking-wider min-w-[80px] sticky-th-teal sticky top-0 z-20">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {rows.map((row, rowIdx) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-3 py-3 text-center text-gray-400 dark:text-gray-500 font-medium sticky left-0 z-10 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800">
                        {row.sNo}
                      </td>
                      <td
                        onClick={() => openEditBatch(row.batch)}
                        className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 sticky left-[48px] z-10 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.02)] truncate max-w-[160px] cursor-pointer hover:text-teal-600 dark:hover:text-teal-400"
                        title="Rename or remove batch"
                      >
                        {row.name}
                      </td>
                      {row.daily.map((cell, colIdx) => {
                        return (
                          <td
                            key={cell.dayNum}
                            className="p-0 border-r border-gray-100/50 dark:border-gray-800/20 min-w-[36px] relative"
                          >
                            <InlineInput
                              initialValue={cell.amount}
                              onSave={(val) => saveAmountCell(row.id, cell.formattedDate, val)}
                              id={`amt-${rowIdx}-${colIdx}`}
                              rowIndex={rowIdx}
                              colIndex={colIdx}
                              maxRow={rows.length}
                              maxCol={row.daily.length}
                              gridPrefix="amt"
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center font-bold text-teal-600 dark:text-teal-400 bg-teal-50/20 dark:bg-teal-950/10 text-sm">
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
                      <td
                        key={i}
                        className="py-3 px-1 text-center text-gray-700 dark:text-gray-200 border-r border-gray-200/60 dark:border-gray-700/40 text-[11px]"
                      >
                        {sum > 0 ? formatAmount(sum) : <span className="text-gray-300 dark:text-gray-600">0</span>}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center text-teal-700 dark:text-teal-300 bg-teal-100/60 dark:bg-teal-950/40 text-sm">
                      {formatAmount(columnTotals.grand)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add / Manage Batch Modal */}
      {batchModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setBatchModal(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 border-t border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-5" />

            <div className="mb-5">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                {batchModal.mode === 'add' ? 'Add Batch' : 'Edit Batch'}
              </h3>
              <p className="text-xs text-gray-550 dark:text-gray-400 mt-1">
                {batchModal.mode === 'add'
                  ? `New batch for ${locationName} (shared with the attendance sheet)`
                  : 'Rename this batch, or remove it from the sheet.'}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                Batch Name
              </label>
              <input
                type="text"
                autoFocus
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. A.VARSHINI"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              {batchModal.mode === 'edit' && (
                <button
                  type="button"
                  disabled={batchSaving}
                  onClick={handleRemoveBatch}
                  className="px-4 py-3 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold rounded-xl transition-colors min-h-[48px]"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => setBatchModal(null)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={batchSaving}
                onClick={handleSaveBatch}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/20 transition-all min-h-[48px] flex items-center justify-center gap-2"
              >
                {batchSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

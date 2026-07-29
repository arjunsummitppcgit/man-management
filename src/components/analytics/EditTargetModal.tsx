'use client';

import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase/client';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { fmt } from './shared';

/** `input[type=month]` needs a valid yyyy-MM — analytics data may not have loaded yet. */
const monthKey = (year: number, month: number) => {
  const now = new Date();
  const y = year || now.getFullYear();
  const m = month || now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
};

/**
 * Set the combined monthly VA target (monthly_targets row with location_id IS NULL).
 * The month is pickable so next month's target can be set without moving the
 * analytics date filter.
 */
export default function EditTargetModal({
  isOpen,
  onClose,
  defaultYear,
  defaultMonth,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  defaultYear: number;
  defaultMonth: number; // 1-12
  onSaved: () => void;
}) {
  const { showToast } = useToast();

  const [month, setMonth] = useState(() => monthKey(defaultYear, defaultMonth));
  const [targetKg, setTargetKg] = useState('');
  const [savedKg, setSavedKg] = useState<number | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reopening always starts from the month the section is showing
  useEffect(() => {
    if (isOpen && defaultYear && defaultMonth) setMonth(monthKey(defaultYear, defaultMonth));
  }, [isOpen, defaultYear, defaultMonth]);

  // Prefill with whatever is already saved for the chosen month
  useEffect(() => {
    if (!isOpen) return;
    const [year, monthNo] = month.split('-').map(Number);
    if (!year || !monthNo) return;

    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('monthly_targets')
        .select('id, target_kg')
        .eq('year', year)
        .eq('month', monthNo)
        .is('location_id', null)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error('Error loading monthly target:', error);
      setExistingId(data?.id ?? null);
      setSavedKg(data?.target_kg ?? null);
      setTargetKg(data?.target_kg != null ? String(data.target_kg) : '');
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, month]);

  const monthLabel = /^\d{4}-\d{2}$/.test(month)
    ? format(parseISO(`${month}-01`), 'MMMM yyyy')
    : '';

  const handleSave = async () => {
    const [year, monthNo] = month.split('-').map(Number);
    if (!year || !monthNo) {
      showToast('Pick a valid month', 'error');
      return;
    }
    const value = Number(targetKg);
    if (targetKg.trim() === '' || !Number.isFinite(value) || value < 0) {
      showToast('Enter a valid target in kg', 'error');
      return;
    }

    setSaving(true);
    try {
      // The combined target sits behind a partial unique index (location_id IS NULL),
      // which upsert can't infer — so update the existing row or insert a new one.
      const { error } = existingId
        ? await supabase.from('monthly_targets').update({ target_kg: value }).eq('id', existingId)
        : await supabase
            .from('monthly_targets')
            .insert({ year, month: monthNo, location_id: null, target_kg: value });
      if (error) throw error;

      showToast(`Target for ${monthLabel} set to ${fmt(value)} kg`, 'success');
      onSaved();
      onClose();
    } catch (error) {
      console.error('Error saving monthly target:', error);
      showToast('Could not save the target', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit VA Target">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Target month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 text-base bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <p className="mt-1.5 text-xs text-gray-400 font-medium">
            Pick a future month to plan ahead — the analytics date filter stays where it is.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Combined target (kg)
            <span className="text-rose-500 ml-0.5">*</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.001"
            value={targetKg}
            onChange={(e) => setTargetKg(e.target.value)}
            placeholder={loading ? 'Loading…' : 'e.g. 560000'}
            disabled={loading}
            className={`w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 text-base bg-white transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
              loading ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''
            }`}
          />
          {!loading && monthLabel && (
            <p className="mt-1.5 text-xs text-gray-400 font-medium">
              {savedKg != null
                ? `Currently saved for ${monthLabel}: ${fmt(savedKg)} kg`
                : `No target saved for ${monthLabel} yet`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleSave} loading={saving} disabled={loading}>
            Save Target
          </Button>
        </div>
      </div>
    </Modal>
  );
}

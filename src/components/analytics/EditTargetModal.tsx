'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase/client';
import type { Location } from '@/types';
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

/** '' means "no target" — a saved row for that location gets deleted on save. */
const asKg = (value: string) => (value.trim() === '' ? null : Number(value));

const isValidKg = (value: string) => {
  const kg = asKg(value);
  return kg === null || (Number.isFinite(kg) && kg >= 0);
};

interface SavedRow {
  id: string;
  target_kg: number;
}

/**
 * Set the monthly VA targets: the combined target (monthly_targets row with
 * location_id IS NULL) plus an optional per-location target for each location.
 * The month is pickable so next month's targets can be set without moving the
 * analytics date filter.
 */
export default function EditTargetModal({
  isOpen,
  onClose,
  locations,
  defaultYear,
  defaultMonth,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  locations: Location[];
  defaultYear: number;
  defaultMonth: number; // 1-12
  onSaved: () => void;
}) {
  const { showToast } = useToast();

  const [month, setMonth] = useState(() => monthKey(defaultYear, defaultMonth));
  const [targetKg, setTargetKg] = useState('');
  const [locationKg, setLocationKg] = useState<Record<string, string>>({});
  const [savedKg, setSavedKg] = useState<number | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [savedLocationRows, setSavedLocationRows] = useState<Record<string, SavedRow>>({});
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
        .select('id, location_id, target_kg')
        .eq('year', year)
        .eq('month', monthNo);
      if (cancelled) return;
      if (error) console.error('Error loading monthly targets:', error);

      const rows = data || [];
      const combined = rows.find((r) => r.location_id === null);
      const byLocation: Record<string, SavedRow> = {};
      for (const row of rows) {
        if (row.location_id) byLocation[row.location_id] = { id: row.id, target_kg: row.target_kg };
      }

      setExistingId(combined?.id ?? null);
      setSavedKg(combined?.target_kg ?? null);
      setTargetKg(combined?.target_kg != null ? String(combined.target_kg) : '');
      setSavedLocationRows(byLocation);
      setLocationKg(
        Object.fromEntries(locations.map((loc) => [loc.id, byLocation[loc.id] ? String(byLocation[loc.id].target_kg) : '']))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, month, locations]);

  const monthLabel = /^\d{4}-\d{2}$/.test(month)
    ? format(parseISO(`${month}-01`), 'MMMM yyyy')
    : '';

  // Live sum of the per-location entries, so the split can be checked against the combined figure
  const locationTotal = useMemo(
    () => Object.values(locationKg).reduce((sum, value) => sum + (asKg(value) || 0), 0),
    [locationKg]
  );
  const combinedValue = asKg(targetKg);
  const splitGap =
    combinedValue != null && combinedValue > 0 && locationTotal > 0 ? locationTotal - combinedValue : 0;

  const handleSave = async () => {
    const [year, monthNo] = month.split('-').map(Number);
    if (!year || !monthNo) {
      showToast('Pick a valid month', 'error');
      return;
    }
    if (targetKg.trim() === '' || !isValidKg(targetKg)) {
      showToast('Enter a valid combined target in kg', 'error');
      return;
    }
    const invalidLoc = locations.find((loc) => !isValidKg(locationKg[loc.id] ?? ''));
    if (invalidLoc) {
      showToast(`Enter a valid target for ${invalidLoc.name}`, 'error');
      return;
    }

    const value = Number(targetKg);
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

      // Per-location: insert/update what was entered, delete what was cleared
      const inserts: { year: number; month: number; location_id: string; target_kg: number }[] = [];
      const deletes: string[] = [];
      let locationsSet = 0;

      for (const loc of locations) {
        const kg = asKg(locationKg[loc.id] ?? '');
        const saved = savedLocationRows[loc.id];
        if (kg == null) {
          if (saved) deletes.push(saved.id);
          continue;
        }
        locationsSet += 1;
        if (saved) {
          if (saved.target_kg !== kg) {
            const { error: updateError } = await supabase
              .from('monthly_targets')
              .update({ target_kg: kg })
              .eq('id', saved.id);
            if (updateError) throw updateError;
          }
        } else {
          inserts.push({ year, month: monthNo, location_id: loc.id, target_kg: kg });
        }
      }

      if (inserts.length) {
        const { error: insertError } = await supabase.from('monthly_targets').insert(inserts);
        if (insertError) throw insertError;
      }
      if (deletes.length) {
        const { error: deleteError } = await supabase.from('monthly_targets').delete().in('id', deletes);
        if (deleteError) throw deleteError;
      }

      showToast(
        locationsSet > 0
          ? `${monthLabel}: ${fmt(value)} kg combined, ${locationsSet} location target${locationsSet === 1 ? '' : 's'} saved`
          : `Target for ${monthLabel} set to ${fmt(value)} kg`,
        'success'
      );
      onSaved();
      onClose();
    } catch (error) {
      console.error('Error saving monthly targets:', error);
      showToast(
        error instanceof Error && error.message ? `Could not save: ${error.message}` : 'Could not save the targets',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (disabled: boolean) =>
    `w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 text-base bg-white transition-all duration-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
      disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''
    }`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Monthly VA Target">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Target month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className={inputClass(false)}
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
            className={inputClass(loading)}
          />
          {!loading && monthLabel && (
            <p className="mt-1.5 text-xs text-gray-400 font-medium">
              {savedKg != null
                ? `Currently saved for ${monthLabel}: ${fmt(savedKg)} kg`
                : `No target saved for ${monthLabel} yet`}
            </p>
          )}
        </div>

        {/* Optional split of the month's target across locations */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-baseline justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Per-location targets (kg)</label>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">optional</span>
          </div>
          <p className="text-xs text-gray-400 font-medium mb-3">
            Leave blank to keep a location measured against the combined target. Clearing a saved value removes it.
          </p>

          <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-0.5">
            {locations.map((loc) => (
              <div key={loc.id} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 text-sm font-semibold text-gray-700 truncate" title={loc.name}>
                  {loc.name}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={locationKg[loc.id] ?? ''}
                  onChange={(e) => setLocationKg((prev) => ({ ...prev, [loc.id]: e.target.value }))}
                  placeholder={loading ? 'Loading…' : 'no target'}
                  disabled={loading}
                  className={inputClass(loading)}
                />
              </div>
            ))}
          </div>

          {!loading && locationTotal > 0 && (
            <p className="mt-2.5 text-xs font-bold text-gray-500">
              Locations total {fmt(locationTotal)} kg
              {splitGap !== 0 && (
                <span className={splitGap > 0 ? 'text-amber-600' : 'text-teal-700'}>
                  {' · '}
                  {splitGap > 0
                    ? `${fmt(splitGap)} kg over the combined target`
                    : `${fmt(-splitGap)} kg still unallocated`}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleSave} loading={saving} disabled={loading}>
            Save Targets
          </Button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useTargets } from '@/hooks/useTargets';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/lib/supabase/client';
import { getDaysRemainingInMonth, calculateDailyAverage } from '@/lib/utils';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface SetTargetModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (month: number, year: number, target: number, locationId: string | null) => void;
  locations: { id: string; name: string }[];
}

function SetTargetModal({ open, onClose, onSave, locations }: SetTargetModalProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [targetKg, setTargetKg] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-4">Set Monthly Target</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 appearance-none"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 appearance-none"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Location (Optional)</label>
            <select
              value={locationId || ''}
              onChange={(e) => setLocationId(e.target.value || null)}
              className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 appearance-none"
            >
              <option value="">All Locations (Combined)</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Target (kg)</label>
            <input
              type="number"
              step="any"
              value={targetKg}
              onChange={(e) => setTargetKg(e.target.value)}
              placeholder="Enter target in kg"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-semibold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors min-h-[48px]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // FIX: month is 0-indexed in the select; convert to 1-indexed for DB
                onSave(month + 1, year, parseFloat(targetKg) || 0, locationId);
                onClose();
              }}
              className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/25 transition-all min-h-[48px]"
            >
              Save Target
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ progress, size = 120, strokeWidth = 10 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const color = progress >= 80 ? '#10B981' : progress >= 50 ? '#F59E0B' : '#F43F5E';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke="#E5E7EB"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900">{progress}%</span>
        <span className="text-[10px] text-gray-400 font-medium">complete</span>
      </div>
    </div>
  );
}

interface HistoryRow {
  month: string;
  target: number;
  actual: number;
  pct: number;
}

export default function TargetsPage() {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  const { combinedTarget, locationTargets, loading: targetsLoading, fetchTargets, saveTarget } = useTargets();
  const { locations } = useLocations();

  // Processing data
  const [processingData, setProcessingData] = useState<{ headless_to_va: number; location_id: string }[]>([]);
  const [processingLoading, setProcessingLoading] = useState(false);

  // Monthly history
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch targets for current month on mount
  useEffect(() => {
    fetchTargets(currentYear, currentMonth);
  }, [fetchTargets, currentYear, currentMonth]);

  // Fetch monthly processing totals
  useEffect(() => {
    const fetchProcessing = async () => {
      setProcessingLoading(true);
      try {
        const monthDate = new Date(currentYear, currentMonth - 1, 1);
        const monthStart = format(startOfMonth(monthDate), 'yyyy-MM-dd');
        const monthEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd');

        const { data, error } = await supabase
          .from('daily_processing')
          .select('headless_to_va, location_id')
          .gte('work_date', monthStart)
          .lte('work_date', monthEnd);

        if (error) throw error;
        setProcessingData(data || []);
      } catch (error) {
        console.error('Error fetching processing data:', error);
        setProcessingData([]);
      } finally {
        setProcessingLoading(false);
      }
    };

    fetchProcessing();
  }, [currentYear, currentMonth]);

  // Fetch monthly history (last 6 months)
  useEffect(() => {
    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        const rows: HistoryRow[] = [];
        for (let i = 1; i <= 5; i++) {
          const d = new Date(currentYear, currentMonth - 1 - i, 1);
          const y = d.getFullYear();
          const m = d.getMonth() + 1; // 1-indexed
          const mStart = format(startOfMonth(d), 'yyyy-MM-dd');
          const mEnd = format(endOfMonth(d), 'yyyy-MM-dd');

          // Fetch target
          const { data: targetData } = await supabase
            .from('monthly_targets')
            .select('target_kg')
            .eq('year', y)
            .eq('month', m)
            .is('location_id', null)
            .maybeSingle();

          // Fetch processing sum
          const { data: procData } = await supabase
            .from('daily_processing')
            .select('headless_to_va')
            .gte('work_date', mStart)
            .lte('work_date', mEnd);

          const target = targetData?.target_kg || 0;
          const actual = procData?.reduce((sum: number, r: { headless_to_va: number }) => sum + (r.headless_to_va || 0), 0) || 0;
          const pct = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0;

          rows.push({
            month: `${MONTHS[m - 1].slice(0, 3)} ${y}`,
            target,
            actual: Math.round(actual * 1000) / 1000,
            pct,
          });
        }
        setHistory(rows);
      } catch (error) {
        console.error('Error fetching history:', error);
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [currentYear, currentMonth]);

  // Calculate KPIs
  const monthlyTarget = combinedTarget?.target_kg || 0;
  const monthlyProcessed = useMemo(
    () => processingData.reduce((sum, r) => sum + (r.headless_to_va || 0), 0),
    [processingData]
  );
  const daysRemaining = getDaysRemainingInMonth(currentYear, currentMonth);
  const dailyAverage = calculateDailyAverage(monthlyTarget, monthlyProcessed, daysRemaining);
  const progress = monthlyTarget > 0 ? Math.round((monthlyProcessed / monthlyTarget) * 100) : 0;

  // Location contributions: combine processing data with location targets
  const locationContributions = useMemo(() => {
    return locations.map((loc) => {
      const locProcessed = processingData
        .filter((p) => p.location_id === loc.id)
        .reduce((sum, p) => sum + (p.headless_to_va || 0), 0);
      const locTarget = locationTargets.find((t) => t.location_id === loc.id);
      return {
        id: loc.id,
        name: loc.name,
        processed: Math.round(locProcessed * 1000) / 1000,
        target: locTarget?.target_kg || 0,
      };
    });
  }, [locations, processingData, locationTargets]);

  const handleSaveTarget = async (month: number, year: number, target: number, locationId: string | null) => {
    try {
      // month is already 1-indexed from the modal fix
      await saveTarget(year, month, target, locationId);
      const locName = locationId ? locations.find((l) => l.id === locationId)?.name : 'All';
      showToast(
        `Target set: ${target} kg for ${MONTHS[month - 1]} ${year} (${locName})`,
        'success'
      );
    } catch {
      showToast('Failed to save target', 'error');
    }
  };

  if (targetsLoading && processingLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Targets" />

      {/* Current Month Card */}
      <div className="px-4 mb-4">
        <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white shadow-lg shadow-teal-600/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-teal-100 text-xs font-medium uppercase tracking-wide">Current Month</p>
              <p className="text-lg font-bold mt-0.5">
                {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </p>
            </div>
            <ProgressRing progress={progress} size={100} strokeWidth={8} />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-teal-200 text-[10px] font-medium uppercase">Target</p>
              <p className="text-xl font-bold">{monthlyTarget} kg</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-teal-200 text-[10px] font-medium uppercase">Processed</p>
              <p className="text-xl font-bold">{monthlyProcessed.toFixed(3)} kg</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-teal-200 text-[10px] font-medium uppercase">Days Left</p>
              <p className="text-xl font-bold">{daysRemaining}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-teal-200 text-[10px] font-medium uppercase">Avg Needed</p>
              <p className="text-xl font-bold">{dailyAverage.toFixed(3)} kg</p>
            </div>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 w-full py-3 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-xl transition-colors backdrop-blur-sm min-h-[48px]"
          >
            Set Target
          </button>
        </div>
      </div>

      {/* Location Contribution */}
      <div className="px-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Location Contributions</h3>
        <div className="space-y-2">
          {locationContributions.map((loc) => {
            const locProgress = loc.target > 0 ? Math.round((loc.processed / loc.target) * 100) : 0;
            return (
              <div key={loc.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                      <span className="text-xs font-bold text-teal-600">{loc.name.replace('PPC ', '')}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{loc.name}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">
                    {loc.processed.toFixed(3)}
                    <span className="text-gray-400 font-normal">/{loc.target} kg</span>
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      locProgress >= 80 ? 'bg-emerald-500' : locProgress >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(locProgress, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1 text-right font-medium">{locProgress}%</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Location Targets */}
      <div className="px-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Per-Location Targets</h3>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {locationContributions.map((loc, i) => (
            <div key={loc.id} className={`flex items-center justify-between px-4 py-3 ${i < locationContributions.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                  <span className="text-xs font-bold text-teal-600">{loc.name.replace('PPC ', '')}</span>
                </div>
                <span className="text-sm font-medium text-gray-700">{loc.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">{loc.target} kg</span>
                <button
                  onClick={() => setModalOpen(true)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly History */}
      <div className="px-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly History</h3>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-4 bg-gray-50 px-4 py-2.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase">Month</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase text-right">Target</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase text-right">Actual</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase text-right">%</span>
          </div>
          {historyLoading ? (
            <div className="py-6"><LoadingSpinner /></div>
          ) : history.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No history data</div>
          ) : (
            history.map((row) => (
              <div key={row.month} className="grid grid-cols-4 px-4 py-3 border-t border-gray-50 items-center">
                <span className="text-xs font-medium text-gray-700">{row.month}</span>
                <span className="text-xs text-gray-500 text-right">{row.target} kg</span>
                <span className="text-xs font-medium text-gray-900 text-right">{row.actual} kg</span>
                <span
                  className={`text-xs font-bold text-right ${
                    row.pct >= 100 ? 'text-emerald-600' : row.pct >= 90 ? 'text-amber-600' : 'text-rose-600'
                  }`}
                >
                  {row.pct}%
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Set Target Modal */}
      <SetTargetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveTarget}
        locations={locations}
      />
    </div>
  );
}

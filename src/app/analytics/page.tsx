'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format, subDays, startOfMonth, parseISO } from 'date-fns';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useLocations } from '@/hooks/useLocations';
import { useAnalytics } from '@/hooks/useAnalytics';
import { FilterBar, useIsDark, type PresetKey } from '@/components/analytics/shared';
import VaTargetSection from '@/components/analytics/VaTargetSection';
import ProcessingSection from '@/components/analytics/ProcessingSection';
import LabourSection from '@/components/analytics/LabourSection';
import PerHeadSection from '@/components/analytics/PerHeadSection';
import WorkforceSection from '@/components/analytics/WorkforceSection';
import ChemicalsSection from '@/components/analytics/ChemicalsSection';
import SanitizationSection from '@/components/analytics/SanitizationSection';

type SectionKey =
  | 'va-target'
  | 'hon-hl'
  | 'hl-va'
  | 'labour'
  | 'per-head'
  | 'workforce'
  | 'chemicals'
  | 'sanitization';

const SECTIONS: {
  key: SectionKey;
  label: string;
  desc: string;
  icon: string;
  gradient: string; // gradient for the icon tile
  glow: string; // active glow color
}[] = [
  { key: 'va-target', label: 'VA Target', desc: 'target vs completed', icon: '🎯', gradient: 'from-teal-500 to-emerald-500', glow: 'rgba(13,148,136,0.45)' },
  { key: 'hon-hl', label: 'HON → HL', desc: 'de-heading production', icon: '🔪', gradient: 'from-indigo-500 to-violet-600', glow: 'rgba(99,102,241,0.45)' },
  { key: 'hl-va', label: 'HL → VA', desc: 'value-add production', icon: '🍤', gradient: 'from-sky-500 to-blue-600', glow: 'rgba(14,165,233,0.45)' },
  { key: 'labour', label: 'Labour Attendance', desc: 'by type & location', icon: '👷', gradient: 'from-amber-400 to-orange-500', glow: 'rgba(245,158,11,0.45)' },
  { key: 'per-head', label: 'Labour Per Head', desc: 'amounts & productivity', icon: '💰', gradient: 'from-emerald-500 to-teal-600', glow: 'rgba(16,185,129,0.45)' },
  { key: 'workforce', label: 'Workforce', desc: 'full attendance picture', icon: '👥', gradient: 'from-purple-500 to-fuchsia-600', glow: 'rgba(168,85,247,0.45)' },
  { key: 'chemicals', label: 'Essentials & Chemicals', desc: 'usage by type & location', icon: '🧪', gradient: 'from-rose-500 to-pink-600', glow: 'rgba(244,63,94,0.45)' },
  { key: 'sanitization', label: 'Sanitization', desc: 'crates, nets & persons', icon: '🧼', gradient: 'from-cyan-500 to-sky-600', glow: 'rgba(6,182,212,0.45)' },
];

function rangeForPreset(preset: PresetKey): { from: string; to: string } {
  const today = new Date();
  const to = format(today, 'yyyy-MM-dd');
  switch (preset) {
    case 'today':
      return { from: to, to };
    case '7d':
      return { from: format(subDays(today, 6), 'yyyy-MM-dd'), to };
    case '30d':
      return { from: format(subDays(today, 29), 'yyyy-MM-dd'), to };
    case 'month':
    default:
      return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to };
  }
}

export default function AnalyticsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { locations } = useLocations();
  const { data, loading, fetchAnalytics } = useAnalytics();
  const isDark = useIsDark();

  const [active, setActive] = useState<SectionKey>('va-target');
  const [preset, setPreset] = useState<PresetKey>('month');
  const initial = rangeForPreset('month');
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);

  const handlePreset = (p: PresetKey) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = rangeForPreset(p);
      setFromDate(r.from);
      setToDate(r.to);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchAnalytics(fromDate, toDate);
  }, [isAdmin, fromDate, toDate, fetchAnalytics]);

  const rangeLabel = useMemo(() => {
    if (fromDate === toDate) return format(parseISO(toDate), 'd MMM yyyy');
    return `${format(parseISO(fromDate), 'd MMM')} – ${format(parseISO(toDate), 'd MMM yyyy')}`;
  }, [fromDate, toDate]);

  const activeSection = SECTIONS.find((s) => s.key === active)!;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-6 text-center">
        <span className="text-5xl">🔒</span>
        <h2 className="text-lg font-bold text-gray-900">Admins only</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          The Analytics page is restricted to admin accounts. Please sign in as an admin to view reports.
        </p>
      </div>
    );
  }

  const sectionProps = { data, locations, locationFilter, isDark, rangeLabel };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Analytics"
        subtitle="Reports across production, workforce & sanitization"
        rightAction={
          loading ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 rounded-full">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-[11px] font-bold text-teal-700">Loading…</span>
            </div>
          ) : (
            <span className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-[11px] font-bold">
              {rangeLabel}
            </span>
          )
        }
      />

      <div className="px-4 lg:flex lg:gap-6 lg:items-start">
        {/* ── Inner side panel (desktop) ── */}
        <aside className="ana-panel hidden lg:block w-[248px] flex-shrink-0 sticky top-6 rounded-3xl p-3 self-start">
          <p className="px-2.5 pt-1.5 pb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
            Reports
          </p>
          <nav className="space-y-1">
            {SECTIONS.map((s, idx) => {
              const isActive = active === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className={`ana-nav-item group w-full flex items-center gap-3 px-2.5 py-2.5 rounded-2xl text-left ${
                    isActive ? 'ana-nav-active' : ''
                  }`}
                  style={{ animationDelay: `${60 + idx * 45}ms`, ...(isActive ? { ['--glow' as string]: s.glow } : {}) }}
                >
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 bg-gradient-to-br ${s.gradient} shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 ${
                      isActive ? 'scale-105' : 'opacity-85'
                    }`}
                  >
                    {s.icon}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-bold truncate ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>
                      {s.label}
                    </span>
                    <span className="block text-[10px] font-medium text-gray-400 truncate">{s.desc}</span>
                  </span>
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0 shadow-[0_0_8px_rgba(20,184,166,0.9)]" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Mobile section picker: horizontal scroll pills ── */}
        <div className="lg:hidden -mx-4 px-4 mb-3 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 w-max pb-1">
            {SECTIONS.map((s) => {
              const isActive = active === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                    isActive
                      ? `bg-gradient-to-r ${s.gradient} text-white shadow-lg`
                      : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  <span>{s.icon}</span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 min-w-0 space-y-4 lg:space-y-5 pb-8">
          {/* Section title strip */}
          <div className="ana-swap flex items-center gap-3" key={`title-${active}`}>
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl bg-gradient-to-br ${activeSection.gradient} shadow-lg`}
            >
              {activeSection.icon}
            </span>
            <div>
              <h2 className="font-display text-lg lg:text-xl font-bold text-gray-900 tracking-tight leading-tight">
                {activeSection.label}
              </h2>
              <p className="text-[11px] lg:text-xs text-gray-400 font-medium capitalize">{activeSection.desc}</p>
            </div>
          </div>

          <FilterBar
            preset={preset}
            onPreset={handlePreset}
            fromDate={fromDate}
            toDate={toDate}
            onFromDate={setFromDate}
            onToDate={setToDate}
            locations={locations}
            locationFilter={locationFilter}
            onLocationFilter={setLocationFilter}
            showLocation={active !== 'va-target'}
          />

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <LoadingSpinner />
              <p className="text-xs text-gray-400 font-medium">Crunching the numbers…</p>
            </div>
          ) : (
            <div className="ana-swap" key={active}>
              {active === 'va-target' && <VaTargetSection data={data} locations={locations} isDark={isDark} />}
              {active === 'hon-hl' && <ProcessingSection mode="hon_hl" {...sectionProps} />}
              {active === 'hl-va' && <ProcessingSection mode="hl_va" {...sectionProps} />}
              {active === 'labour' && <LabourSection {...sectionProps} />}
              {active === 'per-head' && <PerHeadSection {...sectionProps} />}
              {active === 'workforce' && <WorkforceSection {...sectionProps} />}
              {active === 'chemicals' && <ChemicalsSection {...sectionProps} />}
              {active === 'sanitization' && <SanitizationSection {...sectionProps} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

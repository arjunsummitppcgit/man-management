'use client';

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';
import { differenceInCalendarDays, endOfMonth, getDaysInMonth, startOfDay } from 'date-fns';
import type { Location } from '@/types';
import type { AnalyticsData } from '@/hooks/useAnalytics';
import { ChipRow, ChartCard, EmptyChart, ExportButtons, chartTheme, fmt } from './shared';
import EditTargetModal from './EditTargetModal';

/** What a location's percentage is measured against, since per-location targets are optional. */
type PctBasis = 'own' | 'combined' | 'share';

interface LocationRow {
  name: string;
  Target: number;
  Achieved: number;
  TargetLabel: string;
  pct: number;
  pctLabel: string;
  pctBasis: PctBasis;
}

const PCT_BASIS_TEXT: Record<PctBasis, string> = {
  own: "of this location's target",
  combined: 'of the combined monthly target',
  share: "of this month's total VA",
};

function LocationTooltip({
  active,
  payload,
  tooltipStyle,
}: {
  active?: boolean;
  payload?: { payload: LocationRow }[];
  tooltipStyle?: React.CSSProperties;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="text-xs font-bold mb-1">{row.name}</p>
      {row.Target > 0 && <p className="text-[11px] font-semibold opacity-75">Target · {fmt(row.Target)} kg</p>}
      <p className="text-[11px] font-semibold opacity-75">Achieved · {fmt(row.Achieved)} kg</p>
      <p className="text-[11px] font-bold mt-1" style={{ color: '#14b8a6' }}>
        {row.pctLabel} {PCT_BASIS_TEXT[row.pctBasis]}
      </p>
    </div>
  );
}

/**
 * Achieved-bar label: kgs in the bar's teal, then the percentage in bigger amber type.
 * recharts clones this element per data point with `index` and `viewBox` — it does NOT
 * pass the row, so the data is looked up from `rows` by index.
 */
function AchievedBarLabel({
  rows,
  index,
  viewBox,
}: {
  rows?: LocationRow[];
  index?: number;
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}) {
  const row = rows && index != null ? rows[index] : undefined;
  if (!row || !viewBox || viewBox.x == null || viewBox.y == null) return null;

  const x = viewBox.x + (viewBox.width ?? 0) + 8;
  const y = viewBox.y + (viewBox.height ?? 0) / 2;

  // Both runs share one <text> so the tspan flows after the number without measuring it
  return (
    <text x={x} y={y} textAnchor="start" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#0d9488">
      {fmt(row.Achieved)}
      <tspan dx={7} fontSize={14} fontWeight={800} fill="#f59e0b">
        {row.pctLabel}
      </tspan>
    </text>
  );
}

function PaceTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-lg lg:text-xl font-bold mt-1 font-display tracking-tight truncate ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5 font-medium truncate">{sub}</p>
    </div>
  );
}

export default function VaTargetSection({
  data,
  locations,
  isDark,
  onRefresh,
}: {
  data: AnalyticsData;
  locations: Location[];
  isDark: boolean;
  onRefresh: () => void;
}) {
  const theme = chartTheme(isDark);
  const [editOpen, setEditOpen] = useState(false);

  const targetKg = data.combinedTarget?.target_kg || 0;
  const completedKg = useMemo(
    () => data.monthHlVa.reduce((s, r) => s + (r.va_kgs || 0), 0),
    [data.monthHlVa]
  );
  const pct = targetKg > 0 ? (completedKg / targetKg) * 100 : 0;
  const remaining = Math.max(0, targetKg - completedKg);

  const donutData = [
    { name: 'Completed', value: completedKg },
    { name: 'Remaining', value: remaining },
  ];

  // ── Pace: days left in the target month and the kgs/day needed to land it ──
  const pace = useMemo(() => {
    if (!data.monthYear || !data.monthNumber) return null;
    const monthStart = new Date(data.monthYear, data.monthNumber - 1, 1);
    const monthEnd = endOfMonth(monthStart);
    const daysInMonth = getDaysInMonth(monthStart);
    const today = startOfDay(new Date());

    // Today still counts as a working day; months not yet started get all their days.
    const daysLeft =
      today < monthStart ? daysInMonth : today > monthEnd ? 0 : differenceInCalendarDays(monthEnd, today) + 1;
    const daysElapsed = daysInMonth - daysLeft;

    const requiredPerDay = daysLeft > 0 ? remaining / daysLeft : 0;
    const currentPerDay = daysElapsed > 0 ? completedKg / daysElapsed : 0;

    return {
      daysInMonth,
      daysLeft,
      daysElapsed,
      requiredPerDay,
      currentPerDay,
      projected: completedKg + currentPerDay * daysLeft,
    };
  }, [data.monthYear, data.monthNumber, remaining, completedKg]);

  const status = useMemo(() => {
    if (!pace || targetKg <= 0) return null;
    if (remaining <= 0) {
      return {
        tone: 'bg-emerald-50 text-emerald-700',
        icon: '🎉',
        text:
          completedKg > targetKg
            ? `Target reached — ${fmt(completedKg - targetKg)} kg above the ${fmt(targetKg)} kg goal.`
            : `Target reached — exactly on the ${fmt(targetKg)} kg goal.`,
      };
    }
    if (pace.daysLeft === 0) {
      return {
        tone: 'bg-rose-50 text-rose-600',
        icon: '📕',
        text: `${data.monthLabel} is closed — finished ${pct.toFixed(1)}% of target, ${fmt(remaining)} kg short.`,
      };
    }
    if (pace.currentPerDay >= pace.requiredPerDay) {
      return {
        tone: 'bg-emerald-50 text-emerald-700',
        icon: '✅',
        text: `On track — holding ${fmt(pace.currentPerDay)} kg/day clears the target with ${fmt(
          pace.projected - targetKg
        )} kg to spare.`,
      };
    }
    return {
      tone: 'bg-amber-50 text-amber-700',
      icon: '⚠️',
      text: `Behind — needs ${fmt(pace.requiredPerDay - pace.currentPerDay)} kg/day above the current pace, else the month ends ${fmt(
        targetKg - pace.projected
      )} kg short.`,
    };
  }, [pace, targetKg, remaining, completedKg, pct, data.monthLabel]);

  // Per-location: monthly target vs achieved VA kgs, each with its own percentage
  const locationRows = useMemo<LocationRow[]>(() => {
    const achievedByLoc = new Map<string, number>();
    for (const row of data.monthHlVa) {
      if (!row.location_id) continue;
      achievedByLoc.set(row.location_id, (achievedByLoc.get(row.location_id) || 0) + (row.va_kgs || 0));
    }
    const targetByLoc = new Map<string, number>();
    for (const t of data.locationTargets) {
      if (t.location_id) targetByLoc.set(t.location_id, t.target_kg || 0);
    }
    const totalAchieved = Array.from(achievedByLoc.values()).reduce((s, v) => s + v, 0);

    return locations
      .map((loc) => {
        const Target = Number((targetByLoc.get(loc.id) || 0).toFixed(3));
        const Achieved = Number((achievedByLoc.get(loc.id) || 0).toFixed(3));

        // Prefer the location's own target; fall back to the combined target, then to share of total.
        const [basis, denominator]: [PctBasis, number] =
          Target > 0 ? ['own', Target] : targetKg > 0 ? ['combined', targetKg] : ['share', totalAchieved];
        const pctValue = denominator > 0 ? (Achieved / denominator) * 100 : 0;
        const pctLabel = denominator > 0 ? `${pctValue.toFixed(1)}%` : '—';

        return {
          name: loc.name,
          Target,
          Achieved,
          TargetLabel: Target > 0 ? fmt(Target) : '',
          pct: pctValue,
          pctLabel,
          pctBasis: basis,
        };
      })
      .filter((r) => r.Target > 0 || r.Achieved > 0);
  }, [data.monthHlVa, data.locationTargets, locations, targetKg]);

  const anyOwnTarget = locationRows.some((r) => r.Target > 0);
  const pctNote = anyOwnTarget
    ? '% is against each location’s own target'
    : targetKg > 0
      ? '% is each location’s share of the combined monthly target'
      : '% is each location’s share of the month’s total VA';

  const chips = [
    {
      label: `Target · ${data.monthLabel}`,
      value: `${fmt(targetKg)} kg`,
      sub: 'combined monthly VA target',
      accent: 'from-teal-500 to-emerald-500',
      icon: '🎯',
      action: (
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-700 hover:opacity-80 active:scale-95 transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-3 h-3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
            />
          </svg>
          {targetKg > 0 ? 'Edit' : 'Set'}
        </button>
      ),
    },
    {
      label: 'Completed',
      value: `${fmt(completedKg)} kg`,
      sub: 'VA kgs graded this month',
      accent: 'from-emerald-500 to-teal-600',
      icon: '✅',
    },
    {
      label: 'Remaining',
      value: `${fmt(remaining)} kg`,
      sub: pace && pace.daysLeft > 0 ? `over ${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} left` : 'still to process',
      accent: 'from-amber-400 to-orange-500',
      icon: '⏳',
    },
    {
      label: 'Achievement',
      value: `${pct.toFixed(1)}%`,
      sub: 'of the monthly target',
      accent: 'from-indigo-500 to-violet-600',
      icon: '🚀',
    },
  ];

  const exportHeaders = ['Location', 'Target (kg)', 'Achieved (kg)', 'Remaining (kg)', '%'];
  const exportRows = [
    ...locationRows.map((r) => [
      r.name,
      fmt(r.Target),
      fmt(r.Achieved),
      fmt(Math.max(0, r.Target - r.Achieved)),
      r.pctLabel,
    ]),
    ['Combined', fmt(targetKg), fmt(completedKg), fmt(remaining), `${pct.toFixed(1)}%`],
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ChipRow chips={chips} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        {/* Donut: target vs completed */}
        <ChartCard
          title="VA Target Progress"
          subtitle={`target vs completed · ${data.monthLabel}`}
          badge={data.monthLabel}
          className="xl:col-span-5"
        >
          {targetKg > 0 || completedKg > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="66%"
                    outerRadius="90%"
                    paddingAngle={2}
                    cornerRadius={8}
                    startAngle={90}
                    endAngle={-270}
                    animationDuration={1100}
                    animationEasing="ease-out"
                  >
                    <Cell fill="#0d9488" stroke="transparent" />
                    <Cell fill={isDark ? 'rgba(148,163,184,0.15)' : '#e8f0ef'} stroke="transparent" />
                  </Pie>
                  <Tooltip contentStyle={theme.tooltipStyle} formatter={(value) => [`${fmt(Number(value))} kg`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-3xl font-bold text-gray-900 font-display leading-none">{pct.toFixed(1)}%</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-1.5">
                  {fmt(completedKg)} / {fmt(targetKg)} kg
                </p>
              </div>
            </div>
          ) : (
            <EmptyChart message={`No target set for ${data.monthLabel} — use Set on the Target card to add one`} />
          )}
        </ChartCard>

        {/* Horizontal bars per location, each labelled with its percentage */}
        <ChartCard
          title="Target vs Achieved by Location"
          subtitle={`monthly VA kgs per location · ${pctNote}`}
          className="xl:col-span-7"
        >
          {locationRows.length > 0 ? (
            <>
              <div className="flex justify-end mb-2">
                <ExportButtons
                  title={`VA Target Report — ${data.monthLabel}`}
                  headers={exportHeaders}
                  rows={exportRows}
                  filename={`va-target-${data.monthLabel.replace(' ', '-').toLowerCase()}`}
                />
              </div>
              <ResponsiveContainer width="100%" height={Math.max(260, locationRows.length * 64)}>
                <BarChart data={locationRows} layout="vertical" margin={{ top: 4, right: 118, left: 8, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.gridStroke} />
                  <XAxis type="number" tick={theme.axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={theme.axisTick} tickLine={false} axisLine={false} width={68} />
                  <Tooltip content={<LocationTooltip tooltipStyle={theme.tooltipStyle} />} cursor={theme.cursorFill} />
                  <Bar dataKey="Target" fill={isDark ? 'rgba(148,163,184,0.28)' : '#dbe7e5'} radius={[0, 8, 8, 0]} maxBarSize={16} animationDuration={800}>
                    <LabelList dataKey="TargetLabel" position="right" style={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#7c8aa0' : '#94a3b8' }} />
                  </Bar>
                  <Bar dataKey="Achieved" fill="#0d9488" radius={[0, 8, 8, 0]} maxBarSize={16} animationDuration={1100}>
                    <LabelList content={<AchievedBarLabel rows={locationRows} />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <EmptyChart message="No per-location targets or VA entries this month" />
          )}
        </ChartCard>
      </div>

      {/* Pace: days left and the daily run-rate needed to hit the target */}
      <ChartCard title="Pace to Target" subtitle={`what's left to do in ${data.monthLabel}`}>
        {pace && targetKg > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <PaceTile
                label="Days Left"
                value={`${pace.daysLeft}`}
                sub={`of ${pace.daysInMonth} in ${data.monthLabel}`}
                valueClass="text-indigo-700"
              />
              <PaceTile
                label="Need Per Day"
                value={pace.daysLeft > 0 ? `${fmt(pace.requiredPerDay)} kg` : '—'}
                sub={pace.daysLeft > 0 ? `to clear ${fmt(remaining)} kg` : 'month is over'}
                valueClass="text-amber-700"
              />
              <PaceTile
                label="Current Pace"
                value={`${fmt(pace.currentPerDay)} kg`}
                sub={`avg/day over ${pace.daysElapsed} day${pace.daysElapsed === 1 ? '' : 's'}`}
                valueClass="text-teal-700"
              />
              <PaceTile
                label="Projected"
                value={`${fmt(pace.projected)} kg`}
                sub="month-end at current pace"
                valueClass="text-emerald-700"
              />
            </div>
            {status && (
              <div className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 ${status.tone}`}>
                <span className="text-sm leading-5 flex-shrink-0" aria-hidden>{status.icon}</span>
                <p className="text-[11px] lg:text-xs font-bold leading-5">{status.text}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 py-8 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-400 font-medium">
              Set a target for {data.monthLabel || 'this month'} to see the daily pace needed
            </p>
            <button
              onClick={() => setEditOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-50 text-teal-700 hover:opacity-80 active:scale-95 transition-all"
            >
              🎯 Set Monthly Target
            </button>
          </div>
        )}
      </ChartCard>

      <EditTargetModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        locations={locations}
        defaultYear={data.monthYear}
        defaultMonth={data.monthNumber}
        onSaved={onRefresh}
      />
    </div>
  );
}

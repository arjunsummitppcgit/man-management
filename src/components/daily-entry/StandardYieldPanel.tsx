'use client';

import React, { useState } from 'react';
import { YIELD_CHART, type YieldChartEntry } from '@/lib/yieldChart';
import { HLVA_YIELD_CHART, HLVA_COLUMNS, type HlVaYieldEntry } from '@/lib/hlVa';

/**
 * A band's editable cells, held as strings while they are being typed — a
 * half-typed "6" on the way to "68.5" must not be read as the standard.
 */
type Draft = Record<string, Record<string, string>>;

const pct = (n: number) => n.toFixed(2);

/**
 * One column per variety since migration 033, so the HL→VA grid no longer fits
 * a phone. The count label is pinned at a fixed width and the variety columns
 * scroll under it rather than crushing to an unreadable two characters each.
 *
 * Written as a style object rather than a `grid-cols-[...]` class because the
 * column count comes from HLVA_COLUMNS. Tailwind generates arbitrary values by
 * scanning source text, so a class built by interpolation is never emitted at
 * all — the grid would silently collapse to one column.
 */
const HLVA_LABEL_WIDTH = 64;
const HLVA_COL_WIDTH = 62;
const HLVA_GRID: React.CSSProperties = {
  gridTemplateColumns: `${HLVA_LABEL_WIDTH}px repeat(${HLVA_COLUMNS.length}, minmax(${HLVA_COL_WIDTH}px, 1fr))`,
};
const HLVA_MIN_WIDTH = HLVA_LABEL_WIDTH + HLVA_COLUMNS.length * HLVA_COL_WIDTH;

/** A band's cells, keyed the way the chart itself is keyed. */
const draftRow = (entry: HlVaYieldEntry): Record<string, string> =>
  Object.fromEntries(HLVA_COLUMNS.map((c) => [c.key, pct(entry[c.key])]));

/** Blank, non-numeric and out-of-range all mean "don't move this one". */
function cleaned(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}

interface CommonProps {
  /** Admins get the Edit button; everyone else gets the read-only view. */
  canEdit: boolean;
  /** True once an admin has moved something off the shipped values. */
  edited: boolean;
  /** Announce the outcome through the page's toast. */
  onSaved?: (message: string) => void;
}

interface HonHlProps extends CommonProps {
  mode: 'hon_hl';
  chart: YieldChartEntry[];
  onSave: (chart: YieldChartEntry[]) => Promise<void>;
}

interface HlVaProps extends CommonProps {
  mode: 'hl_va';
  chart: HlVaYieldEntry[];
  onSave: (chart: HlVaYieldEntry[]) => Promise<void>;
}

type StandardYieldPanelProps = HonHlProps | HlVaProps;

/**
 * The standard yield chart, on the tab that is measured against it.
 *
 * Read-only for everyone by default. Admins get an Edit button that turns the
 * percentages into inputs — the count bands stay fixed, because the registers
 * stamp their `count_range` / `grade` labels from them and a band whose bounds
 * moved would strand those. Saving affects new entries only; rows already
 * saved carry the standard they were measured against (migration 032).
 */
export default function StandardYieldPanel(props: StandardYieldPanelProps) {
  const { mode, canEdit, edited, onSaved } = props;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});

  const startEditing = () => {
    const next: Draft = {};
    if (props.mode === 'hon_hl') {
      props.chart.forEach((e) => {
        next[e.label] = { standardYield: pct(e.standardYield) };
      });
    } else {
      props.chart.forEach((e) => {
        next[e.label] = draftRow(e);
      });
    }
    setDraft(next);
    setError(null);
    setEditing(true);
    setOpen(true);
  };

  const resetToShipped = () => {
    const next: Draft = {};
    if (props.mode === 'hon_hl') {
      YIELD_CHART.forEach((e) => {
        next[e.label] = { standardYield: pct(e.standardYield) };
      });
    } else {
      HLVA_YIELD_CHART.forEach((e) => {
        next[e.label] = draftRow(e);
      });
    }
    setDraft(next);
  };

  const setCell = (label: string, key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [label]: { ...prev[label], [key]: value } }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (props.mode === 'hon_hl') {
        await props.onSave(
          props.chart.map((e) => ({
            ...e,
            standardYield: cleaned(draft[e.label]?.standardYield ?? '', e.standardYield),
          }))
        );
      } else {
        await props.onSave(
          props.chart.map((e) => {
            const next = { ...e };
            HLVA_COLUMNS.forEach(({ key }) => {
              next[key] = cleaned(draft[e.label]?.[key] ?? '', e[key]);
            });
            return next;
          })
        );
      }
      setEditing(false);
      onSaved?.('Standard yield chart updated. It applies to new entries only.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the chart. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const gridCols = mode === 'hon_hl' ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          aria-expanded={open}
        >
          <span className="text-lg">📊</span>
          <span className="text-sm font-semibold text-gray-700">
            {mode === 'hon_hl' ? 'Standard Yield Chart' : 'HL to VA Standard Yield Chart'}
          </span>
          {edited && (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wide">
              Customised
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-teal-50 text-teal-600 hover:bg-teal-100 active:scale-95 transition-colors shrink-0"
          >
            Edit
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {editing && (
            <p className="text-[11px] text-gray-500 mb-2.5">
              The count bands are fixed — entries are labelled from them. Editing a percentage
              changes what <strong>new</strong> entries are measured against; days already saved
              keep the standard they were entered under.
            </p>
          )}

          <div className={mode === 'hl_va' ? 'overflow-x-auto -mx-1 px-1' : undefined}>
          <div style={mode === 'hl_va' ? { minWidth: HLVA_MIN_WIDTH } : undefined}>

          {/* Column key, only where there is more than one */}
          {mode === 'hl_va' && (
            <div className="grid gap-1.5 mb-1.5 px-1" style={HLVA_GRID}>
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Count</span>
              {HLVA_COLUMNS.map((c) => (
                <span
                  key={c.key}
                  title={c.hint}
                  className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider text-right"
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}

          <div className={`grid ${gridCols} gap-1.5`}>
            {props.mode === 'hon_hl'
              ? props.chart.map((entry) => (
                  <div
                    key={entry.label}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2"
                  >
                    <span className="text-xs font-medium text-gray-600">{entry.label}</span>
                    {editing ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={draft[entry.label]?.standardYield ?? ''}
                        onChange={(e) => setCell(entry.label, 'standardYield', e.target.value)}
                        aria-label={`Standard yield for ${entry.label}`}
                        className="w-20 px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-bold text-teal-700 text-right focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                      />
                    ) : (
                      <span className="text-xs font-bold text-teal-700">
                        {entry.standardYield.toFixed(2)}%
                      </span>
                    )}
                  </div>
                ))
              : props.chart.map((entry) => (
                  <div
                    key={entry.label}
                    className="grid gap-1.5 items-center bg-gray-50 rounded-lg px-3 py-2"
                    style={HLVA_GRID}
                  >
                    <span className="text-xs font-medium text-gray-600">{entry.label}</span>
                    {HLVA_COLUMNS.map((c) =>
                      editing ? (
                        <input
                          key={c.key}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={draft[entry.label]?.[c.key] ?? ''}
                          onChange={(e) => setCell(entry.label, c.key, e.target.value)}
                          aria-label={`${c.label} standard yield for ${entry.label}`}
                          className="w-full px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-bold text-teal-700 text-right focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
                        />
                      ) : (
                        <span key={c.key} className="text-xs font-bold text-teal-700 text-right">
                          {entry[c.key].toFixed(2)}%
                        </span>
                      )
                    )}
                  </div>
                ))}
          </div>

          </div>
          </div>

          {error && <p className="mt-2.5 text-[11px] font-bold text-rose-600">{error}</p>}

          {editing && (
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={resetToShipped}
                disabled={saving}
                className="px-3 py-2 rounded-xl text-[11px] font-bold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-40 mr-auto"
              >
                Reset to defaults
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold shadow-sm shadow-teal-600/25 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save chart'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const POPOVER_WIDTH = 224;

/**
 * A dropdown that takes more than one answer, shaped like the single-select
 * `Picker` beside it so the filter bar still reads as one row of controls.
 *
 * Counts are the one filter people compare across rather than drill into — "how
 * did 26/30 and 31/40 do this week" is a normal question and a single-select
 * can't ask it. An empty selection means every count, the same as the old
 * "All counts" option did.
 *
 * The panel is portalled to <body> with fixed coordinates: the filter bar sits
 * inside the card's overflow-x-auto scroller, which would otherwise clip a
 * list this tall.
 */
export default function MultiPicker({
  id,
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  /** Shown on the trigger when nothing is picked, and on the reset row. */
  allLabel: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const showSearch = options.length > 6;

  const closeMenu = () => {
    setOpen(false);
    setSearch('');
  };

  const openMenu = () => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8));
      setCoords({ top: r.bottom + 6, left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu();
    };
    // Any scroll outside the panel moves the trigger out from under it.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closeMenu);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeMenu);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const term = search.trim().toLowerCase();
  const visible = term
    ? options.filter((o) => o.label.toLowerCase().includes(term))
    : options;

  const toggle = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  };

  /** One pick reads better as itself than as "1 selected". */
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label || selected[0] || '—'
        : `${selected.length} selected`;

  return (
    <div className="flex flex-col gap-1">
      <span
        id={`${id}-label`}
        className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
      >
        {label}
      </span>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        aria-labelledby={`${id}-label`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 w-[11rem] px-2.5 py-1.5 rounded-lg border bg-white dark:bg-gray-800 text-xs font-semibold text-left ${
          selected.length > 0
            ? 'border-teal-400 dark:border-teal-500 text-teal-700 dark:text-teal-300'
            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
        }`}
      >
        <span className="truncate flex-1">{summary}</span>
        {selected.length > 1 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-teal-600 text-white text-[9px] font-bold leading-none flex-shrink-0">
            {selected.length}
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3.5 h-3.5 flex-shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && coords &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
            className="fixed z-[100] rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => onChange(options.map((o) => o.value))}
                disabled={selected.length === options.length}
                className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={selected.length === 0}
                className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40"
              >
                {allLabel}
              </button>
            </div>

            {showSearch && (
              <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  autoFocus
                  className="w-full px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            )}

            <div className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable>
              {visible.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400 text-center">No matches</p>
              ) : (
                visible.map((o) => {
                  const isSelected = selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(o.value)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-teal-50 dark:bg-teal-500/15 hover:bg-teal-100 dark:hover:bg-teal-500/25'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? 'bg-teal-600 border-teal-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-3 h-3 text-white"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      <span
                        className={`truncate font-semibold ${
                          isSelected
                            ? 'text-teal-700 dark:text-teal-300'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {o.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

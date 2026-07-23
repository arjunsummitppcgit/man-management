'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ColumnFilterProps {
  /** Column title shown in the header (e.g. "Batch ID") */
  label: string;
  /** All distinct values available for this column */
  options: string[];
  /** Currently selected values (empty = no filter / show all) */
  selected: string[];
  onChange: (values: string[]) => void;
  /** Horizontal anchor of the popover relative to the header cell */
  align?: 'left' | 'right';
}

const POPOVER_WIDTH = 224; // matches w-56

/**
 * Compact filter control that lives inside a table column header.
 * Renders the column label plus a funnel button; clicking opens a
 * multi-select checkbox popover. The popover is portalled to <body> with
 * fixed positioning so it is never clipped by the table's horizontal
 * scroll container (overflow-x-auto).
 */
export default function ColumnFilter({
  label,
  options,
  selected,
  onChange,
  align = 'left',
}: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const active = selected.length > 0;
  const showSearch = options.length > 6;

  const positionPopover = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = align === 'right' ? r.right - POPOVER_WIDTH : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - POPOVER_WIDTH - 8));
    setCoords({ top: r.bottom + 6, left });
  };

  const openMenu = () => {
    positionPopover();
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setSearch('');
  };

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu();
    };
    // Any scroll outside the popover invalidates the anchor position — close.
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
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

  const filteredOptions = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={`inline-flex items-center gap-1 rounded-md transition-colors ${
          active
            ? 'text-indigo-600'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
      >
        <span className="uppercase tracking-wider">{label}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`h-3 w-3 shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`}
        >
          <path
            fillRule="evenodd"
            d="M3.792 2.938A49.069 49.069 0 0112 2.25c2.797 0 5.54.236 8.209.688a1.857 1.857 0 011.541 1.836v1.044a3 3 0 01-.879 2.121l-6.182 6.182a1.5 1.5 0 00-.439 1.061v2.927a3 3 0 01-1.658 2.684l-1.757.878A.75.75 0 019 20.876v-5.795a1.5 1.5 0 00-.44-1.06L2.38 7.838A3 3 0 011.5 5.717V4.774c0-.897.64-1.683 1.542-1.836z"
            clipRule="evenodd"
          />
        </svg>
        {active && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-bold leading-none">
            {selected.length}
          </span>
        )}
      </button>

      {open && coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
            className="fixed z-[100] rounded-xl bg-white shadow-xl border border-gray-100 overflow-hidden"
          >
            {/* Actions */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => onChange(options.slice())}
                className="text-[11px] font-semibold text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline"
                disabled={selected.length === options.length}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40"
                disabled={selected.length === 0}
              >
                Clear
              </button>
            </div>

            {/* Search */}
            {showSearch && (
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  autoFocus
                  className="w-full px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
                />
              </div>
            )}

            {/* Options */}
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400 text-center normal-case tracking-normal">
                  No matches
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = selected.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggle(option)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm normal-case tracking-normal transition-colors hover:bg-gray-50 ${
                        isSelected ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                          isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3 w-3 text-white"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      <span className={isSelected ? 'text-indigo-700 font-medium' : 'text-gray-700'}>
                        {option}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

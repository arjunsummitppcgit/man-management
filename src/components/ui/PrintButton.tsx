'use client';

import React from 'react';

/**
 * Blocks a report page can be printed in isolation carry
 * `data-print-section="<key>"`; see PrintSection in components/reports.
 */
export const PRINT_SECTION_ATTR = 'data-print-section';

export interface PrintOptions {
  /**
   * Keys of the `data-print-section` blocks to keep. Anything tagged with that
   * attribute and *not* listed here is hidden for the duration of the print
   * run. Omit to print the page whole (what Ctrl+P does anyway).
   */
  sections?: string[];
  /** Start every kept section on a fresh sheet — the first one stays put. */
  pageBreaks?: boolean;
}

/**
 * Print the page — the browser's print dialog offers "Save as PDF".
 *
 * The app renders dark by default, which prints as a wall of ink, so the theme
 * is flipped to light for the duration of the dialog and restored afterwards.
 * Section hiding works the same way: classes go on for the run and come back
 * off, so nothing about the page survives the print. Print layout itself lives
 * in the `@media print` block in globals.css.
 */
export function printPage(options?: PrintOptions): void {
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  // Only classes this run actually added, so restore never strips a class the
  // markup already carried.
  const added: Array<[HTMLElement, string]> = [];
  let restored = false;

  const addForPrint = (el: HTMLElement, cls: string) => {
    if (el.classList.contains(cls)) return;
    el.classList.add(cls);
    added.push([el, cls]);
  };

  const restore = () => {
    if (restored) return;
    restored = true;
    added.forEach(([el, cls]) => el.classList.remove(cls));
    if (wasDark) root.classList.add('dark');
    window.removeEventListener('afterprint', restore);
  };

  if (options?.sections) {
    const keep = new Set(options.sections);
    let kept = 0;
    document.querySelectorAll<HTMLElement>(`[${PRINT_SECTION_ATTR}]`).forEach((el) => {
      if (!keep.has(el.dataset.printSection ?? '')) {
        addForPrint(el, 'print-exclude');
        return;
      }
      kept += 1;
      // Sections are broken apart in page order, so the break lands between
      // two *kept* sections rather than after something that isn't printing.
      if (options.pageBreaks && kept > 1) addForPrint(el, 'print-page-break');
    });
  }

  if (wasDark) root.classList.remove('dark');
  window.addEventListener('afterprint', restore);
  window.print();
  // afterprint doesn't fire everywhere; window.print() blocks until the dialog closes
  setTimeout(restore, 1000);
}

interface PrintButtonProps {
  label?: string;
  /** Extra classes for placement — the visual style stays consistent. */
  className?: string;
  /** Defaults to printing the page whole; pass a handler to open a chooser first. */
  onClick?: () => void;
}

export default function PrintButton({
  label = 'Print / Save as PDF',
  className = '',
  onClick,
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick ?? (() => printPage())}
      className={`print:hidden px-4 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold rounded-xl shadow-sm shadow-teal-600/25 transition-colors flex items-center justify-center gap-1.5 ${className}`}
    >
      🖨️ {label}
    </button>
  );
}

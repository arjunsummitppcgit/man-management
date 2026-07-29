'use client';

import React from 'react';

/**
 * Print the page as it stands — the browser's print dialog offers "Save as PDF".
 *
 * The app renders dark by default, which prints as a wall of ink, so the theme
 * is flipped to light for the duration of the dialog and restored afterwards.
 * Print layout itself lives in the `@media print` block in globals.css.
 */
export function printPage(): void {
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  let restored = false;

  const restore = () => {
    if (restored) return;
    restored = true;
    if (wasDark) root.classList.add('dark');
    window.removeEventListener('afterprint', restore);
  };

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
}

export default function PrintButton({
  label = 'Print / Save as PDF',
  className = '',
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={printPage}
      className={`print:hidden px-4 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold rounded-xl shadow-sm shadow-teal-600/25 transition-colors flex items-center justify-center gap-1.5 ${className}`}
    >
      🖨️ {label}
    </button>
  );
}

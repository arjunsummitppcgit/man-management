'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { printPage } from '@/components/ui/PrintButton';

/**
 * Every report the Daily Report page prints, in page order. This list is the
 * single source of truth: the page tags its blocks with these keys through
 * <PrintSection>, and the chooser below builds a checkbox per entry. Adding a
 * report to the page means adding it here — TypeScript will reject a
 * <PrintSection> whose id isn't on the list.
 */
export const DAILY_REPORT_SECTIONS = [
  { key: 'location-summary', label: 'Location-wise Summary', hint: 'HON→HL & HL→VA totals per location' },
  { key: 'plan-vs-actual', label: 'Plan vs Actual', hint: "The day's plan against what the registers recorded" },
  { key: 'hon-hl', label: 'HON to HL yields', hint: 'Batch-wise yield against the standard' },
  { key: 'company-ladies', label: 'Company Ladies', hint: 'Per-head amount, difference and P&L' },
  { key: 'hl-va', label: 'HL to VA', hint: 'Batch-wise VA yield against the standard' },
  { key: 'grade-va', label: 'Grade Vs VA Report', hint: 'VA quantity by grade and variety' },
  { key: 'grading-data', label: "All PPC's Grading Data", hint: 'Machine running hours and output' },
  { key: 'labour', label: 'Labour Breakdown', hint: 'Headcount by sub-category per location' },
] as const;

export type DailyReportSectionKey = (typeof DAILY_REPORT_SECTIONS)[number]['key'];

/**
 * Wraps one printable report. The data attribute is what printPage() looks for
 * when only part of the page was ticked; on screen this is a plain container.
 */
export function PrintSection({
  id,
  className = '',
  children,
}: {
  id: DailyReportSectionKey;
  className?: string;
  children: React.ReactNode;
}) {
  // Keep this attribute name in step with PRINT_SECTION_ATTR, which is what
  // printPage() queries for.
  return (
    <section data-print-section={id} className={className}>
      {children}
    </section>
  );
}

// ─── Remembering the last choice ───────────────────────────────────────────
// Stored as the *excluded* keys rather than the included ones: a report added
// to the page later is absent from that list, so it starts ticked instead of
// silently missing from everyone's saved selection. Unknown keys (a report that
// was removed) are dropped on read.
const STORAGE_KEY = 'ppc.daily-report.print-prefs';

interface PrintPrefs {
  excluded: string[];
  pageBreaks: boolean;
}

const DEFAULT_PREFS: PrintPrefs = { excluded: [], pageBreaks: false };

const loadPrefs = (): PrintPrefs => {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PrintPrefs>;
    const known = new Set<string>(DAILY_REPORT_SECTIONS.map((s) => s.key));
    return {
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded.filter((k) => known.has(k)) : [],
      pageBreaks: parsed.pageBreaks === true,
    };
  } catch {
    // Corrupt or unavailable storage (private mode) must never block printing
    return DEFAULT_PREFS;
  }
};

const savePrefs = (prefs: PrintPrefs): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full or blocked — the choice just isn't remembered */
  }
};

const CheckBox = ({ checked }: { checked: boolean }) => (
  <span
    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
      checked ? 'bg-teal-600 border-teal-600' : 'border-gray-300 dark:border-gray-600'
    }`}
  >
    {checked && (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    )}
  </span>
);

interface PrintReportsModalProps {
  /** Mounted only while open, so the saved choice is read fresh each time. */
  onClose: () => void;
  /** Shown in the dialog header so it's obvious which day is being printed. */
  dateLabel: string;
}

/**
 * Report picker for the Daily Report page. Tick the reports wanted, hit print,
 * and only those reach the paper (or the PDF) — everything else is hidden for
 * the length of the print run and restored straight after.
 */
export default function PrintReportsModal({ onClose, dateLabel }: PrintReportsModalProps) {
  const [saved] = useState(loadPrefs);
  const [selected, setSelected] = useState<string[]>(() =>
    DAILY_REPORT_SECTIONS.filter((s) => !saved.excluded.includes(s.key)).map((s) => s.key)
  );
  const [pageBreaks, setPageBreaks] = useState(saved.pageBreaks);

  const allSelected = selected.length === DAILY_REPORT_SECTIONS.length;
  const noneSelected = selected.length === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : DAILY_REPORT_SECTIONS.map((s) => s.key));
  };

  const handlePrint = () => {
    if (noneSelected) return;
    savePrefs({
      excluded: DAILY_REPORT_SECTIONS.filter((s) => !selected.includes(s.key)).map((s) => s.key),
      pageBreaks,
    });
    // Print before closing: the state update hasn't hit the DOM yet, and the
    // dialog is print:hidden anyway, so it never lands on the page.
    printPage({ sections: selected, pageBreaks });
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="print:hidden fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Choose reports to print"
    >
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up flex flex-col max-h-[90vh] sm:max-h-[85vh]">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Print Daily Report</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose the reports to print or save as PDF — {dateLabel}
          </p>
        </div>

        {/* All / count */}
        <div className="px-5 pt-3">
          <button
            type="button"
            onClick={toggleAll}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <CheckBox checked={allSelected} />
            <span className="flex-1 text-sm font-bold text-gray-900">All reports</span>
            <span className="text-[11px] font-semibold text-gray-500">
              {selected.length} of {DAILY_REPORT_SECTIONS.length} selected
            </span>
          </button>
        </div>

        {/* One row per report */}
        <div className="px-5 py-2 overflow-y-auto flex-1">
          {DAILY_REPORT_SECTIONS.map((section) => {
            const checked = selected.includes(section.key);
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => toggle(section.key)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  checked ? 'bg-teal-50 hover:bg-teal-100 dark:hover:bg-teal-500/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className="mt-0.5">
                  <CheckBox checked={checked} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-semibold ${checked ? 'text-teal-800' : 'text-gray-700'}`}>
                    {section.label}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">{section.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Layout option */}
        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={() => setPageBreaks((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors text-left"
          >
            <CheckBox checked={pageBreaks} />
            <span className="flex-1 text-xs font-semibold text-gray-700">
              Start each report on a new page
            </span>
          </button>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={noneSelected}
            className="flex-[2] px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold shadow-sm shadow-teal-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-teal-600"
          >
            🖨️ {noneSelected ? 'Select a report' : `Print ${selected.length} report${selected.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

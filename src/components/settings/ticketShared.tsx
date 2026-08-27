'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import type { TicketPriority, TicketStatus } from '@/types';

/**
 * Bits shared by the ticket list, the detail sheet and the new-ticket sheet.
 * Colours stick to the palette that globals.css already has `.dark` overrides
 * for — a new shade here would read as black-on-black at night.
 */

export const ticketInputClass =
  'w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:border-teal-500 focus:outline-none';

export const ticketLabelClass =
  'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider';

const STATUS_STYLES: Record<TicketStatus, { chip: string; dot: string; label: string }> = {
  new: { chip: 'bg-sky-50 text-sky-600', dot: 'bg-sky-500', label: 'New' },
  working: { chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', label: 'Working' },
  testing: { chip: 'bg-purple-50 text-purple-600', dot: 'bg-purple-500', label: 'Testing' },
  done: { chip: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500', label: 'Done' },
};

const PRIORITY_STYLES: Record<TicketPriority, { chip: string; dot: string; label: string }> = {
  urgent: { chip: 'bg-rose-50 text-rose-600', dot: 'bg-rose-500', label: 'Urgent' },
  normal: { chip: 'bg-gray-100 text-gray-600', dot: 'bg-amber-500', label: 'Normal' },
  low: { chip: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', label: 'Low' },
};

export const STATUS_ORDER: TicketStatus[] = ['new', 'working', 'testing', 'done'];

export function StatusChip({ status }: { status: TicketStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${s.chip}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: TicketPriority }) {
  const p = PRIORITY_STYLES[priority];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${p.chip}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  );
}

/** New → Working → Testing → Done, with everything reached so far filled in. */
export function WorkflowStrip({ status }: { status: TicketStatus }) {
  const reached = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center">
      {STATUS_ORDER.map((step, i) => {
        const done = i <= reached;
        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <span
                className={`h-0.5 flex-1 ${
                  i <= reached ? STATUS_STYLES[status].dot : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                done ? STATUS_STYLES[step].chip : 'bg-gray-100 text-gray-400'
              }`}
            >
              {STATUS_STYLES[step].label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** 'dd MMM' for this year, 'dd MMM yy' for anything older. */
export function shortDate(iso: string): string {
  const d = parseISO(iso);
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'dd MMM' : 'dd MMM yy');
}

export function dateTime(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy, h:mm a');
}

/** 'just now' / '20m ago' / '3h ago' / '12 Aug' — used for the Last Updated column. */
export function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(iso);
}

export function fileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The person's name out of their email — 'ravi@ppc.com' → 'ravi'. */
export function shortAuthor(email: string | null): string {
  if (!email) return 'someone';
  return email.split('@')[0];
}

/** The same bottom sheet the rest of the app uses for detail views. */
export function TicketSheet({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl border-t border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-up flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-4 mb-4 flex-shrink-0" />
        <div className="flex items-start justify-between px-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="min-w-0">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 ml-3 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors active:scale-95"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

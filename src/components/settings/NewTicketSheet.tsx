'use client';

import React, { useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MAX_ATTACHMENT_BYTES, TICKET_PRIORITIES } from '@/hooks/useTickets';
import type { TicketFormData, TicketPriority } from '@/types';
import {
  PriorityChip,
  TicketSheet,
  fileSize,
  ticketInputClass,
  ticketLabelClass,
} from './ticketShared';

const EMPTY_FORM: TicketFormData = { title: '', description: '', priority: 'normal' };

/**
 * Raise a bug or a small enhancement request. Files picked here are uploaded
 * after the ticket row exists, so they need a ticket id — the parent hook
 * handles that ordering.
 */
export default function NewTicketSheet({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (form: TicketFormData, files: File[]) => Promise<void>;
}) {
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<TicketFormData>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const pickFiles = (picked: FileList | null) => {
    if (!picked) return;
    const tooBig = [...picked].filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig.length) {
      showToast(`${tooBig.map((f) => f.name).join(', ')} is over 10 MB`, 'error');
    }
    setFiles((prev) => [...prev, ...[...picked].filter((f) => f.size <= MAX_ATTACHMENT_BYTES)]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = async () => {
    if (!form.title.trim()) {
      showToast('Give the issue a short title', 'error');
      return;
    }
    setSaving(true);
    try {
      await onCreate(form, files);
      setForm(EMPTY_FORM);
      setFiles([]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <TicketSheet
      onClose={onClose}
      title={
        <>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">New Ticket</h3>
          <p className="text-xs text-gray-550 dark:text-gray-400 mt-1">
            Report a bug or ask for a small change. It starts at New.
          </p>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={ticketLabelClass}>Issue</label>
          <input
            type="text"
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Yield report shows wrong total for SME"
            className={ticketInputClass}
          />
        </div>

        <div>
          <label className={ticketLabelClass}>Description</label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What you did, what you expected, what happened instead. Add the date and location if it only happens on certain data."
            className={`${ticketInputClass} resize-none`}
          />
        </div>

        <div>
          <label className={ticketLabelClass}>Priority</label>
          <div className="flex gap-2">
            {TICKET_PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setForm({ ...form, priority: p.value as TicketPriority })}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors min-h-[44px] ${
                  form.priority === p.value
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
            Urgent = the day&apos;s work is blocked. Low = a nice-to-have.
          </p>
        </div>

        <div>
          <label className={ticketLabelClass}>Screenshot / file (optional)</label>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,.pdf,.csv,.xlsx,.txt,.log"
            onChange={(e) => pickFiles(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full py-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-h-[48px]"
          >
            + Attach a screenshot
          </button>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <span className="text-xs font-medium text-gray-600 truncate">{file.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-gray-400">{fileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-[10px] font-bold text-rose-600"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Will be raised as</span>
          <PriorityChip priority={form.priority} />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors min-h-[48px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/20 transition-all min-h-[48px] disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </TicketSheet>
  );
}

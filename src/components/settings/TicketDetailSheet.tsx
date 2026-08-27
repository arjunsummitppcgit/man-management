'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { TICKET_PRIORITIES, statusLabel, ticketRef } from '@/hooks/useTickets';
import type { Ticket, TicketAttachment, TicketPriority, TicketStatus } from '@/types';
import {
  PriorityChip,
  StatusChip,
  TicketSheet,
  WorkflowStrip,
  dateTime,
  fileSize,
  relativeTime,
  shortAuthor,
  ticketInputClass,
  ticketLabelClass,
} from './ticketShared';

interface Props {
  ticket: Ticket;
  isAdmin: boolean;
  onClose: () => void;
  onChangeStatus: (next: TicketStatus, note?: string) => Promise<void>;
  onChangePriority: (priority: TicketPriority) => Promise<void>;
  onAddComment: (body: string) => Promise<void>;
  onAddAttachments: (files: File[]) => Promise<void>;
  onDeleteAttachment: (attachment: TicketAttachment) => Promise<void>;
  onDeleteTicket: () => Promise<void>;
  getAttachmentUrl: (path: string) => Promise<string>;
}

/** The one action that moves this ticket to the next step of the workflow. */
function nextStep(status: TicketStatus): { to: TicketStatus; label: string; hint: string } | null {
  switch (status) {
    case 'new':
      return { to: 'working', label: 'Start Working', hint: 'Developer — you have picked this up' };
    case 'working':
      return { to: 'testing', label: 'Move to Testing', hint: 'Developer — fixed and deployed' };
    case 'testing':
      return { to: 'done', label: 'Works — Mark Done', hint: 'You — the fix is good' };
    default:
      return null;
  }
}

export default function TicketDetailSheet({
  ticket,
  isAdmin,
  onClose,
  onChangeStatus,
  onChangePriority,
  onAddComment,
  onAddAttachments,
  onDeleteAttachment,
  onDeleteTicket,
  getAttachmentUrl,
}: Props) {
  const { showToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const commentBox = useRef<HTMLTextAreaElement>(null);

  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const attachments = ticket.attachments || [];
  const thread = ticket.comments || [];
  const step = nextStep(ticket.status);

  // Signed links for the private bucket. Keyed on the ids so a refetch that
  // returns the same files doesn't re-sign them.
  const attachmentKey = attachments.map((a) => a.id).join(',');
  useEffect(() => {
    if (!attachments.length) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        attachments.map(async (a) => {
          try {
            return [a.id, await getAttachmentUrl(a.file_path)] as const;
          } catch (e) {
            console.error('Could not sign attachment URL:', e);
            return [a.id, ''] as const;
          }
        })
      );
      if (!cancelled) setUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentKey, getAttachmentUrl]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      console.error(failure, e);
      showToast(e instanceof Error ? e.message : failure, 'error');
    } finally {
      setBusy(false);
    }
  };

  const postComment = async () => {
    if (!comment.trim()) {
      showToast('Write something first', 'error');
      return;
    }
    await run(async () => {
      await onAddComment(comment);
      setComment('');
      showToast('Comment added', 'success');
    }, 'Could not add the comment');
  };

  const advance = async () => {
    if (!step) return;
    await run(async () => {
      // Anything typed in the box goes along with the move, so a fix note and
      // the status change stay together in the thread.
      await onChangeStatus(step.to, comment);
      setComment('');
      showToast(`Moved to ${statusLabel(step.to)}`, 'success');
    }, 'Could not update the ticket');
  };

  /** Testing → Working. The note is the point: it says what is still wrong. */
  const sendBack = async () => {
    if (!comment.trim()) {
      showToast('Add a comment explaining what is still wrong', 'error');
      commentBox.current?.focus();
      commentBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    await run(async () => {
      await onChangeStatus('working', comment);
      setComment('');
      showToast('Sent back to Working', 'success');
    }, 'Could not update the ticket');
  };

  const reopen = async () => {
    await run(async () => {
      await onChangeStatus('working', comment);
      setComment('');
      showToast('Ticket reopened', 'success');
    }, 'Could not reopen the ticket');
  };

  const attach = async (picked: FileList | null) => {
    if (!picked?.length) return;
    setUploading(true);
    try {
      await onAddAttachments([...picked]);
      showToast('Attachment added', 'success');
    } catch (e) {
      console.error('Could not upload the attachment:', e);
      showToast(e instanceof Error ? e.message : 'Could not upload the attachment', 'error');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <TicketSheet
      onClose={onClose}
      title={
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 font-mono">
              {ticketRef(ticket)}
            </span>
            <StatusChip status={ticket.status} />
            <PriorityChip priority={ticket.priority} />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1.5 break-words">
            {ticket.title}
          </h3>
        </>
      }
    >
      <div className="space-y-5">
        <WorkflowStrip status={ticket.status} />

        {/* What was reported */}
        {ticket.description && (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
            {ticket.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
          <span className="text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider">Raised by</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium text-right truncate">
            {shortAuthor(ticket.created_by)}
          </span>
          <span className="text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider">Created</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium text-right">
            {dateTime(ticket.created_at)}
          </span>
          <span className="text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider">Last updated</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium text-right">
            {dateTime(ticket.updated_at)}
          </span>
        </div>

        {/* Priority stays editable — a bug can turn urgent after it is raised */}
        <div className="flex items-center justify-between gap-3">
          <span className={`${ticketLabelClass} mb-0`}>Priority</span>
          <div className="flex gap-1.5">
            {TICKET_PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                disabled={busy || p.value === ticket.priority}
                onClick={() => run(() => onChangePriority(p.value), 'Could not change the priority')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                  p.value === ticket.priority
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Attachments */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className={`${ticketLabelClass} mb-0`}>Attachments ({attachments.length})</h4>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,.pdf,.csv,.xlsx,.txt,.log"
              onChange={(e) => attach(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-teal-700 border border-teal-100 hover:opacity-80 active:scale-95 transition-all disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : '+ Attach'}
            </button>
          </div>

          {attachments.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No screenshots attached.</p>
          ) : (
            <div className="space-y-2">
              {attachments.map((a) => {
                const url = urls[a.id];
                const isImage = (a.mime_type || '').startsWith('image/');
                return (
                  <div
                    key={a.id}
                    className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden bg-gray-50"
                  >
                    {isImage && url && (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={a.file_name}
                          className="w-full max-h-64 object-contain bg-white dark:bg-gray-900"
                        />
                      </a>
                    )}
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                          {a.file_name}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {fileSize(a.size_bytes)}
                          {a.uploaded_by ? ` · ${shortAuthor(a.uploaded_by)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold text-teal-700"
                          >
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(`Remove ${a.file_name}?`)) return;
                            void run(
                              () => onDeleteAttachment(a),
                              'Could not remove the attachment'
                            );
                          }}
                          className="text-[11px] font-bold text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Comments & activity — one thread, oldest first */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <h4 className={ticketLabelClass}>
            Comments &amp; activity ({thread.filter((c) => c.kind === 'comment').length})
          </h4>
          {thread.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Nothing yet. The developer will reply here.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {thread.map((entry) =>
                entry.kind === 'status' ? (
                  <li key={entry.id} className="flex items-center gap-2 justify-center py-0.5">
                    <span className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {shortAuthor(entry.author_email)} moved{' '}
                      {entry.from_status ? statusLabel(entry.from_status) : '—'} →{' '}
                      {entry.to_status ? statusLabel(entry.to_status) : '—'} ·{' '}
                      {relativeTime(entry.created_at)}
                    </span>
                    <span className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                  </li>
                ) : (
                  <li
                    key={entry.id}
                    className="rounded-xl bg-gray-50 border border-gray-100 dark:border-gray-800 px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-bold text-teal-700">
                        {shortAuthor(entry.author_email)}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {relativeTime(entry.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mt-0.5">
                      {entry.body}
                    </p>
                  </li>
                )
              )}
            </ol>
          )}
        </div>

        {/* Write a comment. The same box carries the note for a status move. */}
        <div className="space-y-2">
          <textarea
            ref={commentBox}
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              ticket.status === 'testing'
                ? 'Tested it? Say what happened — this note goes with whichever button you press.'
                : 'Add a comment…'
            }
            className={`${ticketInputClass} resize-none`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={postComment}
            className="w-full py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors min-h-[44px] text-sm disabled:opacity-50"
          >
            Post Comment
          </button>
        </div>

        {/* Status controls — the workflow, one button per legal move */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
          {step && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={advance}
                className={`w-full py-3 text-white font-semibold rounded-xl shadow-lg transition-all min-h-[48px] disabled:opacity-50 ${
                  step.to === 'done'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/20'
                }`}
              >
                {step.label}
              </button>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">{step.hint}</p>
            </>
          )}

          {ticket.status === 'testing' && (
            <button
              type="button"
              disabled={busy}
              onClick={sendBack}
              className="w-full py-3 bg-amber-50 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-700 font-semibold rounded-xl transition-colors min-h-[48px] disabled:opacity-50"
            >
              Not Fixed — Back to Working
            </button>
          )}

          {ticket.status === 'done' && (
            <button
              type="button"
              disabled={busy}
              onClick={reopen}
              className="w-full py-3 bg-amber-50 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-700 font-semibold rounded-xl transition-colors min-h-[48px] disabled:opacity-50"
            >
              Reopen Ticket
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`Delete ${ticketRef(ticket)} and its comments? This cannot be undone.`)) {
                  return;
                }
                void run(onDeleteTicket, 'Could not delete the ticket');
              }}
              className="w-full py-2.5 text-rose-600 font-semibold rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors min-h-[44px] text-xs disabled:opacity-50"
            >
              Delete Ticket
            </button>
          )}
        </div>
      </div>
    </TicketSheet>
  );
}

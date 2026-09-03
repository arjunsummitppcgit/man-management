'use client';

import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { usePermissionAlert } from '@/components/ui/PermissionAlert';
import { useAuth } from '@/hooks/useAuth';
import { TICKET_PRIORITIES, ticketRef, useTickets } from '@/hooks/useTickets';
import { useTicketAlerts } from '@/hooks/useTicketAlerts';
import { isNewerThan, newestActivity } from '@/lib/ticketActivity';
import NewTicketSheet from '@/components/tickets/NewTicketSheet';
import TicketDetailSheet from '@/components/tickets/TicketDetailSheet';
import {
  PriorityChip,
  StatusChip,
  relativeTime,
  shortDate,
} from '@/components/tickets/ticketShared';
import type { Ticket, TicketFormData, TicketPriority, TicketStatus } from '@/types';

type StatusFilter = TicketStatus | 'all' | 'open';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'working', label: 'Working' },
  { key: 'testing', label: 'Testing' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

/**
 * Bug reports and small enhancement requests between the company user and the
 * developer.
 *
 *   Report → Fix → Test → Done
 *
 * Deliberately thin — the tracker exists so an issue isn't lost between a
 * WhatsApp message and a phone call, not to run a project. Reached from
 * Reports & Settings; rights are granted under Users & Permissions like any
 * other page (migration 036).
 */
export default function TicketsPage() {
  const { showToast } = useToast();
  const { requireModify } = usePermissionAlert();
  const { isAdmin } = useAuth();
  const {
    tickets,
    loading,
    error,
    fetchTickets,
    createTicket,
    updateTicket,
    changeStatus,
    addComment,
    addAttachments,
    deleteAttachment,
    deleteTicket,
    getAttachmentUrl,
  } = useTickets();

  const { seenAt, markSeen } = useTicketAlerts();
  // Captured at mount, before the visit is recorded below. The nav badge
  // clears as soon as the page opens, but the rows go on flagging what changed
  // since the PREVIOUS visit — otherwise you would never find out which ticket
  // the badge was about.
  const [seenOnOpen] = useState(() => seenAt);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Opening the page is what "seen" means. Marked against the newest activity
  // actually on screen rather than the clock, so anything that lands a moment
  // later still raises the badge. markSeen never moves the marker backwards,
  // so re-running this is free.
  useEffect(() => {
    if (loading) return;
    markSeen(newestActivity(tickets));
  }, [loading, tickets, markSeen]);

  const selected = tickets.find((t) => t.id === selectedId) || null;

  const counts = useMemo(() => {
    const by = (s: TicketStatus) => tickets.filter((t) => t.status === s).length;
    return {
      all: tickets.length,
      open: tickets.filter((t) => t.status !== 'done').length,
      new: by('new'),
      working: by('working'),
      testing: by('testing'),
      done: by('done'),
    } satisfies Record<StatusFilter, number>;
  }, [tickets]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/^#/, '');
    const matches = tickets.filter((t) => {
      if (statusFilter === 'open' && t.status === 'done') return false;
      if (statusFilter !== 'all' && statusFilter !== 'open' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (!query) return true;
      return (
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        String(t.ticket_number).padStart(3, '0').includes(query)
      );
    });
    // Still-open tickets first; newest activity first inside each group.
    return matches.sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        b.updated_at.localeCompare(a.updated_at)
    );
  }, [tickets, search, statusFilter, priorityFilter]);

  const handleCreate = async (form: TicketFormData, files: File[]) => {
    try {
      const { ticket, failedUploads } = await createTicket(form, files);
      setCreateOpen(false);
      showToast(`Ticket ${ticketRef(ticket)} raised`, 'success');
      if (failedUploads.length) {
        showToast(`Could not upload ${failedUploads.join(', ')}`, 'error');
      }
    } catch (e) {
      console.error('Error creating ticket:', e);
      showToast(e instanceof Error ? e.message : 'Could not create the ticket', 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tickets"
        subtitle="Report → Fix → Test → Done"
        rightAction={
          <button
            type="button"
            onClick={() => {
              // Refuse at the door rather than after the whole ticket is typed.
              if (!requireModify('tickets')) return;
              setCreateOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-lg shadow-sky-600/20 transition-colors active:scale-95 min-h-[40px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Ticket
          </button>
        }
      />

      <div className="px-4 space-y-4">
        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 dark:border-rose-900/40 px-4 py-3">
            <p className="text-xs font-bold text-rose-600">{error}</p>
            <p className="text-[10px] text-rose-500 font-medium mt-1">
              If this mentions a missing table, run migrations 035 and 036 in the Supabase SQL
              editor first.
            </p>
          </div>
        )}

        {/* Status filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[38px] border ${
                statusFilter === key
                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-600/20'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {label}
              <span className={`ml-1.5 ${statusFilter === key ? 'text-white/70' : 'text-gray-400'}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* Search + priority filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:border-sky-500 focus:outline-none min-h-[44px]"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | 'all')}
            className="px-3 py-2.5 bg-white border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 focus:border-sky-500 focus:outline-none min-h-[44px] appearance-none"
          >
            <option value="all">All priorities</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* List */}
        {loading && tickets.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-14 px-6 text-center">
            <div className="text-3xl mb-2">🎫</div>
            <p className="text-sm font-semibold text-gray-700">
              {tickets.length === 0 ? 'No tickets yet' : 'Nothing matches those filters'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {tickets.length === 0
                ? 'Found a bug or want a small change? Raise the first one.'
                : 'Try another status, priority or search.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-2 sm:py-3">
            {/* Phone: stacked rows — the same columns, without a sideways scroll */}
            <ul className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {visible.map((ticket) => (
                <TicketListItem
                  key={ticket.id}
                  ticket={ticket}
                  isNew={isNewerThan(ticket.updated_at, seenOnOpen)}
                  onClick={() => setSelectedId(ticket.id)}
                />
              ))}
            </ul>

            {/* Wider screens: the full table */}
            <div className="hidden sm:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Ticket', 'Issue', 'Priority', 'Status', 'Created', 'Updated'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider pb-2 px-2 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((ticket) => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      isNew={isNewerThan(ticket.updated_at, seenOnOpen)}
                      onClick={() => setSelectedId(ticket.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>

      {createOpen && (
        <NewTicketSheet onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      )}

      {selected && (
        <TicketDetailSheet
          ticket={selected}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
          onChangeStatus={(next, note) => changeStatus(selected, next, note)}
          onChangePriority={(priority) => updateTicket(selected.id, { priority })}
          onAddComment={(body) => addComment(selected.id, body)}
          onAddAttachments={(files) => addAttachments(selected.id, files)}
          onDeleteAttachment={deleteAttachment}
          onDeleteTicket={async () => {
            await deleteTicket(selected);
            setSelectedId(null);
            showToast('Ticket deleted', 'success');
          }}
          getAttachmentUrl={getAttachmentUrl}
        />
      )}
    </div>
  );
}

/** A red dot on the tickets that moved since this user's previous visit. */
function NewDot() {
  return (
    <span
      className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"
      title="New activity since you last opened Tickets"
      role="img"
      aria-label="New activity"
    />
  );
}

/** '2 comments · 1 file' — only rendered when there is something to say. */
function ticketMeta(ticket: Ticket): string {
  const comments = (ticket.comments || []).filter((c) => c.kind === 'comment').length;
  const files = (ticket.attachments || []).length;
  return [
    comments > 0 && `${comments} comment${comments === 1 ? '' : 's'}`,
    files > 0 && `${files} file${files === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function TicketListItem({
  ticket,
  isNew,
  onClick,
}: {
  ticket: Ticket;
  isNew: boolean;
  onClick: () => void;
}) {
  const meta = ticketMeta(ticket);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left flex items-start gap-2.5 py-3 transition-transform active:scale-[0.99] ${
          ticket.status === 'done' ? 'opacity-60' : ''
        }`}
      >
        <span className="flex items-center gap-1.5 pt-0.5 flex-shrink-0">
          {isNew && <NewDot />}
          <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 font-mono">
            {ticketRef(ticket)}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm truncate ${
              isNew
                ? 'font-bold text-gray-900 dark:text-gray-100'
                : 'font-semibold text-gray-700 dark:text-gray-300'
            }`}
          >
            {ticket.title}
          </span>
          <span className="flex items-center flex-wrap gap-1.5 mt-1.5">
            <StatusChip status={ticket.status} />
            <PriorityChip priority={ticket.priority} />
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {shortDate(ticket.created_at)} · updated {relativeTime(ticket.updated_at)}
              {meta && ` · ${meta}`}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

function TicketRow({
  ticket,
  isNew,
  onClick,
}: {
  ticket: Ticket;
  isNew: boolean;
  onClick: () => void;
}) {
  const meta = ticketMeta(ticket);

  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
        ticket.status === 'done' ? 'opacity-60' : ''
      }`}
    >
      <td className="px-2 py-3 align-top">
        <span className="flex items-center gap-1.5">
          {isNew && <NewDot />}
          <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">
            {ticketRef(ticket)}
          </span>
        </span>
      </td>
      <td className="px-2 py-3 align-top max-w-[260px] lg:max-w-[620px]">
        <p
          className={`text-xs truncate ${
            isNew
              ? 'font-bold text-gray-900 dark:text-gray-100'
              : 'font-semibold text-gray-700 dark:text-gray-300'
          }`}
        >
          {ticket.title}
        </p>
        {meta && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{meta}</p>
        )}
      </td>
      <td className="px-2 py-3 align-top">
        <PriorityChip priority={ticket.priority} />
      </td>
      <td className="px-2 py-3 align-top">
        <StatusChip status={ticket.status} />
      </td>
      <td className="px-2 py-3 align-top">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {shortDate(ticket.created_at)}
        </span>
      </td>
      <td className="px-2 py-3 align-top">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {relativeTime(ticket.updated_at)}
        </span>
      </td>
    </tr>
  );
}

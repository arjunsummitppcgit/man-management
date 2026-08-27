'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { TICKET_PRIORITIES, ticketRef, useTickets } from '@/hooks/useTickets';
import type { Ticket, TicketFormData, TicketPriority, TicketStatus } from '@/types';
import NewTicketSheet from './NewTicketSheet';
import TicketDetailSheet from './TicketDetailSheet';
import { PriorityChip, StatusChip, relativeTime, shortDate } from './ticketShared';

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
 * Bug reports and small enhancement requests, in the one place both people
 * already open: Reports & Settings.
 *
 *   Report → Fix → Test → Done
 *
 * Deliberately thin — the tracker exists so an issue isn't lost between a
 * WhatsApp message and a phone call, not to run a project.
 */
export default function TicketsSection() {
  const { showToast } = useToast();
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

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

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
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-sky-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Tickets</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              Report → Fix → Test → Done
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg transition-colors active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Ticket
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 px-3 py-2.5 my-3">
          <p className="text-xs font-bold text-rose-600">{error}</p>
          <p className="text-[10px] text-rose-500 font-medium mt-1">
            If this mentions a missing table, run migration 035 in the Supabase SQL editor first.
          </p>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 mt-3">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors border ${
              statusFilter === key
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {label}
            <span className={`ml-1 ${statusFilter === key ? 'text-white/70' : 'text-gray-400'}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search + priority filter */}
      <div className="flex gap-2 mt-2">
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-800 dark:text-gray-200 focus:border-sky-500 focus:outline-none min-h-[38px]"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | 'all')}
          className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 focus:border-sky-500 focus:outline-none min-h-[38px] appearance-none"
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
        <p className="text-xs text-gray-400 font-medium py-6 text-center">Loading tickets…</p>
      ) : visible.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs font-semibold text-gray-500">
            {tickets.length === 0 ? 'No tickets yet' : 'Nothing matches those filters'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            {tickets.length === 0
              ? 'Found a bug or want a small change? Raise the first one.'
              : 'Try another status, priority or search.'}
          </p>
        </div>
      ) : (
        <>
          {/* Phone: stacked rows — the same columns, without a sideways scroll */}
          <ul className="sm:hidden mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {visible.map((ticket) => (
              <TicketListItem
                key={ticket.id}
                ticket={ticket}
                onClick={() => setSelectedId(ticket.id)}
              />
            ))}
          </ul>

          {/* Wider screens: the full table */}
          <div className="hidden sm:block mt-3">
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
                    onClick={() => setSelectedId(ticket.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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

function TicketListItem({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const meta = ticketMeta(ticket);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left flex items-start gap-2 py-2.5 transition-transform active:scale-[0.99] ${
          ticket.status === 'done' ? 'opacity-60' : ''
        }`}
      >
        <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 font-mono pt-0.5 flex-shrink-0">
          {ticketRef(ticket)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
            {ticket.title}
          </span>
          <span className="flex items-center flex-wrap gap-1.5 mt-1">
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

function TicketRow({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const meta = ticketMeta(ticket);

  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
        ticket.status === 'done' ? 'opacity-60' : ''
      }`}
    >
      <td className="px-2 py-2.5 align-top">
        <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">
          {ticketRef(ticket)}
        </span>
      </td>
      <td className="px-2 py-2.5 align-top max-w-[220px] lg:max-w-[560px]">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
          {ticket.title}
        </p>
        {meta && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{meta}</p>
        )}
      </td>
      <td className="px-2 py-2.5 align-top">
        <PriorityChip priority={ticket.priority} />
      </td>
      <td className="px-2 py-2.5 align-top">
        <StatusChip status={ticket.status} />
      </td>
      <td className="px-2 py-2.5 align-top">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {shortDate(ticket.created_at)}
        </span>
      </td>
      <td className="px-2 py-2.5 align-top">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {relativeTime(ticket.updated_at)}
        </span>
      </td>
    </tr>
  );
}

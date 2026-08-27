'use client';

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  Ticket,
  TicketAttachment,
  TicketFormData,
  TicketStatus,
} from '@/types';

/** Private bucket created by migration 035. */
export const TICKET_BUCKET = 'ticket-attachments';

/** 10 MB — the bucket refuses anything bigger, so stop it before the upload. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'working', label: 'Working' },
  { value: 'testing', label: 'Testing' },
  { value: 'done', label: 'Done' },
];

export const TICKET_PRIORITIES: { value: Ticket['priority']; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export function statusLabel(status: TicketStatus): string {
  return TICKET_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** '#007' — the number people actually say out loud. */
export function ticketRef(ticket: Pick<Ticket, 'ticket_number'>): string {
  return `#${String(ticket.ticket_number).padStart(3, '0')}`;
}

/** Strip anything that would confuse a storage path, keep the extension. */
function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

export function useTickets() {
  const { user } = useAuth();
  const actorEmail = user?.email ?? null;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('tickets')
        .select('*, comments:ticket_comments(*), attachments:ticket_attachments(*)')
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Oldest first inside a ticket — the thread reads top to bottom.
      setTickets(
        (data || []).map((ticket: Ticket) => ({
          ...ticket,
          comments: [...(ticket.comments || [])].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          ),
          attachments: [...(ticket.attachments || [])].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          ),
        }))
      );
      setError(null);
    } catch (e) {
      console.error('Error fetching tickets:', e);
      setTickets([]);
      setError(e instanceof Error ? e.message : 'Could not load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Upload one file into the bucket and index it against the ticket. */
  const uploadAttachment = useCallback(
    async (ticketId: string, file: File) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`${file.name} is bigger than 10 MB`);
      }

      const path = `${ticketId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(TICKET_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw uploadError;

      const { error: rowError } = await supabase.from('ticket_attachments').insert({
        ticket_id: ticketId,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: actorEmail,
      });
      // Don't leave an orphan file in the bucket if the index row fails.
      if (rowError) {
        await supabase.storage.from(TICKET_BUCKET).remove([path]);
        throw rowError;
      }
    },
    [actorEmail]
  );

  const createTicket = useCallback(
    async (form: TicketFormData, files: File[] = []) => {
      const { data, error: insertError } = await supabase
        .from('tickets')
        .insert({
          title: form.title.trim(),
          description: form.description.trim(),
          priority: form.priority,
          status: 'new',
          created_by: actorEmail,
          updated_by: actorEmail,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // The ticket is already saved; a failed upload must not lose it.
      const failed: string[] = [];
      for (const file of files) {
        try {
          await uploadAttachment(data.id, file);
        } catch (e) {
          console.error('Error uploading attachment:', e);
          failed.push(file.name);
        }
      }

      await fetchTickets();
      return { ticket: data as Ticket, failedUploads: failed };
    },
    [actorEmail, fetchTickets, uploadAttachment]
  );

  const addComment = useCallback(
    async (ticketId: string, body: string) => {
      const { error: commentError } = await supabase.from('ticket_comments').insert({
        ticket_id: ticketId,
        body: body.trim(),
        kind: 'comment',
        author_email: actorEmail,
      });
      if (commentError) throw commentError;
      await fetchTickets();
    },
    [actorEmail, fetchTickets]
  );

  /**
   * Move a ticket along the workflow. The change is written into the same
   * thread as the comments, so the ticket reads as one history, and `note`
   * (used when a fix is sent back from Testing) is posted with it.
   */
  const changeStatus = useCallback(
    async (ticket: Ticket, next: TicketStatus, note?: string) => {
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: next,
          updated_by: actorEmail,
          closed_at: next === 'done' ? new Date().toISOString() : null,
        })
        .eq('id', ticket.id);
      if (updateError) throw updateError;

      const rows: {
        ticket_id: string;
        body: string;
        kind: 'comment' | 'status';
        from_status: TicketStatus | null;
        to_status: TicketStatus | null;
        author_email: string | null;
      }[] = [
        {
          ticket_id: ticket.id,
          body: '',
          kind: 'status',
          from_status: ticket.status,
          to_status: next,
          author_email: actorEmail,
        },
      ];
      if (note?.trim()) {
        rows.push({
          ticket_id: ticket.id,
          body: note.trim(),
          kind: 'comment',
          from_status: null,
          to_status: null,
          author_email: actorEmail,
        });
      }

      const { error: logError } = await supabase.from('ticket_comments').insert(rows);
      if (logError) throw logError;

      await fetchTickets();
    },
    [actorEmail, fetchTickets]
  );

  const updateTicket = useCallback(
    async (id: string, patch: Partial<Ticket>) => {
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ ...patch, updated_by: actorEmail })
        .eq('id', id);
      if (updateError) throw updateError;
      await fetchTickets();
    },
    [actorEmail, fetchTickets]
  );

  const addAttachments = useCallback(
    async (ticketId: string, files: File[]) => {
      for (const file of files) {
        await uploadAttachment(ticketId, file);
      }
      await fetchTickets();
    },
    [fetchTickets, uploadAttachment]
  );

  const deleteAttachment = useCallback(
    async (attachment: TicketAttachment) => {
      const { error: rowError } = await supabase
        .from('ticket_attachments')
        .delete()
        .eq('id', attachment.id);
      if (rowError) throw rowError;
      await supabase.storage.from(TICKET_BUCKET).remove([attachment.file_path]);
      await fetchTickets();
    },
    [fetchTickets]
  );

  const deleteTicket = useCallback(
    async (ticket: Ticket) => {
      const paths = (ticket.attachments || []).map((a) => a.file_path);
      const { error: deleteError } = await supabase.from('tickets').delete().eq('id', ticket.id);
      if (deleteError) throw deleteError;
      // Comments and attachment rows cascade; the files themselves don't.
      if (paths.length) await supabase.storage.from(TICKET_BUCKET).remove(paths);
      await fetchTickets();
    },
    [fetchTickets]
  );

  /** Short-lived link to a file in the private bucket. */
  const getAttachmentUrl = useCallback(async (path: string) => {
    const { data, error: urlError } = await supabase.storage
      .from(TICKET_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (urlError) throw urlError;
    return data.signedUrl;
  }, []);

  return {
    tickets,
    loading,
    error,
    actorEmail,
    fetchTickets,
    createTicket,
    updateTicket,
    changeStatus,
    addComment,
    addAttachments,
    deleteAttachment,
    deleteTicket,
    getAttachmentUrl,
  };
}

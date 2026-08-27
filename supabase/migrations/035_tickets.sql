-- ============================================
-- 035: TICKETS — bug reports & small enhancement requests
--
-- A two-person tracker that lives under Reports & Settings: the company user
-- raises a ticket, the developer works it, the company user tests it and
-- closes it.
--
--   New → Working → Testing → Done   (and Testing → Working when a fix fails)
--
-- Deliberately small. No assignees, sprints, estimates or milestones — the
-- comments thread carries the conversation and every status change is written
-- into that same thread so the history reads top to bottom.
--
-- Safe to run more than once.
-- ============================================

-- ── 1. Tickets ───────────────────────────────────────────────────────────────

-- Human-facing ticket number: #001, #002, … Sequence rather than count(*) so
-- two people raising a ticket at the same moment can never collide, and a
-- deleted ticket never hands its number to a later one.
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number INTEGER NOT NULL UNIQUE DEFAULT nextval('ticket_number_seq'),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'working', 'testing', 'done')),
    -- Who raised it / who touched it last, by email. Free text on purpose: a
    -- login can be deleted without taking the ticket history with it.
    created_by TEXT,
    updated_by TEXT,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at DESC);

-- ── 2. Comments & activity ───────────────────────────────────────────────────
-- One table for both, so the ticket reads as a single thread:
--   kind='comment' → something a person wrote
--   kind='status'  → an automatic "moved Working → Testing" line
CREATE TABLE IF NOT EXISTS ticket_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'status')),
    from_status TEXT,
    to_status TEXT,
    author_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at);

-- ── 3. Attachments ───────────────────────────────────────────────────────────
-- The file itself lives in the 'ticket-attachments' storage bucket created in
-- section 6; this table is the index the app reads.
CREATE TABLE IF NOT EXISTS ticket_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    -- Path inside the bucket, e.g. '<ticket id>/<uuid>-screenshot.png'
    file_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id, created_at);

-- ── 4. Keep "Last Updated" honest ────────────────────────────────────────────
-- touch_updated_at() comes from migration 027.
DROP TRIGGER IF EXISTS trg_tickets_updated ON tickets;
CREATE TRIGGER trg_tickets_updated
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- A comment or an attachment is activity on the ticket, so the list has to
-- resort. SECURITY DEFINER because the bump is a side effect of commenting,
-- not a claim that the commenter may edit the ticket row.
CREATE OR REPLACE FUNCTION touch_ticket_from_child()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE tickets SET updated_at = NOW() WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_comment_touches_ticket ON ticket_comments;
CREATE TRIGGER trg_ticket_comment_touches_ticket
    AFTER INSERT ON ticket_comments
    FOR EACH ROW EXECUTE FUNCTION touch_ticket_from_child();

DROP TRIGGER IF EXISTS trg_ticket_attachment_touches_ticket ON ticket_attachments;
CREATE TRIGGER trg_ticket_attachment_touches_ticket
    AFTER INSERT ON ticket_attachments
    FOR EACH ROW EXECUTE FUNCTION touch_ticket_from_child();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
-- Anyone with a live login may raise a ticket, read the thread and move a
-- ticket along — that is the whole point of a two-person tracker, and page
-- permissions would only get in the way. Deleting is the one admin-only act,
-- because it takes the comments and attachments with it.

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read tickets" ON tickets;
CREATE POLICY "read tickets" ON tickets FOR SELECT USING (is_active_app_user());

DROP POLICY IF EXISTS "raise tickets" ON tickets;
CREATE POLICY "raise tickets" ON tickets FOR INSERT WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS "update tickets" ON tickets;
CREATE POLICY "update tickets" ON tickets FOR UPDATE
    USING (is_active_app_user()) WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS "admins delete tickets" ON tickets;
CREATE POLICY "admins delete tickets" ON tickets FOR DELETE USING (is_app_admin());

DROP POLICY IF EXISTS "read ticket comments" ON ticket_comments;
CREATE POLICY "read ticket comments" ON ticket_comments FOR SELECT USING (is_active_app_user());

DROP POLICY IF EXISTS "add ticket comments" ON ticket_comments;
CREATE POLICY "add ticket comments" ON ticket_comments FOR INSERT WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS "admins delete ticket comments" ON ticket_comments;
CREATE POLICY "admins delete ticket comments" ON ticket_comments FOR DELETE USING (is_app_admin());

DROP POLICY IF EXISTS "read ticket attachments" ON ticket_attachments;
CREATE POLICY "read ticket attachments" ON ticket_attachments FOR SELECT USING (is_active_app_user());

DROP POLICY IF EXISTS "add ticket attachments" ON ticket_attachments;
CREATE POLICY "add ticket attachments" ON ticket_attachments FOR INSERT WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS "delete ticket attachments" ON ticket_attachments;
CREATE POLICY "delete ticket attachments" ON ticket_attachments FOR DELETE USING (is_active_app_user());

-- The DEFAULT on ticket_number needs the sequence, so the inserting role does too.
GRANT USAGE, SELECT ON SEQUENCE ticket_number_seq TO authenticated;

-- ── 6. Attachment storage ────────────────────────────────────────────────────
-- Private bucket: the app hands out short-lived signed URLs, so a screenshot of
-- plant data never sits on a public URL. 10 MB is plenty for a screenshot.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ticket-attachments', 'ticket-attachments', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

-- storage.objects is owned by supabase_storage_admin. On most projects the SQL
-- editor may still write policies on it; if this project is not one of them the
-- migration must not fail — create the three policies from
-- Dashboard → Storage → ticket-attachments → Policies instead.
DO $$
BEGIN
    DROP POLICY IF EXISTS "read ticket attachment files" ON storage.objects;
    CREATE POLICY "read ticket attachment files" ON storage.objects FOR SELECT
        USING (bucket_id = 'ticket-attachments' AND is_active_app_user());

    DROP POLICY IF EXISTS "upload ticket attachment files" ON storage.objects;
    CREATE POLICY "upload ticket attachment files" ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'ticket-attachments' AND is_active_app_user());

    DROP POLICY IF EXISTS "delete ticket attachment files" ON storage.objects;
    CREATE POLICY "delete ticket attachment files" ON storage.objects FOR DELETE
        USING (bucket_id = 'ticket-attachments' AND is_active_app_user());
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not create storage policies here — add them by hand under Storage → ticket-attachments → Policies (authenticated users: SELECT, INSERT, DELETE).';
END $$;

-- PostgREST caches the schema; make the new tables visible now.
NOTIFY pgrst, 'reload schema';

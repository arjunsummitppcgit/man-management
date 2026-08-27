-- ============================================
-- 036: TICKETS BECOME A PAGE, WITH PAGE PERMISSIONS
--
-- Migration 035 put the tracker inside Reports & Settings and let any active
-- login use it. It now has its own page (/tickets), so it gets its own
-- page_key and is granted like every other page under Users & Permissions.
--
-- Nobody loses what they have today: every existing account is seeded with
-- View + Modify, matching how 035 behaved. Take rights away per user from the
-- permissions grid afterwards.
--
-- Safe to run more than once.
-- ============================================

-- ── 1. Seed the right that already existed in practice ───────────────────────
-- Admins bypass user_page_permissions entirely (is_app_admin), so this only
-- matters for staff — but seeding everyone keeps the grid honest to read.
INSERT INTO user_page_permissions (user_id, page_key, can_view, can_modify, updated_by)
SELECT u.id, 'tickets', TRUE, TRUE, 'migration 036'
FROM app_users u
ON CONFLICT (user_id, page_key) DO NOTHING;

-- ── 2. Point the ticket tables at the new page key ───────────────────────────
-- Reading a ticket needs View; raising one, commenting and moving it along
-- need Modify. Deleting stays admin-only — it takes the comments and the
-- attachments with it.

DROP POLICY IF EXISTS "read tickets" ON tickets;
CREATE POLICY "read tickets" ON tickets FOR SELECT USING (can_view_page('tickets'));

DROP POLICY IF EXISTS "raise tickets" ON tickets;
CREATE POLICY "raise tickets" ON tickets FOR INSERT WITH CHECK (can_modify_page('tickets'));

DROP POLICY IF EXISTS "update tickets" ON tickets;
CREATE POLICY "update tickets" ON tickets FOR UPDATE
    USING (can_modify_page('tickets')) WITH CHECK (can_modify_page('tickets'));

-- (the admin-only DELETE policy from 035 is unchanged)

DROP POLICY IF EXISTS "read ticket comments" ON ticket_comments;
CREATE POLICY "read ticket comments" ON ticket_comments FOR SELECT USING (can_view_page('tickets'));

DROP POLICY IF EXISTS "add ticket comments" ON ticket_comments;
CREATE POLICY "add ticket comments" ON ticket_comments FOR INSERT
    WITH CHECK (can_modify_page('tickets'));

DROP POLICY IF EXISTS "read ticket attachments" ON ticket_attachments;
CREATE POLICY "read ticket attachments" ON ticket_attachments FOR SELECT
    USING (can_view_page('tickets'));

DROP POLICY IF EXISTS "add ticket attachments" ON ticket_attachments;
CREATE POLICY "add ticket attachments" ON ticket_attachments FOR INSERT
    WITH CHECK (can_modify_page('tickets'));

DROP POLICY IF EXISTS "delete ticket attachments" ON ticket_attachments;
CREATE POLICY "delete ticket attachments" ON ticket_attachments FOR DELETE
    USING (can_modify_page('tickets'));

-- ── 3. The attachment files themselves ───────────────────────────────────────
-- Same rule at the storage layer, so a revoked user cannot fetch a screenshot
-- by path even though the index row is hidden from them.
--
-- As in 035: storage.objects is owned by supabase_storage_admin and the SQL
-- editor may not be allowed to write policies on it. An exception here rolls
-- the whole block back, so a failure leaves 035's working policies in place —
-- the tracker keeps running, just gated on "any active login" rather than on
-- the page right.
DO $$
BEGIN
    DROP POLICY IF EXISTS "read ticket attachment files" ON storage.objects;
    CREATE POLICY "read ticket attachment files" ON storage.objects FOR SELECT
        USING (bucket_id = 'ticket-attachments' AND can_view_page('tickets'));

    DROP POLICY IF EXISTS "upload ticket attachment files" ON storage.objects;
    CREATE POLICY "upload ticket attachment files" ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'ticket-attachments' AND can_modify_page('tickets'));

    DROP POLICY IF EXISTS "delete ticket attachment files" ON storage.objects;
    CREATE POLICY "delete ticket attachment files" ON storage.objects FOR DELETE
        USING (bucket_id = 'ticket-attachments' AND can_modify_page('tickets'));
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage policies left as migration 035 created them — edit them under Storage → ticket-attachments → Policies if you want them tied to the Tickets page right.';
END $$;

NOTIFY pgrst, 'reload schema';

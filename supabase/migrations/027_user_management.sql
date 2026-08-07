-- ============================================
-- 027: USER MANAGEMENT, PAGE PERMISSIONS & EDIT WINDOWS
--
-- Replaces the hardcoded sub-user email list (src/lib/auth/subUsers.ts, and the
-- copy of it inside migration 026's policies) with a database-driven model:
--
--   app_users              — one row per login: role, active flag, last login
--   user_page_permissions  — per user, per page: can_view / can_modify
--   user_edit_windows      — admin-granted permission to edit OLD work dates
--   permission_audit_log   — who changed which permission, and when
--   data_edit_log          — edits made to old dates under a granted window
--
-- Default rule: an admin may do anything on any date. Everyone else may only
-- write today and yesterday (IST), and only on pages they hold can_modify for.
-- Older dates need an explicit window from an admin.
--
-- Enforcement lives HERE, not just in the UI: every data table's RLS now calls
-- these helpers, so a blocked user cannot write by calling the API directly.
--
-- Safe to run more than once.
-- ============================================

-- ── 1. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT
);

CREATE TABLE IF NOT EXISTS user_page_permissions (
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    page_key TEXT NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_modify BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT,
    PRIMARY KEY (user_id, page_key)
);

-- An open window is one where revoked_at IS NULL and active_until >= today.
-- from_date/to_date are WORK dates (which days may be edited); active_until is
-- when the permission itself lapses, so forgotten grants close themselves.
CREATE TABLE IF NOT EXISTS user_edit_windows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    page_key TEXT NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    active_until DATE NOT NULL,
    reason TEXT,
    revoked_at TIMESTAMPTZ,
    revoked_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_edit_windows_user ON user_edit_windows(user_id, page_key);

CREATE TABLE IF NOT EXISTS permission_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_email TEXT,
    action TEXT NOT NULL,
    target_email TEXT,
    target_user_id UUID,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_audit_created ON permission_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS data_edit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_email TEXT,
    page_key TEXT NOT NULL,
    work_date DATE,
    table_name TEXT,
    action TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_edit_log_created ON data_edit_log(created_at DESC);

-- Keep updated_at honest on both permission tables
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_users_updated ON app_users;
CREATE TRIGGER trg_app_users_updated
    BEFORE UPDATE ON app_users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_page_permissions_updated ON user_page_permissions;
CREATE TRIGGER trg_user_page_permissions_updated
    BEFORE UPDATE ON user_page_permissions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 2. Helper functions ──────────────────────────────────────────────────────
-- All SECURITY DEFINER so they can read app_users from inside a policy on
-- app_users itself without recursing, and so a staff user cannot see rows they
-- are not allowed to read just by calling them.

-- The app works in IST; "today" must mean the same thing here and in the UI.
CREATE OR REPLACE FUNCTION app_today()
RETURNS DATE LANGUAGE sql STABLE AS $$
    SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM app_users
        WHERE id = auth.uid() AND is_active AND role = 'admin'
    );
$$;

-- A disabled account keeps its rows but loses every right immediately.
CREATE OR REPLACE FUNCTION is_active_app_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND is_active);
$$;

CREATE OR REPLACE FUNCTION can_view_page(p_page TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_app_admin() OR EXISTS (
        SELECT 1
        FROM user_page_permissions pp
        JOIN app_users u ON u.id = pp.user_id
        WHERE pp.user_id = auth.uid()
          AND u.is_active
          AND pp.page_key = p_page
          AND pp.can_view
    );
$$;

CREATE OR REPLACE FUNCTION can_modify_page(p_page TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_app_admin() OR EXISTS (
        SELECT 1
        FROM user_page_permissions pp
        JOIN app_users u ON u.id = pp.user_id
        WHERE pp.user_id = auth.uid()
          AND u.is_active
          AND pp.page_key = p_page
          AND pp.can_modify
    );
$$;

-- The whole date rule in one place.
--   admin            → any date
--   no modify right  → nothing
--   default          → today and yesterday only (no future dates)
--   otherwise        → only inside an open, unexpired admin-granted window
CREATE OR REPLACE FUNCTION can_edit_on(p_page TEXT, p_date DATE)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE
        WHEN is_app_admin() THEN TRUE
        WHEN NOT can_modify_page(p_page) THEN FALSE
        WHEN p_date IS NULL THEN FALSE
        WHEN p_date <= app_today() AND p_date >= app_today() - 1 THEN TRUE
        ELSE EXISTS (
            SELECT 1 FROM user_edit_windows w
            WHERE w.user_id = auth.uid()
              AND w.page_key = p_page
              AND w.revoked_at IS NULL
              AND w.active_until >= app_today()
              AND p_date BETWEEN w.from_date AND w.to_date
        )
    END;
$$;

-- Supervisor assignments are written from BOTH the daily workforce flow and the
-- supervisors page, so either right unlocks them.
CREATE OR REPLACE FUNCTION can_edit_assignment_on(p_date DATE)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT can_edit_on('daily-entry', p_date) OR can_edit_on('supervisors', p_date);
$$;

-- Called by the client after sign-in; a user may only stamp their own row.
CREATE OR REPLACE FUNCTION touch_last_login()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE app_users SET last_login_at = NOW() WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION app_today(), is_app_admin(), is_active_app_user(),
    can_view_page(TEXT), can_modify_page(TEXT), can_edit_on(TEXT, DATE),
    can_edit_assignment_on(DATE), touch_last_login() TO authenticated;

-- ── 3. Seed from the accounts that exist today ───────────────────────────────
-- Preserves current behaviour exactly: the three staff logins stay staff,
-- every other existing login is an admin. Re-running never demotes anyone.

INSERT INTO app_users (id, email, role, created_by)
SELECT
    au.id,
    au.email,
    CASE
        WHEN lower(au.email) IN ('ramakrishna@ppc.com', 'sairam@ppc.com', 'manisha@ppc.com')
        THEN 'staff' ELSE 'admin'
    END,
    'migration 027'
FROM auth.users au
WHERE au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Staff keep exactly the pages the sidebar used to show them (everything not
-- marked adminOnly), with modify rights, so nobody loses access on rollout.
INSERT INTO user_page_permissions (user_id, page_key, can_view, can_modify, updated_by)
SELECT u.id, p.page_key, TRUE, p.can_modify, 'migration 027'
FROM app_users u
CROSS JOIN (VALUES
    ('dashboard', TRUE),
    ('daily-entry', TRUE),
    ('assistant', FALSE),
    ('supervisors', TRUE),
    ('yield-report', FALSE),
    ('maintenance-tasks', TRUE),
    ('settings', FALSE)
) AS p(page_key, can_modify)
WHERE u.role = 'staff'
ON CONFLICT (user_id, page_key) DO NOTHING;

-- ── 4. RLS on the new tables ─────────────────────────────────────────────────

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_edit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_edit_log ENABLE ROW LEVEL SECURITY;

-- A user may always read their own row and their own permissions — the app
-- needs that to know what to render. Only admins see everyone.
DROP POLICY IF EXISTS "read own or admin reads all app_users" ON app_users;
CREATE POLICY "read own or admin reads all app_users" ON app_users
    FOR SELECT USING (id = auth.uid() OR is_app_admin());

DROP POLICY IF EXISTS "admins write app_users" ON app_users;
CREATE POLICY "admins write app_users" ON app_users
    FOR ALL USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "read own or admin reads all permissions" ON user_page_permissions;
CREATE POLICY "read own or admin reads all permissions" ON user_page_permissions
    FOR SELECT USING (user_id = auth.uid() OR is_app_admin());

DROP POLICY IF EXISTS "admins write permissions" ON user_page_permissions;
CREATE POLICY "admins write permissions" ON user_page_permissions
    FOR ALL USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "read own or admin reads all windows" ON user_edit_windows;
CREATE POLICY "read own or admin reads all windows" ON user_edit_windows
    FOR SELECT USING (user_id = auth.uid() OR is_app_admin());

DROP POLICY IF EXISTS "admins write windows" ON user_edit_windows;
CREATE POLICY "admins write windows" ON user_edit_windows
    FOR ALL USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "admins read permission audit" ON permission_audit_log;
CREATE POLICY "admins read permission audit" ON permission_audit_log
    FOR SELECT USING (is_app_admin());

DROP POLICY IF EXISTS "admins write permission audit" ON permission_audit_log;
CREATE POLICY "admins write permission audit" ON permission_audit_log
    FOR INSERT WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "admins read data edit log" ON data_edit_log;
CREATE POLICY "admins read data edit log" ON data_edit_log
    FOR SELECT USING (is_app_admin());

-- Any signed-in user may append their own edit record — it is a trail, not a
-- privilege, and a user must not be able to write it in someone else's name.
DROP POLICY IF EXISTS "users append own data edit log" ON data_edit_log;
CREATE POLICY "users append own data edit log" ON data_edit_log
    FOR INSERT WITH CHECK (user_id = auth.uid() AND is_active_app_user());

-- ── 5. RLS on the data tables ────────────────────────────────────────────────
-- Every old "Authenticated users can do everything on X" policy is swept away
-- and replaced with view/modify/date-aware ones.

DO $$
DECLARE
    t TEXT;
    pol RECORD;
    -- Dated tables, grouped by the page that owns them
    entry_tables TEXT[] := ARRAY[
        'daily_workforce', 'daily_processing', 'daily_sanitization',
        'yield_entries', 'non_local_ladies', 'hl_va_entries',
        'daily_grading_data', 'grades_va'
    ];
    ladies_tables TEXT[] := ARRAY['local_ladies_attendance'];
    perhead_tables TEXT[] := ARRAY['local_ladies_per_head_amount'];
    -- Undated reference tables: readable by anyone signed in, admin-writable
    reference_tables TEXT[] := ARRAY['locations', 'local_ladies_batches'];
BEGIN
    -- Drop every pre-existing policy on the tables we are taking over
    FOREACH t IN ARRAY entry_tables || ladies_tables || perhead_tables || reference_tables
        || ARRAY['daily_supervisor_assignments', 'supervisors', 'monthly_targets',
                 'maintenance_tasks', 'maintenance_task_followups', 'app_settings']
    LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
        END LOOP;
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;

    -- Daily-entry tables: view gates reads, can_edit_on gates every write
    FOREACH t IN ARRAY entry_tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        EXECUTE format($f$
            CREATE POLICY "view daily-entry" ON %I FOR SELECT
                USING (can_view_page('daily-entry') OR can_view_page('dashboard')
                       OR can_view_page('analytics') OR can_view_page('yield-report'));
            CREATE POLICY "insert daily-entry" ON %I FOR INSERT
                WITH CHECK (can_edit_on('daily-entry', work_date));
            CREATE POLICY "update daily-entry" ON %I FOR UPDATE
                USING (can_edit_on('daily-entry', work_date))
                WITH CHECK (can_edit_on('daily-entry', work_date));
            CREATE POLICY "delete daily-entry" ON %I FOR DELETE
                USING (can_edit_on('daily-entry', work_date));
        $f$, t, t, t, t);
    END LOOP;

    FOREACH t IN ARRAY ladies_tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        EXECUTE format($f$
            CREATE POLICY "view ladies attendance" ON %I FOR SELECT
                USING (can_view_page('local-ladies-attendance') OR can_view_page('analytics'));
            CREATE POLICY "insert ladies attendance" ON %I FOR INSERT
                WITH CHECK (can_edit_on('local-ladies-attendance', work_date));
            CREATE POLICY "update ladies attendance" ON %I FOR UPDATE
                USING (can_edit_on('local-ladies-attendance', work_date))
                WITH CHECK (can_edit_on('local-ladies-attendance', work_date));
            CREATE POLICY "delete ladies attendance" ON %I FOR DELETE
                USING (can_edit_on('local-ladies-attendance', work_date));
        $f$, t, t, t, t);
    END LOOP;

    FOREACH t IN ARRAY perhead_tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        EXECUTE format($f$
            CREATE POLICY "view per head amount" ON %I FOR SELECT
                USING (can_view_page('ladies-per-head-amount')
                       OR can_view_page('local-ladies-attendance') OR can_view_page('analytics'));
            CREATE POLICY "insert per head amount" ON %I FOR INSERT
                WITH CHECK (can_edit_on('ladies-per-head-amount', work_date));
            CREATE POLICY "update per head amount" ON %I FOR UPDATE
                USING (can_edit_on('ladies-per-head-amount', work_date))
                WITH CHECK (can_edit_on('ladies-per-head-amount', work_date));
            CREATE POLICY "delete per head amount" ON %I FOR DELETE
                USING (can_edit_on('ladies-per-head-amount', work_date));
        $f$, t, t, t, t);
    END LOOP;

    -- Reference data: everyone signed in reads, admins maintain
    FOREACH t IN ARRAY reference_tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
        EXECUTE format($f$
            CREATE POLICY "read reference" ON %I FOR SELECT USING (is_active_app_user());
            CREATE POLICY "admins write reference" ON %I FOR ALL
                USING (is_app_admin()) WITH CHECK (is_app_admin());
        $f$, t, t);
    END LOOP;
END $$;

-- Supervisor assignments — dated, reachable from two pages
CREATE POLICY "view supervisor assignments" ON daily_supervisor_assignments FOR SELECT
    USING (can_view_page('supervisors') OR can_view_page('daily-entry') OR can_view_page('dashboard'));
CREATE POLICY "insert supervisor assignments" ON daily_supervisor_assignments FOR INSERT
    WITH CHECK (can_edit_assignment_on(work_date));
CREATE POLICY "update supervisor assignments" ON daily_supervisor_assignments FOR UPDATE
    USING (can_edit_assignment_on(work_date)) WITH CHECK (can_edit_assignment_on(work_date));
CREATE POLICY "delete supervisor assignments" ON daily_supervisor_assignments FOR DELETE
    USING (can_edit_assignment_on(work_date));

-- The supervisor roster itself is undated: modify right on the page is enough
CREATE POLICY "view supervisors" ON supervisors FOR SELECT USING (is_active_app_user());
CREATE POLICY "modify supervisors" ON supervisors FOR ALL
    USING (can_modify_page('supervisors')) WITH CHECK (can_modify_page('supervisors'));

-- Monthly targets are set from Analytics; undated in the work-date sense
CREATE POLICY "view monthly targets" ON monthly_targets FOR SELECT
    USING (can_view_page('analytics') OR can_view_page('dashboard'));
CREATE POLICY "modify monthly targets" ON monthly_targets FOR ALL
    USING (can_modify_page('analytics')) WITH CHECK (can_modify_page('analytics'));

CREATE POLICY "view maintenance tasks" ON maintenance_tasks FOR SELECT
    USING (can_view_page('maintenance-tasks') OR can_view_page('settings'));
CREATE POLICY "modify maintenance tasks" ON maintenance_tasks FOR ALL
    USING (can_modify_page('maintenance-tasks')) WITH CHECK (can_modify_page('maintenance-tasks'));

CREATE POLICY "view maintenance followups" ON maintenance_task_followups FOR SELECT
    USING (can_view_page('maintenance-tasks') OR can_view_page('settings'));
CREATE POLICY "modify maintenance followups" ON maintenance_task_followups FOR ALL
    USING (can_modify_page('maintenance-tasks')) WITH CHECK (can_modify_page('maintenance-tasks'));

-- app_settings: same intent as migration 026, but role-driven instead of a
-- hardcoded email list that has to be kept in sync by hand.
CREATE POLICY "read app_settings" ON app_settings FOR SELECT USING (is_active_app_user());
CREATE POLICY "admins write app_settings" ON app_settings FOR ALL
    USING (is_app_admin()) WITH CHECK (is_app_admin());

-- PostgREST caches the schema; make the new tables and functions visible now.
NOTIFY pgrst, 'reload schema';

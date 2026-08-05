-- ============================================
-- 026: APP SETTINGS + COMPANY LADIES SALARY BASIC
--
-- 1. app_settings — small key/value store for admin-editable app constants.
--    Only admins (anyone NOT in the sub-user email list) may write.
-- 2. non_local_ladies.salary_basic — snapshots the basic rate that was in
--    force when the day's entries were saved, so changing the setting later
--    never rewrites the Difference / P&L of past days.
--
-- Safe to run more than once.
-- ============================================

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

CREATE OR REPLACE FUNCTION update_app_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_settings_updated ON app_settings;
CREATE TRIGGER trg_app_settings_updated
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_app_settings_timestamp();

-- The rate the app has always used for Company (Non Local) Ladies.
INSERT INTO app_settings (key, value)
VALUES ('nl_ladies_salary_basic', '350')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read settings…
DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON app_settings;
CREATE POLICY "Authenticated users can read app_settings"
    ON app_settings FOR SELECT USING (auth.role() = 'authenticated');

-- …but only admins can change them. Sub-users (staff accounts) are blocked.
-- Keep this list in sync with src/lib/auth/subUsers.ts.
DROP POLICY IF EXISTS "Admins can update app_settings" ON app_settings;
CREATE POLICY "Admins can update app_settings"
    ON app_settings FOR UPDATE
    USING (
        auth.role() = 'authenticated'
        AND lower(coalesce(auth.jwt() ->> 'email', '')) NOT IN (
            'ramakrishna@ppc.com', 'sairam@ppc.com', 'manisha@ppc.com'
        )
    );

DROP POLICY IF EXISTS "Admins can insert app_settings" ON app_settings;
CREATE POLICY "Admins can insert app_settings"
    ON app_settings FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND lower(coalesce(auth.jwt() ->> 'email', '')) NOT IN (
            'ramakrishna@ppc.com', 'sairam@ppc.com', 'manisha@ppc.com'
        )
    );

-- ── Per-row snapshot of the basic rate ───────────────────────────────────────
-- Existing rows were all entered under the ₹350 rate, so the default records
-- what actually applied rather than restating history.
ALTER TABLE non_local_ladies
    ADD COLUMN IF NOT EXISTS salary_basic DECIMAL(10, 2) NOT NULL DEFAULT 350;

-- PostgREST caches the schema; tell it to reload so the new table/column are
-- visible immediately instead of after the next restart.
NOTIFY pgrst, 'reload schema';

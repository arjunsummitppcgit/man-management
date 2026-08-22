-- ============================================
-- 032: ADMIN-EDITABLE STANDARD YIELD CHARTS
--
-- The two standard yield charts — HON to HL by count band, and HL to VA by
-- count band and variety group — were constants compiled into the app. Sizes
-- and processes move, and only a developer could move the standards with them.
-- Admins can now edit the percentages from the Daily Entry panels; everyone
-- else keeps the read-only view they have today.
--
-- The bands themselves (22-40, 41-60, 13/15 …) stay in code. They are not just
-- labels: `yield_entries.count_range` and `hl_va_entries.grade` are stamped
-- from them at save time, so a band whose bounds moved would leave stored
-- labels pointing at a range that no longer exists. Percentages carry no such
-- tail, which is why they are the editable half.
--
-- Two parts:
--   1. Where the edited percentages live — app_settings, one JSON row per
--      chart. No new table, and migration 027 already gates writes on
--      is_app_admin().
--   2. std_yield on both registers, so editing the chart never rewrites what
--      a past day was measured against.
-- ============================================

-- ─── The standard each row was actually measured against ────────────────────
--
-- Stamped from the chart in force at save time, the same idea as
-- non_local_ladies.salary_basic in migration 026: a figure that decides how
-- history reads has to be recorded with the history, not looked up afresh
-- every time the reader opens the page.
--
-- Deliberately nullable and deliberately NOT backfilled. NULL means "saved
-- before the chart could be edited", and the app reads those rows against the
-- shipped constants — which is exactly what applied to them. Writing a number
-- into 5,000 old rows would assert the same thing less honestly, and would be
-- wrong the moment one of the shipped values turned out to be misremembered.
ALTER TABLE yield_entries
    ADD COLUMN IF NOT EXISTS std_yield DECIMAL(5, 2);

COMMENT ON COLUMN yield_entries.std_yield IS
    'HON->HL standard yield % in force when this row was saved. NULL = saved before migration 032; read it against the shipped chart in src/lib/yieldChart.ts.';

-- HL to VA resolves against count *and* variety group (PD / PDTO / EZPL), so
-- the stamp records the number that was picked, not the inputs to picking it.
ALTER TABLE hl_va_entries
    ADD COLUMN IF NOT EXISTS std_yield DECIMAL(5, 2);

COMMENT ON COLUMN hl_va_entries.std_yield IS
    'HL->VA standard yield % in force when this row was saved, for its count band and variety group. NULL = saved before migration 032; read it against the shipped chart in src/lib/hlVa.ts.';

-- ─── Where the edits live ───────────────────────────────────────────────────
--
-- One app_settings row per chart, holding a JSON object keyed by band label:
--
--   hon_hl_standard_yield  {"22-40": 71, "41-60": 70, ...}
--   hl_va_standard_yield   {"13/15": {"pd": 83, "pdto": 89, "ezpl": 99.5}, ...}
--
-- Nothing is seeded. An absent key means "nobody has edited this chart", and
-- the app falls through to the shipped constants — so the app behaves
-- identically the moment this migration lands, and a key that only ever holds
-- the bands an admin actually touched cannot drift out of step with the band
-- list in code.
--
-- Reads and writes are already governed: migration 027 replaced 026's
-- hardcoded email list with `read app_settings` (any active user) and
-- `admins write app_settings` (is_app_admin()). Nothing to add here — this
-- comment exists so the next reader doesn't go looking for the missing policy.

NOTIFY pgrst, 'reload schema';

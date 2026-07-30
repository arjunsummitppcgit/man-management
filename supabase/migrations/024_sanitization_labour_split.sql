-- ============================================
-- Migration 024: Sanitization Labour Split
-- Replaces the Cleaning Labour and NMR Labour
-- headcounts on daily_sanitization with three
-- new headcounts:
--   Outside Cleaning
--   Local Crates Wash
--   Company Crates Wash
--
-- cleaning_labour and nmr_labour are NOT dropped.
-- Historical entries keep their values so past
-- dates still report accurately; the app simply
-- stops offering them on the daily-entry form and
-- shows them on the dashboard only when an older
-- date still carries a non-zero figure.
--
-- Note these are headcounts (people), distinct
-- from the existing crates_cleaning column, which
-- is a quantity (crates washed) and is unchanged.
-- ============================================

ALTER TABLE daily_sanitization
    ADD COLUMN IF NOT EXISTS outside_cleaning     INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS local_crates_wash    INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS company_crates_wash  INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN daily_sanitization.outside_cleaning IS
    'Outside cleaning headcount. Replaces cleaning_labour from migration 024 on.';
COMMENT ON COLUMN daily_sanitization.local_crates_wash IS
    'Local crates wash headcount (people, not crates).';
COMMENT ON COLUMN daily_sanitization.company_crates_wash IS
    'Company crates wash headcount (people, not crates).';
COMMENT ON COLUMN daily_sanitization.cleaning_labour IS
    'Retired by migration 024 in favour of outside_cleaning. Kept for historical dates; no longer written by the app.';
COMMENT ON COLUMN daily_sanitization.nmr_labour IS
    'Retired by migration 024 in favour of the crates-wash split. Kept for historical dates; no longer written by the app.';

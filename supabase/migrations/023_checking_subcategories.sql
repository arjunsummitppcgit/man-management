-- ============================================
-- Migration 023: Checking Sub-Categories
-- Splits the single Checking headcount into
-- Waste Checking and PD Checking on
-- daily_workforce.
--
-- Historical data is deliberately left alone:
-- rows entered before this split keep their
-- lumped value in checking_count, and both new
-- columns stay 0 for them. That is why the
-- trigger does NOT derive checking_count from
-- the sub-categories the way it does for
-- labour_count — doing so would silently zero
-- every historical Checking figure (and drop
-- total_headcount with it) on the next update
-- of an old row.
--
-- Going forward the app writes
-- checking_count = checking_waste + checking_pd
-- on every save, so the total stays correct for
-- newly entered dates. The daily-entry form
-- folds any pre-split remainder into PD
-- Checking when an old date is reopened, so
-- re-saving a legacy row preserves its total.
-- ============================================

ALTER TABLE daily_workforce
    ADD COLUMN IF NOT EXISTS checking_waste INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS checking_pd    INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN daily_workforce.checking_waste IS
    'Waste checking headcount. Part of checking_count.';
COMMENT ON COLUMN daily_workforce.checking_pd IS
    'PD checking headcount. Part of checking_count.';
COMMENT ON COLUMN daily_workforce.checking_count IS
    'Total checking headcount. From migration 023 onward this equals checking_waste + checking_pd; rows predating that split hold an unsplit total with both sub-columns at 0.';

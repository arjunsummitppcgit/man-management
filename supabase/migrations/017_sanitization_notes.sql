-- ============================================
-- 017: DAILY SANITIZATION NOTES
-- Free-text note about the day, entered on the sanitization tab.
-- Shown on the dashboard only when non-empty.
-- ============================================

ALTER TABLE daily_sanitization
    ADD COLUMN IF NOT EXISTS notes TEXT;

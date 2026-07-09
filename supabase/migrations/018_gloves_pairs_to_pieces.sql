-- ============================================
-- 018: GLOVES PAIRS -> PIECES
-- The gloves entry field now records pieces directly instead of pairs
-- (the dashboard already displayed pieces = pairs * 2). Double every
-- existing value once so historical data stays consistent with new
-- piece-wise entries. One-time data migration — do not re-run.
-- ============================================

UPDATE daily_sanitization
SET gloves = gloves * 2;

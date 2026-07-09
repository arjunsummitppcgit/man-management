-- ============================================
-- 016: GRADING MACHINE CLEANING CHEMICALS
-- Adds chlorine + soap oil consumption columns for grading machine cleaning,
-- matching the existing PPC / Crates / Washrooms chemical columns.
-- ============================================

ALTER TABLE daily_sanitization
    ADD COLUMN IF NOT EXISTS chlorine_grading_machine  DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS soap_oil_grading_machine  DECIMAL(10,2) NOT NULL DEFAULT 0;

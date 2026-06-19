-- ============================================
-- Migration 007: Update Weight Columns Precision
-- Alters target and daily processing columns to
-- DECIMAL(12,3) to support 3 decimal places (1g accuracy).
-- ============================================

-- 1. Alter monthly_targets table
ALTER TABLE monthly_targets
    ALTER COLUMN target_kg TYPE DECIMAL(12,3);

-- 2. Alter daily_processing table
ALTER TABLE daily_processing
    ALTER COLUMN processed_kg TYPE DECIMAL(12,3),
    ALTER COLUMN hon_to_headless TYPE DECIMAL(12,3),
    ALTER COLUMN headless_to_va TYPE DECIMAL(12,3),
    ALTER COLUMN wip_hon_to_headless TYPE DECIMAL(12,3),
    ALTER COLUMN wip_headless_to_va TYPE DECIMAL(12,3),
    ALTER COLUMN work_in_process_qty TYPE DECIMAL(12,3);

-- ============================================
-- Migration 003: Processing Sub-Categories
-- Adds HON to Headless and Headless to VA columns
-- to daily_processing table.
-- processed_kg is auto-computed as the sum of
-- these two sub-categories via a DB trigger.
-- ============================================

ALTER TABLE daily_processing
    ADD COLUMN IF NOT EXISTS hon_to_headless  DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS headless_to_va   DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Trigger function: auto-compute processed_kg from sub-categories
CREATE OR REPLACE FUNCTION compute_processed_kg()
RETURNS TRIGGER AS $$
BEGIN
    NEW.processed_kg := NEW.hon_to_headless + NEW.headless_to_va;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists, then recreate
DROP TRIGGER IF EXISTS trg_compute_processed_kg ON daily_processing;

CREATE TRIGGER trg_compute_processed_kg
    BEFORE INSERT OR UPDATE ON daily_processing
    FOR EACH ROW
    EXECUTE FUNCTION compute_processed_kg();

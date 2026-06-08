-- ============================================
-- Migration 002: Labour Sub-Categories
-- Adds KG Basic, Daily Wage, Company, Non Locals
-- columns to daily_workforce table.
-- The labour_count is now auto-computed as the
-- sum of these four sub-categories.
-- ============================================

ALTER TABLE daily_workforce
    ADD COLUMN IF NOT EXISTS labour_kg_basic    INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS labour_daily_wage  INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS labour_company     INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS labour_non_locals  INT NOT NULL DEFAULT 0;

-- Update the trigger to also recompute labour_count from sub-categories
-- and total_headcount from all categories.
CREATE OR REPLACE FUNCTION compute_total_headcount()
RETURNS TRIGGER AS $$
BEGIN
    -- Labour total = sum of four sub-categories
    NEW.labour_count := NEW.labour_kg_basic + NEW.labour_daily_wage + NEW.labour_company + NEW.labour_non_locals;

    -- Overall headcount = all categories
    NEW.total_headcount :=
        NEW.labour_count +
        NEW.boys_count +
        NEW.checking_count +
        NEW.cleaning_count +
        NEW.qc_count +
        NEW.security_count;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

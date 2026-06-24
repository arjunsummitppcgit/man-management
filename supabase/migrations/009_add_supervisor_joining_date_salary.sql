-- ============================================
-- Migration 009: Add joining_date and salary to supervisors
-- Adds columns to track supervisors' date of joining and salary.
-- ============================================

ALTER TABLE supervisors
    ADD COLUMN IF NOT EXISTS joining_date DATE,
    ADD COLUMN IF NOT EXISTS salary NUMERIC;

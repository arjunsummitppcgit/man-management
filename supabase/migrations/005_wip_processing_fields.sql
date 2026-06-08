-- ============================================
-- Migration 005: WIP Processing Sub-Categories
-- Restructures processing into 4 fields:
--   wip_hon_to_headless  - Work In Process HON to Headless
--   wip_headless_to_va   - Work In Process Headless to VA
--   hon_to_headless      - Completed HON to Headless (existing)
--   headless_to_va       - Completed Headless to VA (existing)
-- processed_kg trigger still sums completed fields only.
-- ============================================

ALTER TABLE daily_processing
    ADD COLUMN IF NOT EXISTS wip_hon_to_headless  DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS wip_headless_to_va   DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Migrate any existing work_in_process_qty data into wip_hon_to_headless
UPDATE daily_processing SET wip_hon_to_headless = work_in_process_qty WHERE work_in_process_qty > 0;

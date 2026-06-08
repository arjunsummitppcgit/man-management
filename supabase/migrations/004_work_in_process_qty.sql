-- ============================================
-- Migration 004: Work In Process Quantity
-- Adds work_in_process_qty column to
-- daily_processing table.
-- This is a standalone quantity field and is
-- NOT included in the processed_kg trigger sum.
-- ============================================

ALTER TABLE daily_processing
    ADD COLUMN IF NOT EXISTS work_in_process_qty  DECIMAL(10,2) NOT NULL DEFAULT 0;

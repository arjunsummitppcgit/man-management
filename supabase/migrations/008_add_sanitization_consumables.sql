-- ============================================
-- Migration 008: Add Sanitization Consumables
-- Adds columns to track split chemicals and PPE materials used.
-- ============================================

ALTER TABLE daily_sanitization
    -- Chlorine split
    ADD COLUMN IF NOT EXISTS chlorine_ppc         DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS chlorine_crates      DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS chlorine_washrooms   DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- Soap Oil split
    ADD COLUMN IF NOT EXISTS soap_oil_ppc         DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS soap_oil_crates      DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS soap_oil_washrooms   DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- General PPE
    ADD COLUMN IF NOT EXISTS gloves               INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS head_cap             INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS masks                INT NOT NULL DEFAULT 0;

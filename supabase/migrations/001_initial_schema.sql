-- ============================================
-- PPC Prawn Processing Management App
-- Initial Database Schema Migration
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. LOCATIONS
-- ============================================
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 4 locations
INSERT INTO locations (name, code, sort_order) VALUES
    ('PPC 1', 'ppc1', 1),
    ('PPC 2', 'ppc2', 2),
    ('PPC 3', 'ppc3', 3),
    ('PPC 4', 'ppc4', 4);

-- ============================================
-- 2. SUPERVISORS
-- ============================================
CREATE TABLE supervisors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supervisors_active ON supervisors(is_active);

-- ============================================
-- 3. DAILY WORKFORCE
-- ============================================
CREATE TABLE daily_workforce (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    labour_count INT NOT NULL DEFAULT 0,
    boys_count INT NOT NULL DEFAULT 0,
    checking_count INT NOT NULL DEFAULT 0,
    cleaning_count INT NOT NULL DEFAULT 0,
    qc_count INT NOT NULL DEFAULT 0,
    security_count INT NOT NULL DEFAULT 0,
    total_headcount INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(work_date, location_id)
);

CREATE INDEX idx_daily_workforce_date ON daily_workforce(work_date);
CREATE INDEX idx_daily_workforce_location ON daily_workforce(location_id);

-- Auto-compute total_headcount
CREATE OR REPLACE FUNCTION compute_total_headcount()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_headcount := NEW.labour_count + NEW.boys_count + NEW.checking_count + NEW.cleaning_count + NEW.qc_count + NEW.security_count;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compute_headcount
    BEFORE INSERT OR UPDATE ON daily_workforce
    FOR EACH ROW
    EXECUTE FUNCTION compute_total_headcount();

-- ============================================
-- 4. DAILY SUPERVISOR ASSIGNMENTS
-- ============================================
CREATE TABLE daily_supervisor_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    supervisor_id UUID NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
    is_present BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(work_date, location_id, supervisor_id)
);

CREATE INDEX idx_supervisor_assignments_date ON daily_supervisor_assignments(work_date);
CREATE INDEX idx_supervisor_assignments_supervisor ON daily_supervisor_assignments(supervisor_id);
CREATE INDEX idx_supervisor_assignments_location ON daily_supervisor_assignments(location_id);

-- ============================================
-- 5. DAILY SANITIZATION
-- ============================================
CREATE TABLE daily_sanitization (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    cleaning_labour INT NOT NULL DEFAULT 0,
    crates_cleaning INT NOT NULL DEFAULT 0,
    nets_cleaning INT NOT NULL DEFAULT 0,
    nmr_labour INT NOT NULL DEFAULT 0,
    washroom_cleaning INT NOT NULL DEFAULT 0,
    grading_machine_cleaning INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(work_date, location_id)
);

CREATE INDEX idx_daily_sanitization_date ON daily_sanitization(work_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_sanitization_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sanitization_updated
    BEFORE UPDATE ON daily_sanitization
    FOR EACH ROW
    EXECUTE FUNCTION update_sanitization_timestamp();

-- ============================================
-- 6. MONTHLY TARGETS
-- Combined target + per-location targets
-- location_id = NULL means combined target for all locations
-- location_id = UUID means target for that specific location
-- ============================================
CREATE TABLE monthly_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
    target_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(year, month, location_id)
);

-- For combined target (location_id IS NULL), we need a partial unique index
CREATE UNIQUE INDEX idx_monthly_targets_combined
    ON monthly_targets(year, month)
    WHERE location_id IS NULL;

CREATE INDEX idx_monthly_targets_period ON monthly_targets(year, month);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_target_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_target_updated
    BEFORE UPDATE ON monthly_targets
    FOR EACH ROW
    EXECUTE FUNCTION update_target_timestamp();

-- ============================================
-- 7. DAILY PROCESSING
-- ============================================
CREATE TABLE daily_processing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    processed_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(work_date, location_id)
);

CREATE INDEX idx_daily_processing_date ON daily_processing(work_date);
CREATE INDEX idx_daily_processing_location ON daily_processing(location_id);
CREATE INDEX idx_daily_processing_month ON daily_processing(
    EXTRACT(YEAR FROM work_date),
    EXTRACT(MONTH FROM work_date)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_processing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_processing_updated
    BEFORE UPDATE ON daily_processing
    FOR EACH ROW
    EXECUTE FUNCTION update_processing_timestamp();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS on all tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_workforce ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_supervisor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sanitization ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_processing ENABLE ROW LEVEL SECURITY;

-- Policies: Allow all operations for authenticated users (manager)
CREATE POLICY "Authenticated users can do everything on locations"
    ON locations FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on supervisors"
    ON supervisors FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on daily_workforce"
    ON daily_workforce FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on daily_supervisor_assignments"
    ON daily_supervisor_assignments FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on daily_sanitization"
    ON daily_sanitization FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on monthly_targets"
    ON monthly_targets FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on daily_processing"
    ON daily_processing FOR ALL USING (auth.role() = 'authenticated');

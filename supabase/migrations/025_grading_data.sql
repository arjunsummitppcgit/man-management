-- ============================================
-- 025: ALL PPC'S GRADING DATA
-- Daily grading register: start/stop time and
-- graded quantity per grading unit, plus the
-- free-text boys-timing lines that share the
-- same printed table.
--
-- One row per (work_date, unit_key). unit_key
-- comes from the fixed GRADING_UNITS list in
-- src/lib/grading.ts, which also decides whether
-- a row is a timed machine row (start/stop/qty)
-- or a free-text note row (note only) — that is
-- why every value column here is nullable.
--
-- Not location-scoped: the register covers all
-- PPCs at once, and the units mix a location
-- (PPC 1) with two machines at Plant.
-- ============================================

CREATE TABLE daily_grading_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    unit_key TEXT NOT NULL,
    start_time TIME,
    stop_time TIME,
    total_grading_qty DECIMAL(10, 3),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_date, unit_key)
);

CREATE INDEX idx_daily_grading_data_date ON daily_grading_data(work_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_daily_grading_data_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_grading_data_updated
    BEFORE UPDATE ON daily_grading_data
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_grading_data_timestamp();

-- Enable RLS
ALTER TABLE daily_grading_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on daily_grading_data"
    ON daily_grading_data FOR ALL USING (auth.role() = 'authenticated');

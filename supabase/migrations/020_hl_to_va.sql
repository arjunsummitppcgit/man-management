-- ============================================
-- 020: HL TO VA ENTRIES
-- Replaces the old Grades vs V/A grid with batch-level
-- HL -> VA entries (like yield_entries but HL -> VA).
-- Grade / Std % are auto-derived from Count via the
-- constant standard yield chart in the app.
-- ============================================

-- Remove the old Grades vs V/A feature (table + data)
DROP TABLE IF EXISTS grades_va;
DROP FUNCTION IF EXISTS update_grades_va_timestamp();

CREATE TABLE hl_va_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    batch_id TEXT NOT NULL,
    count_text TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT '',
    variety TEXT NOT NULL DEFAULT '',
    hl_kgs DECIMAL(10, 3) NOT NULL DEFAULT 0,
    va_kgs DECIMAL(10, 3) NOT NULL DEFAULT 0,
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
    grader_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hl_va_entries_date ON hl_va_entries(work_date);
CREATE INDEX idx_hl_va_entries_location ON hl_va_entries(location_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_hl_va_entry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hl_va_entry_updated
    BEFORE UPDATE ON hl_va_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_hl_va_entry_timestamp();

-- Enable RLS
ALTER TABLE hl_va_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on hl_va_entries"
    ON hl_va_entries FOR ALL USING (auth.role() = 'authenticated');

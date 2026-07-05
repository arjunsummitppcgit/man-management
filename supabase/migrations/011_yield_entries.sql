-- ============================================
-- 011: YIELD ENTRIES
-- Daily yield report with batch-level data
-- ============================================

CREATE TABLE yield_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    batch_id TEXT NOT NULL,
    count_text TEXT NOT NULL DEFAULT '',
    count_range TEXT NOT NULL DEFAULT '',
    hon_kgs DECIMAL(10, 3) NOT NULL DEFAULT 0,
    hl_kgs DECIMAL(10, 3) NOT NULL DEFAULT 0,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    grader_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(work_date, batch_id)
);

CREATE INDEX idx_yield_entries_date ON yield_entries(work_date);
CREATE INDEX idx_yield_entries_location ON yield_entries(location_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_yield_entry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yield_entry_updated
    BEFORE UPDATE ON yield_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_yield_entry_timestamp();

-- Enable RLS
ALTER TABLE yield_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on yield_entries"
    ON yield_entries FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- 012: NON LOCAL LADIES
-- Daily report for non-local ladies contractor data
-- ============================================

CREATE TABLE non_local_ladies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    batch_name TEXT NOT NULL,
    no_of_ladies INTEGER NOT NULL DEFAULT 0,
    hl_qty DECIMAL(10, 3) NOT NULL DEFAULT 0,
    pd_qty DECIMAL(10, 3) NOT NULL DEFAULT 0,
    per_head_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_non_local_ladies_date ON non_local_ladies(work_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_non_local_ladies_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_non_local_ladies_updated
    BEFORE UPDATE ON non_local_ladies
    FOR EACH ROW
    EXECUTE FUNCTION update_non_local_ladies_timestamp();

-- Enable RLS
ALTER TABLE non_local_ladies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on non_local_ladies"
    ON non_local_ladies FOR ALL USING (auth.role() = 'authenticated');

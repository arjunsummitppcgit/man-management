-- ============================================
-- 013: GRADES VS VALUE ADDITION (V/A)
-- Daily grade-wise value addition quantities
-- ============================================

CREATE TABLE grades_va (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    grade TEXT NOT NULL,
    pd DECIMAL(12, 3) NOT NULL DEFAULT 0,
    pdto DECIMAL(12, 3) NOT NULL DEFAULT 0,
    ezpl DECIMAL(12, 3) NOT NULL DEFAULT 0,
    pvpd DECIMAL(12, 3) NOT NULL DEFAULT 0,
    pvpdto DECIMAL(12, 3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_date, grade)
);

CREATE INDEX idx_grades_va_date ON grades_va(work_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_grades_va_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grades_va_updated
    BEFORE UPDATE ON grades_va
    FOR EACH ROW
    EXECUTE FUNCTION update_grades_va_timestamp();

-- Enable RLS
ALTER TABLE grades_va ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on grades_va"
    ON grades_va FOR ALL USING (auth.role() = 'authenticated');

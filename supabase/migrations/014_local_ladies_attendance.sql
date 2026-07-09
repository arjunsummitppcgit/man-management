-- ============================================
-- 014: LOCAL LADIES ATTENDANCE
-- Monthly attendance grid for local ladies batches per location.
-- Rows = batches, columns = days of month, cell = number of ladies present.
-- Mirrors the daily_supervisor_assignments / monthly-attendance pattern.
-- ============================================

-- Master list of batches (rows in the sheet), scoped to a location
CREATE TABLE local_ladies_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_local_ladies_batches_location ON local_ladies_batches(location_id);

-- Per-day headcount for each batch
CREATE TABLE local_ladies_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    batch_id UUID NOT NULL REFERENCES local_ladies_batches(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    ladies_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_date, batch_id)
);

CREATE INDEX idx_local_ladies_attendance_date ON local_ladies_attendance(work_date);
CREATE INDEX idx_local_ladies_attendance_location ON local_ladies_attendance(location_id);

-- Enable RLS
ALTER TABLE local_ladies_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_ladies_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on local_ladies_batches"
    ON local_ladies_batches FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on local_ladies_attendance"
    ON local_ladies_attendance FOR ALL USING (auth.role() = 'authenticated');

-- Seed the batch roster from the ELURUPADU PPC 1 June sheet (attached to PPC 1)
INSERT INTO local_ladies_batches (name, location_id, sort_order)
SELECT b.name, l.id, b.sort_order
FROM (VALUES
    ('SAI', 1),
    ('S GOWRI', 2),
    ('R.LAKSHMI', 3),
    ('TIRUMANI KUMARI', 4),
    ('YESUMATHA', 5),
    ('NAGESH', 6),
    ('JAYASRI', 7),
    ('D PADMA', 8),
    ('SOUNDARYA', 9),
    ('VIJAYA', 10),
    ('K.SIVA', 11),
    ('CHAITHRA', 12),
    ('G RAJINI', 13),
    ('BHAVANI', 14),
    ('DEVA', 15),
    ('P SERO MANI', 16),
    ('T. NAGA MANI', 17),
    ('PRIYANKA', 18),
    ('RAMRAJU BENGAL', 19),
    ('BENGAL SULTAN BOYS', 20)
) AS b(name, sort_order)
CROSS JOIN (SELECT id FROM locations WHERE code = 'ppc1' LIMIT 1) AS l;

-- ============================================
-- 015: LADIES PER HEAD AMOUNT
-- Monthly grid of the per-head amount for each ladies batch per day.
-- Shares the batch roster from 014 (local_ladies_batches).
-- On the Daily Report this is multiplied by that day's attendance
-- (local_ladies_attendance.ladies_count) to show a payout.
-- ============================================

CREATE TABLE local_ladies_per_head_amount (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    batch_id UUID NOT NULL REFERENCES local_ladies_batches(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    per_head_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_date, batch_id)
);

CREATE INDEX idx_ladies_per_head_amount_date ON local_ladies_per_head_amount(work_date);
CREATE INDEX idx_ladies_per_head_amount_location ON local_ladies_per_head_amount(location_id);

ALTER TABLE local_ladies_per_head_amount ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on local_ladies_per_head_amount"
    ON local_ladies_per_head_amount FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- 031: DAILY PLAN
--
-- When a harvest lands, the batches have to be shared out before any
-- de-heading starts: which PPC takes which batch for HON -> HL, and how much
-- HL each location is expected to feed into VA that day. Until now that was
-- decided on paper and never reached the app, so the registers could only ever
-- say what happened, never what was meant to happen.
--
-- Two tables, both keyed on the work date alone — a plan spans every location
-- at once, which is the whole point of it, so location is a column and not a
-- scope.
--
--   daily_plan_hon_hl  one row per batch sent to a location
--   daily_plan_hl_va   one row per location taking HL for VA
--
-- These are intentions, not measurements. Nothing here feeds processed_kg or
-- any of the yield maths — the HONS TO HL and HL to VA registers keep owning
-- the actuals (migration 029). The Daily Report reads both sides and shows the
-- variance.
-- ============================================

-- ─── HON to HL: batch-wise allocation ───────────────────────────────────────
--
-- No unique key on (work_date, batch_name): one harvest batch is regularly
-- split across two PPCs — 3,000 kg to PPC 1 and 2,000 kg to PPC 2 is two rows
-- naming the same batch, and the plan has to be able to say that.
CREATE TABLE daily_plan_hon_hl (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    batch_name TEXT NOT NULL,
    -- Prawn count, same free text as the registers use ('30-40'), so the plan
    -- and the register that follows it read alike.
    count_text TEXT NOT NULL DEFAULT '',
    -- HON kgs planned into this location: the stage *input*, matching
    -- yield_entries.hon_kgs, which is what the variance is measured against.
    planned_qty DECIMAL(10, 3) NOT NULL DEFAULT 0,
    -- Boxes the quantity arrives in. Counted on the floor at unloading, not
    -- derived from the weight — box sizes vary by harvest.
    boxes INTEGER NOT NULL DEFAULT 0,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    -- Keeps the sheet in the order it was planned in; the rows carry no other
    -- natural ordering.
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_plan_hon_hl_date ON daily_plan_hon_hl(work_date);
CREATE INDEX idx_daily_plan_hon_hl_location ON daily_plan_hon_hl(location_id);

-- ─── HL to VA: how much HL each location takes ──────────────────────────────
--
-- One row per location per date — a location cannot be planned two different
-- amounts on the same day, so the unique key holds the form to one box each.
CREATE TABLE daily_plan_hl_va (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    -- HL kgs planned into VA at this location: again the stage input, matching
    -- hl_va_entries.hl_kgs.
    planned_qty DECIMAL(10, 3) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_date, location_id)
);

CREATE INDEX idx_daily_plan_hl_va_date ON daily_plan_hl_va(work_date);

-- ─── updated_at ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_daily_plan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_plan_hon_hl_updated
    BEFORE UPDATE ON daily_plan_hon_hl
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_plan_timestamp();

CREATE TRIGGER trg_daily_plan_hl_va_updated
    BEFORE UPDATE ON daily_plan_hl_va
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_plan_timestamp();

-- ─── Row level security ─────────────────────────────────────────────────────
--
-- Same terms as every other dated Daily Entry table (migration 027): the pages
-- that report on the day may read it, and only someone whose edit window is
-- open for that date may write it.

ALTER TABLE daily_plan_hon_hl ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_plan_hl_va ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['daily_plan_hon_hl', 'daily_plan_hl_va'] LOOP
        EXECUTE format($f$
            CREATE POLICY "view daily-entry" ON %I FOR SELECT
                USING (can_view_page('daily-entry') OR can_view_page('dashboard')
                       OR can_view_page('analytics') OR can_view_page('yield-report'));
            CREATE POLICY "insert daily-entry" ON %I FOR INSERT
                WITH CHECK (can_edit_on('daily-entry', work_date));
            CREATE POLICY "update daily-entry" ON %I FOR UPDATE
                USING (can_edit_on('daily-entry', work_date))
                WITH CHECK (can_edit_on('daily-entry', work_date));
            CREATE POLICY "delete daily-entry" ON %I FOR DELETE
                USING (can_edit_on('daily-entry', work_date));
        $f$, t, t, t, t);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- 029: COMPLETED PROCESSING COMES FROM THE BATCH REGISTERS
-- The two "Completed" figures on Daily Entry -> Processing were keyed in by
-- hand, and were an exact copy of what the graders had already entered:
--
--   daily_processing.hon_to_headless = SUM(yield_entries.hl_kgs)   -- HL produced
--   daily_processing.headless_to_va  = SUM(hl_va_entries.va_kgs)   -- VA produced
--
-- (both per work_date + location; verified against 345 of the 405 stored rows —
-- the rest were typed before the register was finished and never re-typed.)
--
-- The boxes are gone from Daily Entry. These triggers keep the two columns —
-- and processed_kg, which migration 003 derives from them — in step with the
-- HONS TO HL and HL to VA registers instead, so the dashboard, analytics,
-- reports and the assistant all keep reading daily_processing as before.
--
-- Work In Process is untouched: it is a floor reading, not a register total,
-- and is still keyed in by hand.
-- ============================================

-- Recompute one (date, location) pair from the registers.
--
-- An empty register never writes a zero: a date+location with no register rows
-- keeps whatever was typed there before the boxes were removed, so history
-- entered before the registers existed stays readable. Each stage is judged on
-- its own — a location that grades HL to VA but does no de-heading keeps its
-- old hon_to_headless rather than having it wiped.
--
-- The consequence, deliberately accepted: if every register row for a location
-- on a date is deleted, its stored figure stays as it was. That is what makes
-- the app's save-by-delete-then-reinsert safe — the figures never dip to zero
-- between the two requests, and a failed re-insert cannot blank out the day.
CREATE OR REPLACE FUNCTION sync_completed_processing(
    p_work_date DATE,
    p_location_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_hl          DECIMAL(12, 3);
    v_va          DECIMAL(12, 3);
    v_yield_rows  INTEGER;
    v_hlva_rows   INTEGER;
BEGIN
    IF p_work_date IS NULL OR p_location_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(hl_kgs), 0), COUNT(*)
      INTO v_hl, v_yield_rows
      FROM yield_entries
     WHERE work_date = p_work_date
       AND location_id = p_location_id;

    SELECT COALESCE(SUM(va_kgs), 0), COUNT(*)
      INTO v_va, v_hlva_rows
      FROM hl_va_entries
     WHERE work_date = p_work_date
       AND location_id = p_location_id;

    IF v_yield_rows = 0 AND v_hlva_rows = 0 THEN
        RETURN;
    END IF;

    INSERT INTO daily_processing (work_date, location_id, hon_to_headless, headless_to_va)
    VALUES (p_work_date, p_location_id, v_hl, v_va)
    ON CONFLICT (work_date, location_id) DO UPDATE
       SET hon_to_headless = CASE WHEN v_yield_rows > 0
                                  THEN v_hl
                                  ELSE daily_processing.hon_to_headless END,
           headless_to_va  = CASE WHEN v_hlva_rows > 0
                                  THEN v_va
                                  ELSE daily_processing.headless_to_va END;
END;
$$ LANGUAGE plpgsql;

-- Both registers carry work_date and location_id, so one trigger function
-- serves them: whichever row moved, the (date, location) it touched is
-- recomputed from scratch.
CREATE OR REPLACE FUNCTION sync_completed_from_register()
RETURNS TRIGGER AS $$
BEGIN
    -- An edit that moves a batch to another date or location has to settle both
    -- ends, so the pair it left is recomputed as well as the pair it joined.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM sync_completed_processing(OLD.work_date, OLD.location_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM sync_completed_processing(NEW.work_date, NEW.location_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_completed_from_yield ON yield_entries;
CREATE TRIGGER trg_sync_completed_from_yield
    AFTER INSERT OR UPDATE OR DELETE ON yield_entries
    FOR EACH ROW
    EXECUTE FUNCTION sync_completed_from_register();

DROP TRIGGER IF EXISTS trg_sync_completed_from_hl_va ON hl_va_entries;
CREATE TRIGGER trg_sync_completed_from_hl_va
    AFTER INSERT OR UPDATE OR DELETE ON hl_va_entries
    FOR EACH ROW
    EXECUTE FUNCTION sync_completed_from_register();

NOTIFY pgrst, 'reload schema';

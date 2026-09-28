-- ============================================
-- 038: REJECTION (RJ) BATCHES ON THE HL TO VA REGISTER
-- A rejection batch is VA product sent back and re-worked. Until now the floor
-- marked one by typing "RJ" into the Count box ("40 RJ", "31/40RJ", "50R/J",
-- "26/30RJFC"), and on 3 rows by using "RJ" as the Batch ID — 323 rows,
-- 2026-04-14 to 2026-09-27, 8,314 kg of VA. Nothing read the marker, so every
-- one of them was counted as fresh production.
--
-- Agreed with the client 2026-09-28:
--   * RJ is its own tick box on the register (is_rejection), not a spelling.
--     The Batch ID stays the real batch id so Batch Pipeline, the RZ / Summit
--     split and the plan all still find it; the app shows it as "<batch> RJ".
--   * Re-work is NOT counted as production a second time: Completed VA
--     (daily_processing.headless_to_va), VA Target, Head Waste and Plan vs
--     Actual exclude it. It is reported on its own instead.
--   * RJ rows are measured against the same Standard Yield chart — std_yield
--     stamping is unchanged.
--   * The 323 rows already marked RJ are tagged too. Their typed Count / Batch
--     text is left exactly as it was; only the new flag is set.
--
-- Safe to run more than once.
-- ============================================

-- ── 1. The flag ─────────────────────────────────────────────────────────────
ALTER TABLE hl_va_entries
    ADD COLUMN IF NOT EXISTS is_rejection BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_hl_va_entries_rejection
    ON hl_va_entries(work_date)
    WHERE is_rejection;

-- ── 2. The floor's own marker always means RJ ───────────────────────────────
-- Whatever writes the row — the Daily Entry form, a tab left open on the old
-- build, a hand edit — a Count that says RJ / R J / R/J, or a Batch ID that
-- ends in one, is a rejection. This only ever sets the flag, never clears it:
-- a row with no marker is RJ exactly when the box was ticked.
--
-- Same rule as hasRejectionMarker() in src/lib/hlVa.ts — change them together.
-- The marker must not follow a letter, so it can't be read out of a word.
CREATE OR REPLACE FUNCTION hl_va_flag_rejection_marker()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.count_text, '') ~* '(^|[^A-Za-z])R\s*[/.-]?\s*J'
       OR COALESCE(NEW.batch_id, '') ~* '(^|[^A-Za-z])R\s*[/.-]?\s*J\s*$' THEN
        NEW.is_rejection := TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hl_va_flag_rejection ON hl_va_entries;
CREATE TRIGGER trg_hl_va_flag_rejection
    BEFORE INSERT OR UPDATE ON hl_va_entries
    FOR EACH ROW
    EXECUTE FUNCTION hl_va_flag_rejection_marker();

-- ── 3. Completed VA counts fresh production only ────────────────────────────
-- Migration 029's function, with one change: VA sums only the rows that are
-- not rejections. The row COUNT still takes every row, RJ included, so a
-- location whose day was all re-work reads 0 fresh VA rather than keeping the
-- figure stored before (029 keeps the old figure only for a date with no
-- register rows at all).
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

    SELECT COALESCE(SUM(va_kgs) FILTER (WHERE NOT is_rejection), 0), COUNT(*)
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

-- ── 4. Tag the rows the floor already marked ────────────────────────────────
-- The BEFORE trigger above sets the flag from the marker; the UPDATE only has
-- to touch the rows. Migration 029's AFTER trigger then re-totals each of the
-- 64 date + location pairs involved, which is what takes the 8,314 kg of RJ VA
-- out of Completed VA. (Checked before writing this: every one of those 64
-- stored figures equals its register total today, so nothing else moves.)
--
-- Preview first (changes nothing):
-- SELECT work_date, batch_id, count_text, variety, hl_kgs, va_kgs
--   FROM hl_va_entries
--  WHERE NOT is_rejection
--    AND (count_text ~* '(^|[^A-Za-z])R\s*[/.-]?\s*J'
--         OR batch_id ~* '(^|[^A-Za-z])R\s*[/.-]?\s*J\s*$')
--  ORDER BY work_date;
UPDATE hl_va_entries
   SET is_rejection = TRUE
 WHERE NOT is_rejection
   AND (count_text ~* '(^|[^A-Za-z])R\s*[/.-]?\s*J'
        OR batch_id ~* '(^|[^A-Za-z])R\s*[/.-]?\s*J\s*$');

NOTIFY pgrst, 'reload schema';

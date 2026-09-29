-- ============================================
-- 039: REGISTER SAVES ARE ALL-OR-NOTHING, AND A BATCH MAY GO TO TWO LOCATIONS
--
-- What went wrong (28 Sep 2026): every Daily Entry register saved a day by
-- DELETING the whole date and then INSERTING the form's rows — two separate
-- requests. HONS TO HL also allowed a Batch ID only once per date (011). The
-- plan split 26I27/4 between SME and PPC1, the second 26I27/4 was refused, and
-- by then the delete had already gone through: the whole day was lost.
--
-- Agreed with the client 2026-09-29:
--   1. HONS TO HL: a batch may appear once per LOCATION per day. 26I27/4 at SME
--      and at PPC1 is two real lines; 26I27/4 at SME twice is a mistake.
--   2. Every whole-day register — HONS TO HL, HL to VA, Company Ladies,
--      Grading and the PPC Plan — saves through one function per register that
--      deletes and inserts in a single transaction. If anything is refused,
--      nothing changes and the day's old rows stay exactly as they were.
--   3. Two people can't silently overwrite each other. The app sends the ids
--      of the rows it loaded; if the day was saved by someone else since, the
--      save is refused with STALE_REGISTER instead of wiping their work.
--
-- The functions are SECURITY INVOKER: they run with the caller's own rights,
-- so every RLS rule from 027 / 037 still applies row by row.
--
-- Wrapped in one transaction — if any statement fails, none of it is applied.
-- Safe to run more than once.
-- ============================================

BEGIN;

-- ── 1. HONS TO HL: once per batch per location per day ──────────────────────
-- Batch ids are compared ignoring case and surrounding spaces, the same way the
-- Daily Entry form checks them before it saves.
ALTER TABLE yield_entries DROP CONSTRAINT IF EXISTS yield_entries_work_date_batch_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_yield_entries_day_batch_location
    ON yield_entries (work_date, upper(btrim(batch_id)), location_id);

-- ── 2. "Is the day still what this person loaded?" ──────────────────────────
-- Compares the day's current row ids with the ids the app loaded. Every save
-- re-inserts, so every save changes the ids — any save in between shows up.
CREATE OR REPLACE FUNCTION register_unchanged(p_current UUID[], p_loaded UUID[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
    SELECT (SELECT COALESCE(array_agg(x ORDER BY x), '{}') FROM unnest(p_current) AS x)
         = (SELECT COALESCE(array_agg(x ORDER BY x), '{}') FROM unnest(COALESCE(p_loaded, '{}')) AS x);
$$;

-- ── 3. HONS TO HL ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_yield_entries(
    p_work_date DATE,
    p_rows JSONB,
    p_loaded_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    -- One save of this day at a time; a second one waits, then fails the check
    PERFORM pg_advisory_xact_lock(hashtext('yield_entries'), p_work_date - DATE '2000-01-01');

    IF NOT register_unchanged(
        ARRAY(SELECT id FROM yield_entries WHERE work_date = p_work_date), p_loaded_ids
    ) THEN
        RAISE EXCEPTION 'STALE_REGISTER'
            USING DETAIL = format('HONS TO HL for %s was saved by someone else after it was opened.', p_work_date);
    END IF;

    DELETE FROM yield_entries WHERE work_date = p_work_date;

    INSERT INTO yield_entries
        (work_date, batch_id, count_text, count_range, hon_kgs, hl_kgs, location_id, grader_name, std_yield)
    SELECT p_work_date,
           btrim(e.r->>'batch_id'),
           btrim(COALESCE(e.r->>'count_text', '')),
           COALESCE(e.r->>'count_range', ''),
           COALESCE((e.r->>'hon_kgs')::NUMERIC, 0),
           COALESCE((e.r->>'hl_kgs')::NUMERIC, 0),
           (e.r->>'location_id')::UUID,
           btrim(COALESCE(e.r->>'grader_name', '')),
           (e.r->>'std_yield')::NUMERIC
      FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord)
     ORDER BY e.ord;
END;
$$;

-- ── 4. HL to VA ─────────────────────────────────────────────────────────────
-- The RJ trigger from 038 still runs on every inserted row.
CREATE OR REPLACE FUNCTION save_hl_va_entries(
    p_work_date DATE,
    p_rows JSONB,
    p_loaded_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('hl_va_entries'), p_work_date - DATE '2000-01-01');

    IF NOT register_unchanged(
        ARRAY(SELECT id FROM hl_va_entries WHERE work_date = p_work_date), p_loaded_ids
    ) THEN
        RAISE EXCEPTION 'STALE_REGISTER'
            USING DETAIL = format('HL to VA for %s was saved by someone else after it was opened.', p_work_date);
    END IF;

    DELETE FROM hl_va_entries WHERE work_date = p_work_date;

    INSERT INTO hl_va_entries
        (work_date, batch_id, count_text, grade, variety, hl_kgs, va_kgs, location_id,
         grader_name, std_yield, is_rejection)
    SELECT p_work_date,
           e.r->>'batch_id',
           COALESCE(e.r->>'count_text', ''),
           COALESCE(e.r->>'grade', ''),
           COALESCE(e.r->>'variety', ''),
           COALESCE((e.r->>'hl_kgs')::NUMERIC, 0),
           COALESCE((e.r->>'va_kgs')::NUMERIC, 0),
           NULLIF(e.r->>'location_id', '')::UUID,
           COALESCE(e.r->>'grader_name', ''),
           (e.r->>'std_yield')::NUMERIC,
           COALESCE((e.r->>'is_rejection')::BOOLEAN, FALSE)
      FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord)
     ORDER BY e.ord;
END;
$$;

-- ── 5. Company Ladies ───────────────────────────────────────────────────────
-- A day keeps the salary basic it was first entered under (026); only a day
-- with no rows yet takes the rate passed in.
CREATE OR REPLACE FUNCTION save_non_local_ladies(
    p_work_date DATE,
    p_rows JSONB,
    p_salary_basic NUMERIC,
    p_loaded_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_basic NUMERIC;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('non_local_ladies'), p_work_date - DATE '2000-01-01');

    IF NOT register_unchanged(
        ARRAY(SELECT id FROM non_local_ladies WHERE work_date = p_work_date), p_loaded_ids
    ) THEN
        RAISE EXCEPTION 'STALE_REGISTER'
            USING DETAIL = format('Company Ladies for %s was saved by someone else after it was opened.', p_work_date);
    END IF;

    SELECT salary_basic INTO v_basic
      FROM non_local_ladies
     WHERE work_date = p_work_date
     LIMIT 1;
    v_basic := COALESCE(v_basic, p_salary_basic);

    DELETE FROM non_local_ladies WHERE work_date = p_work_date;

    INSERT INTO non_local_ladies
        (work_date, batch_name, no_of_ladies, hl_qty, pd_qty, per_head_amount, salary_basic)
    SELECT p_work_date,
           btrim(e.r->>'batch_name'),
           COALESCE((e.r->>'no_of_ladies')::INTEGER, 0),
           COALESCE((e.r->>'hl_qty')::NUMERIC, 0),
           COALESCE((e.r->>'pd_qty')::NUMERIC, 0),
           COALESCE((e.r->>'per_head_amount')::NUMERIC, 0),
           v_basic
      FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord)
     ORDER BY e.ord;
END;
$$;

-- ── 6. Grading ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_grading_entries(
    p_work_date DATE,
    p_rows JSONB,
    p_loaded_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('daily_grading_data'), p_work_date - DATE '2000-01-01');

    IF NOT register_unchanged(
        ARRAY(SELECT id FROM daily_grading_data WHERE work_date = p_work_date), p_loaded_ids
    ) THEN
        RAISE EXCEPTION 'STALE_REGISTER'
            USING DETAIL = format('Grading for %s was saved by someone else after it was opened.', p_work_date);
    END IF;

    DELETE FROM daily_grading_data WHERE work_date = p_work_date;

    INSERT INTO daily_grading_data
        (work_date, unit_key, start_time, stop_time, total_grading_qty, note)
    SELECT p_work_date,
           e.r->>'unit_key',
           NULLIF(e.r->>'start_time', '')::TIME,
           NULLIF(e.r->>'stop_time', '')::TIME,
           (e.r->>'total_grading_qty')::NUMERIC,
           e.r->>'note'
      FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord)
     ORDER BY e.ord;
END;
$$;

-- ── 7. PPC Plan — both halves in the one transaction ────────────────────────
CREATE OR REPLACE FUNCTION save_daily_plan(
    p_work_date DATE,
    p_hon_rows JSONB,
    p_va_rows JSONB,
    p_loaded_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('daily_plan'), p_work_date - DATE '2000-01-01');

    IF NOT register_unchanged(
        ARRAY(SELECT id FROM daily_plan_hon_hl WHERE work_date = p_work_date
              UNION ALL
              SELECT id FROM daily_plan_hl_va WHERE work_date = p_work_date),
        p_loaded_ids
    ) THEN
        RAISE EXCEPTION 'STALE_REGISTER'
            USING DETAIL = format('The PPC Plan for %s was saved by someone else after it was opened.', p_work_date);
    END IF;

    DELETE FROM daily_plan_hon_hl WHERE work_date = p_work_date;
    DELETE FROM daily_plan_hl_va WHERE work_date = p_work_date;

    INSERT INTO daily_plan_hon_hl
        (work_date, batch_name, count_text, planned_qty, boxes, location_id, sort_order)
    SELECT p_work_date,
           btrim(e.r->>'batch_name'),
           btrim(COALESCE(e.r->>'count_text', '')),
           COALESCE((e.r->>'planned_qty')::NUMERIC, 0),
           COALESCE((e.r->>'boxes')::INTEGER, 0),
           (e.r->>'location_id')::UUID,
           (e.ord - 1)::INTEGER
      FROM jsonb_array_elements(COALESCE(p_hon_rows, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord)
     ORDER BY e.ord;

    INSERT INTO daily_plan_hl_va
        (work_date, location_id, planned_qty, sort_order)
    SELECT p_work_date,
           (e.r->>'location_id')::UUID,
           COALESCE((e.r->>'planned_qty')::NUMERIC, 0),
           (e.ord - 1)::INTEGER
      FROM jsonb_array_elements(COALESCE(p_va_rows, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord)
     ORDER BY e.ord;
END;
$$;

-- ── 8. Who may call them ────────────────────────────────────────────────────
-- Signed-in users only; RLS inside decides what each one may actually write.
REVOKE ALL ON FUNCTION save_yield_entries(DATE, JSONB, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_hl_va_entries(DATE, JSONB, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_non_local_ladies(DATE, JSONB, NUMERIC, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_grading_entries(DATE, JSONB, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION save_daily_plan(DATE, JSONB, JSONB, UUID[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION save_yield_entries(DATE, JSONB, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_hl_va_entries(DATE, JSONB, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_non_local_ladies(DATE, JSONB, NUMERIC, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_grading_entries(DATE, JSONB, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_daily_plan(DATE, JSONB, JSONB, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION register_unchanged(UUID[], UUID[]) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

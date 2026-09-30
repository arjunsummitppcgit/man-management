-- ============================================
-- 040: GRADING REPORT — ONE SHEET PER HONS TO HL BATCH
--
-- After a batch comes off HONS TO HL its HL is machine-graded into counts, and
-- each count is sent on to a variety (EZPL, PD, ...) or to BLOCK. The grading
-- report is that paper sheet: the grader and the times, one line per grade
-- (grade, count, particulars, total kg, remarks), the B/S (big / small) weights
-- taken for a count, and whatever defects were found.
--
-- Agreed with the client 2026-09-30:
--   * One sheet per batch per HONS TO HL date. A batch split between two
--     locations on HONS TO HL (039) still gets ONE sheet; its HON weight and
--     H/L weighment are the two lines added together.
--   * The batch's own figures — HON count, HON weight, H/L weighment, R/M
--     grader, standard (theoretical) yield — are NOT copied here. They are read
--     from yield_entries, so correcting HONS TO HL corrects the sheet.
--   * A record of its own: HL to VA is not fed from it.
--   * B/S is entered, not judged. The app shows big / small and nothing more.
--   * Defects are a free list of name and %.
--
-- The sheet hangs off yield_entries by (work_date, batch id), never by row id:
-- every HONS TO HL save re-inserts its rows (039), so those ids don't last.
-- save_grading_report refuses a batch that isn't on that date's HONS TO HL.
--
-- Lines and defects carry work_date too, so they fall under the same
-- date-aware rules as every other Daily Entry table (027).
--
-- Wrapped in one transaction — if any statement fails, none of it is applied.
-- Safe to run more than once.
-- ============================================

BEGIN;

-- ── 1. Tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL,              -- the HONS TO HL date the batch is on
    batch_id TEXT NOT NULL,               -- spelt as on HONS TO HL
    rm_date DATE,
    grading_date DATE,
    grader_name TEXT NOT NULL DEFAULT '',
    checking_count TEXT NOT NULL DEFAULT '',
    start_time TIME,
    end_time TIME,
    remarks TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Once per batch per date, ignoring case and spaces — the same comparison
-- uq_yield_entries_day_batch_location makes on HONS TO HL
CREATE UNIQUE INDEX IF NOT EXISTS uq_grading_reports_day_batch
    ON grading_reports (work_date, upper(btrim(batch_id)));

DROP TRIGGER IF EXISTS trg_grading_reports_updated ON grading_reports;
CREATE TRIGGER trg_grading_reports_updated
    BEFORE UPDATE ON grading_reports
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS grading_report_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES grading_reports(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    line_no INT NOT NULL,
    grade TEXT NOT NULL DEFAULT '',
    count_text TEXT NOT NULL DEFAULT '',
    particulars TEXT NOT NULL DEFAULT '',  -- EZPL, PD, ... or BLOCK; printed "HL-<x>"
    total_kgs NUMERIC(10, 3),
    remarks TEXT NOT NULL DEFAULT '',
    big_weight NUMERIC(10, 3),             -- B/S sample: the big pieces
    small_weight NUMERIC(10, 3),           -- B/S sample: the small pieces
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grading_report_lines_report ON grading_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_grading_report_lines_date ON grading_report_lines(work_date);

CREATE TABLE IF NOT EXISTS grading_report_defects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES grading_reports(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    line_no INT NOT NULL,
    defect TEXT NOT NULL,
    percent NUMERIC(6, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grading_report_defects_report ON grading_report_defects(report_id);

-- ── 2. Who may read and write — the Daily Entry rules from 027 ──────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['grading_reports', 'grading_report_lines', 'grading_report_defects'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "view daily-entry" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "insert daily-entry" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "update daily-entry" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "delete daily-entry" ON %I', t);
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

-- ── 3. Save one sheet, all or nothing ───────────────────────────────────────
-- The header is updated in place (so it keeps its id and created_at); its lines
-- and defects are replaced. p_loaded_updated_at is the sheet's updated_at when
-- the form opened it, or NULL for a sheet that didn't exist yet — if it has
-- changed since, someone else saved the batch in between and the save is
-- refused with STALE_REGISTER, the same popup the whole-day registers use.
CREATE OR REPLACE FUNCTION save_grading_report(
    p_work_date DATE,
    p_batch_id TEXT,
    p_report JSONB,
    p_lines JSONB,
    p_defects JSONB,
    p_loaded_updated_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_batch TEXT := btrim(COALESCE(p_batch_id, ''));
    v_id UUID;
    v_updated TIMESTAMPTZ;
BEGIN
    IF v_batch = '' THEN
        RAISE EXCEPTION 'A grading report needs a Batch ID';
    END IF;

    -- One save of this batch at a time; a second one waits, then fails the check
    PERFORM pg_advisory_xact_lock(hashtext('grading_reports'), hashtext(p_work_date::TEXT || '|' || upper(v_batch)));

    IF NOT EXISTS (
        SELECT 1 FROM yield_entries
         WHERE work_date = p_work_date AND upper(btrim(batch_id)) = upper(v_batch)
    ) THEN
        RAISE EXCEPTION 'BATCH_NOT_ON_REGISTER'
            USING DETAIL = format('%s is not on HONS TO HL for %s.', v_batch, p_work_date);
    END IF;

    SELECT id, updated_at INTO v_id, v_updated
      FROM grading_reports
     WHERE work_date = p_work_date AND upper(btrim(batch_id)) = upper(v_batch);

    IF v_updated IS DISTINCT FROM p_loaded_updated_at THEN
        RAISE EXCEPTION 'STALE_REGISTER'
            USING DETAIL = format('The grading report for %s on %s was saved by someone else after it was opened.', v_batch, p_work_date);
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO grading_reports
            (work_date, batch_id, rm_date, grading_date, grader_name, checking_count,
             start_time, end_time, remarks)
        VALUES
            (p_work_date,
             v_batch,
             NULLIF(p_report->>'rm_date', '')::DATE,
             NULLIF(p_report->>'grading_date', '')::DATE,
             COALESCE(btrim(p_report->>'grader_name'), ''),
             COALESCE(btrim(p_report->>'checking_count'), ''),
             NULLIF(p_report->>'start_time', '')::TIME,
             NULLIF(p_report->>'end_time', '')::TIME,
             COALESCE(btrim(p_report->>'remarks'), ''))
        RETURNING id INTO v_id;
    ELSE
        UPDATE grading_reports
           SET rm_date = NULLIF(p_report->>'rm_date', '')::DATE,
               grading_date = NULLIF(p_report->>'grading_date', '')::DATE,
               grader_name = COALESCE(btrim(p_report->>'grader_name'), ''),
               checking_count = COALESCE(btrim(p_report->>'checking_count'), ''),
               start_time = NULLIF(p_report->>'start_time', '')::TIME,
               end_time = NULLIF(p_report->>'end_time', '')::TIME,
               remarks = COALESCE(btrim(p_report->>'remarks'), '')
         WHERE id = v_id;

        DELETE FROM grading_report_lines WHERE report_id = v_id;
        DELETE FROM grading_report_defects WHERE report_id = v_id;
    END IF;

    INSERT INTO grading_report_lines
        (report_id, work_date, line_no, grade, count_text, particulars, total_kgs,
         remarks, big_weight, small_weight)
    SELECT v_id,
           p_work_date,
           e.ord,
           COALESCE(btrim(e.r->>'grade'), ''),
           COALESCE(btrim(e.r->>'count_text'), ''),
           COALESCE(btrim(e.r->>'particulars'), ''),
           NULLIF(e.r->>'total_kgs', '')::NUMERIC,
           COALESCE(btrim(e.r->>'remarks'), ''),
           NULLIF(e.r->>'big_weight', '')::NUMERIC,
           NULLIF(e.r->>'small_weight', '')::NUMERIC
      FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord);

    INSERT INTO grading_report_defects (report_id, work_date, line_no, defect, percent)
    SELECT v_id,
           p_work_date,
           e.ord,
           btrim(e.r->>'defect'),
           NULLIF(e.r->>'percent', '')::NUMERIC
      FROM jsonb_array_elements(COALESCE(p_defects, '[]'::JSONB)) WITH ORDINALITY AS e(r, ord);
END;
$$;

-- ── 4. Remove a sheet ───────────────────────────────────────────────────────
-- Same stale check, so a sheet can't be deleted out from under a save someone
-- else just made. Lines and defects go with it (ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION delete_grading_report(
    p_work_date DATE,
    p_batch_id TEXT,
    p_loaded_updated_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    v_batch TEXT := btrim(COALESCE(p_batch_id, ''));
    v_id UUID;
    v_updated TIMESTAMPTZ;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('grading_reports'), hashtext(p_work_date::TEXT || '|' || upper(v_batch)));

    SELECT id, updated_at INTO v_id, v_updated
      FROM grading_reports
     WHERE work_date = p_work_date AND upper(btrim(batch_id)) = upper(v_batch);

    IF v_id IS NULL THEN
        RETURN;
    END IF;

    IF v_updated IS DISTINCT FROM p_loaded_updated_at THEN
        RAISE EXCEPTION 'STALE_REGISTER'
            USING DETAIL = format('The grading report for %s on %s was saved by someone else after it was opened.', v_batch, p_work_date);
    END IF;

    DELETE FROM grading_reports WHERE id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION save_grading_report(DATE, TEXT, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_grading_report(DATE, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION save_grading_report(DATE, TEXT, JSONB, JSONB, JSONB, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_grading_report(DATE, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

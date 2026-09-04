-- ============================================
-- 037: THE PPC PLAN MAY BE WRITTEN FOR TOMORROW
--
-- Every other dated table records something that already happened, which is
-- why can_edit_on() (migration 027) stops at today. The PPC Plan is the one
-- exception: it says what is *meant* to happen, and it goes out to the floor
-- the evening before. Staff were having to wait until the morning of the
-- harvest to enter a plan that was decided the night before.
--
-- So the two daily_plan tables get their own date rule — everything
-- can_edit_on('daily-entry', ...) allows, plus the single day after today.
-- Nothing else moves: the registers, workforce, sanitization and the rest all
-- keep the today-and-yesterday rule.
--
-- Mirrored in the UI by checkEdit({ allowTomorrow }) in
-- src/lib/auth/permissions.ts — change one, change the other.
-- ============================================

CREATE OR REPLACE FUNCTION can_plan_on(p_date DATE)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT can_edit_on('daily-entry', p_date)
        -- One day, and only one: a plan for next week is a guess, not a plan.
        OR (can_modify_page('daily-entry') AND p_date = app_today() + 1);
$$;

GRANT EXECUTE ON FUNCTION can_plan_on(DATE) TO authenticated;

-- ─── Re-point the plan tables' write policies ───────────────────────────────
-- Reads are unchanged (migration 031): whoever may see the day may see its plan.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['daily_plan_hon_hl', 'daily_plan_hl_va'] LOOP
        EXECUTE format($f$
            DROP POLICY IF EXISTS "insert daily-entry" ON %I;
            DROP POLICY IF EXISTS "update daily-entry" ON %I;
            DROP POLICY IF EXISTS "delete daily-entry" ON %I;

            CREATE POLICY "insert daily-entry" ON %I FOR INSERT
                WITH CHECK (can_plan_on(work_date));
            CREATE POLICY "update daily-entry" ON %I FOR UPDATE
                USING (can_plan_on(work_date))
                WITH CHECK (can_plan_on(work_date));
            CREATE POLICY "delete daily-entry" ON %I FOR DELETE
                USING (can_plan_on(work_date));
        $f$, t, t, t, t, t, t);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

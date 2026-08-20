-- ============================================
-- 030: BACKFILL PAST DATES FROM THE REGISTERS  ** OPTIONAL — READ FIRST **
-- Migration 029 only keeps daily_processing in step from the moment a register
-- row is next saved. Dates already entered keep whatever was typed, which is
-- right for the days that predate the registers — but it also leaves the days
-- where the two disagree, and 15 Aug 2026, where both registers were filled and
-- the Completed boxes were left at zero, so the dashboard reads nothing for it.
--
-- Running this replays 029's rule over every date+location that HAS register
-- rows. Dates with no register rows are not touched at all, so nothing entered
-- before the registers existed is disturbed.
--
-- Run it only if you want the past to agree with the graders' registers.
-- Migration 029 works on its own; this one is not required.
-- ============================================

-- ── Preview first (safe, changes nothing) ───────────────────────────────────
-- Uncomment and run this on its own to see exactly which rows would move and
-- by how much, before running the UPDATE below.
--
-- WITH reg AS (
--     SELECT work_date, location_id,
--            SUM(hl) AS hl_kgs, SUM(va) AS va_kgs,
--            SUM(y_rows) AS y_rows, SUM(h_rows) AS h_rows
--       FROM (
--             SELECT work_date, location_id,
--                    SUM(hl_kgs) AS hl, 0::DECIMAL AS va, COUNT(*) AS y_rows, 0 AS h_rows
--               FROM yield_entries  WHERE location_id IS NOT NULL GROUP BY 1, 2
--             UNION ALL
--             SELECT work_date, location_id,
--                    0::DECIMAL, SUM(va_kgs), 0, COUNT(*)
--               FROM hl_va_entries  WHERE location_id IS NOT NULL GROUP BY 1, 2
--            ) AS s
--      GROUP BY 1, 2
-- )
-- SELECT r.work_date,
--        l.name AS location,
--        COALESCE(p.hon_to_headless, 0) AS stored_hon_hl,
--        CASE WHEN r.y_rows > 0 THEN r.hl_kgs ELSE COALESCE(p.hon_to_headless, 0) END AS new_hon_hl,
--        COALESCE(p.headless_to_va, 0)  AS stored_hl_va,
--        CASE WHEN r.h_rows > 0 THEN r.va_kgs ELSE COALESCE(p.headless_to_va, 0) END AS new_hl_va
--   FROM reg r
--   LEFT JOIN daily_processing p
--          ON p.work_date = r.work_date AND p.location_id = r.location_id
--   LEFT JOIN locations l ON l.id = r.location_id
--  WHERE p.id IS NULL
--     OR (r.y_rows > 0 AND ABS(COALESCE(p.hon_to_headless, 0) - r.hl_kgs) > 0.005)
--     OR (r.h_rows > 0 AND ABS(COALESCE(p.headless_to_va,  0) - r.va_kgs) > 0.005)
--  ORDER BY r.work_date, l.name;

-- ── The backfill ────────────────────────────────────────────────────────────
DO $$
DECLARE
    pair RECORD;
BEGIN
    FOR pair IN
        SELECT DISTINCT work_date, location_id
          FROM (
                SELECT work_date, location_id FROM yield_entries
                 WHERE location_id IS NOT NULL
                UNION
                SELECT work_date, location_id FROM hl_va_entries
                 WHERE location_id IS NOT NULL
               ) AS register_days
    LOOP
        PERFORM sync_completed_processing(pair.work_date, pair.location_id);
    END LOOP;
END;
$$;

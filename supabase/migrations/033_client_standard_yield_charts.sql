-- ============================================
-- 033: THE CLIENT'S STANDARD YIELD CHARTS
--
-- The client sent their own STANDARD YIELD chart (2026-08-25). Both charts in
-- the app were transcriptions made without it, and both were wrong — not by
-- rounding, but structurally. This migration is the paperwork for correcting
-- them in code (src/lib/yieldChart.ts, src/lib/hlVa.ts); the DDL here is small.
--
-- ─── What was wrong: HON → HL ───────────────────────────────────────────────
--
-- The shipped chart had eight bands stopping at count 120. The client's has
-- twelve, running 1–220:
--
--   was  22-40 71 | 41-60 70 | 61-70C 69 | 71-80C 68 | 81-90C 67 | 91-100C 66
--        101-110C 65 | 111-120C 64
--   now  01-30 71 | 31-40 70 | 41-50 69 | 51-60 68 | 61-70 67.5 | 71-80 67
--        81-90 66.5 | 91-100 66 | 101-110 65 | 111-130 64 | 131-150 63
--        151-220 62
--
-- Two bands were doing the work of four. 22-40 charged 31-40 at 71% when the
-- client's chart says 70%, and 41-60 charged 41-50 at its 51-60 figure. And
-- because the chart ended at 120, every batch counted above 120 came back with
-- no standard at all — 132 rows on the register today, silently blank rather
-- than visibly missing.
--
-- ─── What was wrong: HL → VA ────────────────────────────────────────────────
--
-- Worse, because it was a modelling error rather than a transcription one. The
-- shipped chart had three columns, each standing for a group of varieties:
--
--   pd → PD/PUD/PVPD/BTFLY,  pdto → PDTO/PVPDTO,  ezpl → EZPL
--
-- The client's chart lists all seven varieties separately, and two of them do
-- not follow the group they were filed under:
--
--   BTFY   runs 99% at every band. It was being measured against PD — 83% down
--          to 79% — so 38 butterfly rows were each judged ~17 points short of a
--          standard they were never held to.
--   PVPDTO holds 87% at 71/90 and 91/110, where PDTO drops to 86%.
--
-- A grouped column is an assertion that two varieties will never diverge. Two
-- of the three groupings turned out to be false, so the grouping is gone: every
-- variety now carries its own column. PD, PUD and PVPD still share a figure at
-- every band — but as three columns that happen to agree, editable apart.
--
-- The percentages moved as well: PDTO was a 89→83 slope and is 87 flat except
-- for 86 at the last two bands; EZPL was 99.5/99/98 and is 99 throughout.
--
-- ─── The decision on history: re-measure, do not freeze ─────────────────────
--
-- Correcting the chart re-reads the past, because a register row does not store
-- the standard it was judged by. 1,689 yield rows and 5,358 HL→VA rows have a
-- NULL std_yield: they hold a count, and the standard is looked up fresh from
-- the chart every time a report is opened. Change the chart and every one of
-- them answers differently — without a single row being edited.
--
-- Two ways to settle that. Freeze: write the OLD chart's figure onto every
-- unstamped row, so past reports reproduce exactly and only new work uses the
-- client's chart. Re-measure: leave them looking things up, and let the whole
-- history be read against the corrected chart.
--
-- Re-measure, decided by the client on 2026-08-25.
--
-- The reasoning, so it isn't reopened: freezing is right when a standard has
-- genuinely *moved* — both figures were true in their turn, and history must
-- keep the one that applied at the time. Nothing moved here. The old chart was
-- never the client's; it was a guess made when the app was built, wrong from the
-- first row to the last. There was no day on which 71% was the agreed standard
-- for count 31-40. Freezing would have meant writing a figure now known to be
-- wrong onto 7,000 rows and calling it history.
--
-- What it looked like in practice, from the register: butterfly batches ran
-- 99.00%, 99.40%, 99.25% against a standard the app read as 82–83%, so every
-- one was reported as beating standard by ~17 points. The client's chart puts
-- BTFY at 99%. The old reading was not a stricter standard, it was a fiction,
-- and no decision was ever correctly made from it.
--
-- ─── The old band labels are re-derived too ─────────────────────────────────
--
-- Also decided by the client on 2026-08-25, and it follows from re-measuring
-- rather than being a second, separate liberty.
--
-- Every yield row stores a count_range label — '22-40', '61-70C', '111-120C' —
-- and none of those strings exist in the new chart. Left as they were, a row
-- labelled '22-40' would be sitting next to a standard of 70%, which is the
-- figure for 31-40. The label would contradict the number printed beside it on
-- the same line. Re-measuring without relabelling produces a register that
-- disagrees with itself, so the labels move with the standards.
--
-- The labels are re-derived from count_text, not mapped from the old label,
-- because the old bands do not map cleanly: '22-40' splits across 01-30 and
-- 31-40, and '41-60' across 41-50 and 51-60.
--
-- Dry-run against production before writing this, using the app's own parsing:
--   1,719 rows relabelled, 11 left blank, and — the number that mattered —
--   0 rows whose existing label could not be re-derived.
--
-- Every distinct count_text in the table (993 of them) was then run through
-- both the app's parser and the SQL below, and they agree on all 993. That
-- check was worth running: it caught a rounding difference first time round.
-- A count of exactly x.5 — '30.5', '60.5 ASP', eight such values live on the
-- register — has to round up, the way Math.round and Postgres round(numeric)
-- both do. Test it with a language that rounds half-to-even and you get the
-- wrong band for every one of them.
--
-- The UPDATE below is written so that last figure cannot bite even if it
-- changes: it only writes where a band was successfully derived. A row whose
-- count is 'MIX' or '46..4' keeps whatever label it has. Nothing is ever
-- blanked, so the worst case is a row left alone, never one emptied.
-- ============================================

-- ─── Clearing the stamps written from the wrong chart ───────────────────────
--
-- A few hundred rows do carry a std_yield (~270 at the time of writing, and
-- still growing — the register is in daily use). Every one was written between
-- migration 032 landing and this correction: the oldest stamp in either table
-- is 2026-08-22 04:22 UTC, which is 032 itself. So every stamp in the database
-- came from the chart now known to be wrong. They are the only rows still
-- measured against it, and a stamp is precisely the thing that does not follow
-- a chart correction.
--
-- Left alone under a re-measure decision they would be an island: a batch
-- entered this week would read differently from the identical batch entered
-- next week, for no reason a user could see. So the stamps go, and those rows
-- rejoin the rest in reading from the client's chart.
--
-- Cleared unconditionally rather than only where the figure actually disagrees.
-- Telling those apart means re-deriving each row's band from its free-text
-- count in SQL — the same 'MIX', '46..4', '104.108.16' strings the stamp exists
-- to keep out of reports. Clearing a stamp that already matched costs nothing:
-- the row looks up the same number it was holding. The unconditional form is
-- also the one that stays correct however many rows are added between this file
-- being written and being run.
--
-- This is not a rewrite of history. It removes a figure so the row is read
-- against the client's chart like every other row, which is the decision.
UPDATE yield_entries SET std_yield = NULL WHERE std_yield IS NOT NULL;
UPDATE hl_va_entries SET std_yield = NULL WHERE std_yield IS NOT NULL;

-- From here the stamp resumes its intended job: entries saved from now on
-- record the client's chart as they were measured against it, so a later admin
-- edit in the panel moves new work only. The history cleared above stays on
-- lookup, which is what re-measuring means — it follows the chart. Should the
-- client ever want the past locked to today's figures as well, that is a
-- separate migration stamping std_yield from the NEW chart, and it should be a
-- decision, not a side effect.

-- ─── Re-deriving count_range ────────────────────────────────────────────────
--
-- The count as the app reads it, ported from extractCountNumber in
-- src/lib/yieldChart.ts. The two must agree, or a row relabelled here would be
-- relabelled differently the next time it is saved in the app.
--
--   "37.75/40"    -> 40      (a slash means the count is what follows it)
--   "08/12 RJ"    -> 12      (trailing text after the slash is ignored)
--   "181 ASP"     -> 181
--   "104.108.16"  -> 104     (JS parseFloat stops at the second point)
--   "46..4"       -> 46
--   "MIX", "0"    -> NULL    (no band; the row is left exactly as it is)
--
-- One deliberate divergence: a count written as a bare decimal, ".5", is 0.5 to
-- the app and NULL here. No such value exists on the register, and NULL is the
-- safe side of the difference — the row keeps its label rather than being moved
-- somewhere this file guessed.
--
-- pg_temp so it dies with the session — this is migration scaffolding, not a
-- function the app should ever be able to call.
CREATE OR REPLACE FUNCTION pg_temp.yield_count_of(t text) RETURNS numeric AS $$
DECLARE s text; m text;
BEGIN
    s := btrim(coalesce(t, ''));
    IF s = '' THEN RETURN NULL; END IF;

    -- A slash: the count is the last segment, up to its leading number.
    IF position('/' in s) > 0 THEN
        m := substring(btrim(split_part(s, '/', array_length(string_to_array(s, '/'), 1)))
                       from '^[0-9]+\.?[0-9]*');
        IF m IS NOT NULL AND m <> '' AND m <> '.' THEN RETURN m::numeric; END IF;
    END IF;

    -- Otherwise the first run of digits and points, up to its leading number.
    m := substring(s from '[0-9.]+');
    IF m IS NULL THEN RETURN NULL; END IF;
    m := substring(m from '^[0-9]+\.?[0-9]*');
    IF m IS NULL OR m = '' OR m = '.' THEN RETURN NULL; END IF;
    RETURN m::numeric;
END $$ LANGUAGE plpgsql IMMUTABLE;

-- The bands of src/lib/yieldChart.ts, matched on the rounded count. Kept as a
-- CASE rather than a table so this file states the chart it applied, and reads
-- the same in a year when the .ts has moved on again.
CREATE OR REPLACE FUNCTION pg_temp.yield_band_of(t text) RETURNS text AS $$
DECLARE n integer;
BEGIN
    n := round(pg_temp.yield_count_of(t));
    IF n IS NULL THEN RETURN NULL; END IF;
    RETURN CASE
        WHEN n BETWEEN   1 AND  30 THEN '01-30'
        WHEN n BETWEEN  31 AND  40 THEN '31-40'
        WHEN n BETWEEN  41 AND  50 THEN '41-50'
        WHEN n BETWEEN  51 AND  60 THEN '51-60'
        WHEN n BETWEEN  61 AND  70 THEN '61-70'
        WHEN n BETWEEN  71 AND  80 THEN '71-80'
        WHEN n BETWEEN  81 AND  90 THEN '81-90'
        WHEN n BETWEEN  91 AND 100 THEN '91-100'
        WHEN n BETWEEN 101 AND 110 THEN '101-110'
        WHEN n BETWEEN 111 AND 130 THEN '111-130'
        WHEN n BETWEEN 131 AND 150 THEN '131-150'
        WHEN n BETWEEN 151 AND 220 THEN '151-220'
        WHEN n >= 221              THEN '221+'
        ELSE NULL                     -- 0 and below: not a count
    END;
END $$ LANGUAGE plpgsql IMMUTABLE;

-- `band IS NOT NULL` is the safety rail: a count this cannot read leaves the
-- row untouched rather than blanking a label that at least meant something.
UPDATE yield_entries AS y
SET    count_range = pg_temp.yield_band_of(y.count_text)
WHERE  pg_temp.yield_band_of(y.count_text) IS NOT NULL
  AND  coalesce(y.count_range, '') <> pg_temp.yield_band_of(y.count_text);

-- hl_va_entries.grade is deliberately absent from all of this. The HL→VA bands
-- (13/15 … 91/110) are identical in the client's chart to the ones the app
-- already had, so every stored grade is still correct. Only the percentages
-- inside those bands moved.

-- ─── The inert override ─────────────────────────────────────────────────────
--
-- One admin edit exists, made through the panel that migration 032 added:
--
--   key    hon_hl_standard_yield
--   value  {"41-60": 68, "61-70C": 67.5, "71-80C": 67, "81-90C": 66.5}
--   by     arjun.summitppc@gmail.com  on  2026-08-24 05:09 UTC
--
-- It reads as an attempt to reach the client's figures band by band, and it got
-- three of the four right — the fourth, 41-60 → 68, is the 51-60 figure applied
-- to a band that also covered 41-50. The new chart carries all four correctly.
--
-- Every key names a band that no longer exists, so applyYieldOverrides already
-- ignores the row: it changes nothing on screen today. It is deleted rather
-- than left because a dead override is not inert forever — the day a future
-- chart happens to reuse the label '41-60', a year-old edit would silently
-- reactivate underneath it. The record of the edit is the comment above, in git.
--
-- hl_va_standard_yield was never written, so there is nothing to clear there.
DELETE FROM app_settings WHERE key = 'hon_hl_standard_yield';

-- ─── Stamp column comments, restated against the corrected charts ───────────
--
-- The wording from 032 pointed at "the shipped chart" as though it were fixed,
-- and read NULL as "old row, nobody got round to it". Both changed here: the
-- chart moved, and after this migration every row that predates it is NULL on
-- purpose. A reader needs to know that the blank is the decision.
COMMENT ON COLUMN yield_entries.std_yield IS
    'HON->HL standard yield % in force when this row was saved. NULL = read against the current chart in src/lib/yieldChart.ts instead. Every row from before 2026-08-25 is NULL by decision: migration 033 replaced a wrong chart with the client''s own and the client chose to re-measure history against it rather than freeze it.';

COMMENT ON COLUMN hl_va_entries.std_yield IS
    'HL->VA standard yield % in force when this row was saved, for its count band and variety. NULL = read against the current chart in src/lib/hlVa.ts instead (per-variety columns since migration 033, not the old pd/pdto/ezpl groups). Every row from before 2026-08-25 is NULL by decision — see migration 033.';

NOTIFY pgrst, 'reload schema';

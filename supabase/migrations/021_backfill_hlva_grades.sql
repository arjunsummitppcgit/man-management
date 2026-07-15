-- ============================================
-- 021: BACKFILL HL→VA GRADES FROM COUNT
-- One-off data fix. Recomputes hl_va_entries.grade from count_text
-- using the new HL→VA standard chart ranges (slash format), matching
-- the app's extractCountNumber() / lookupHlVaCountRange() logic.
-- Counts outside 13..110 (or unparseable) become '' -> shown as MIX.
-- Safe to run more than once; only changed rows are touched.
-- ============================================

BEGIN;

-- Replicates extractCountNumber() from src/lib/yieldChart.ts:
--   - if the text contains "/", use the number after the LAST slash
--   - otherwise use the first number in the string
--   - round to the nearest integer
CREATE OR REPLACE FUNCTION _hlva_extract_count(count_text TEXT)
RETURNS INTEGER AS $$
DECLARE
    cleaned     TEXT;
    after_slash TEXT;
    num_text    TEXT;
BEGIN
    IF count_text IS NULL OR btrim(count_text) = '' THEN
        RETURN NULL;
    END IF;

    cleaned := btrim(count_text);

    -- If there's a "/", use the number AFTER the last slash
    IF position('/' IN cleaned) > 0 THEN
        after_slash := btrim(regexp_replace(cleaned, '^.*/', ''));
        num_text := (regexp_match(after_slash, '([0-9]+(?:\.[0-9]+)?)'))[1];
        IF num_text IS NOT NULL THEN
            RETURN round(num_text::NUMERIC)::INTEGER;
        END IF;
    END IF;

    -- Otherwise (or if the slash segment had no number), first number in string
    num_text := (regexp_match(cleaned, '([0-9]+(?:\.[0-9]+)?)'))[1];
    IF num_text IS NOT NULL THEN
        RETURN round(num_text::NUMERIC)::INTEGER;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Replicates lookupHlVaCountRange() from src/lib/hlVa.ts
CREATE OR REPLACE FUNCTION _hlva_grade(count_text TEXT)
RETURNS TEXT AS $$
DECLARE
    c INTEGER := _hlva_extract_count(count_text);
BEGIN
    IF    c IS NULL             THEN RETURN '';
    ELSIF c BETWEEN 13 AND 15   THEN RETURN '13/15';
    ELSIF c BETWEEN 16 AND 20   THEN RETURN '16/20';
    ELSIF c BETWEEN 21 AND 25   THEN RETURN '21/25';
    ELSIF c BETWEEN 26 AND 30   THEN RETURN '26/30';
    ELSIF c BETWEEN 31 AND 40   THEN RETURN '31/40';
    ELSIF c BETWEEN 41 AND 50   THEN RETURN '41/50';
    ELSIF c BETWEEN 51 AND 60   THEN RETURN '51/60';
    ELSIF c BETWEEN 61 AND 70   THEN RETURN '61/70';
    ELSIF c BETWEEN 71 AND 90   THEN RETURN '71/90';
    ELSIF c BETWEEN 91 AND 110  THEN RETURN '91/110';
    ELSE                             RETURN '';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recompute grades (only rows that actually change)
UPDATE hl_va_entries
SET grade = _hlva_grade(count_text)
WHERE grade IS DISTINCT FROM _hlva_grade(count_text);

DROP FUNCTION _hlva_grade(TEXT);
DROP FUNCTION _hlva_extract_count(TEXT);

COMMIT;

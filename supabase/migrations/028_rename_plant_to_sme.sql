-- ============================================
-- 028: RENAME LOCATION "Plant" → "SME"
-- ============================================
-- The location is referenced everywhere by its uuid, so this rename touches no
-- entry data — every daily_processing, yield_entries, hl_va_entries and
-- supervisor row keeps pointing at the same location. Only the label changes.
--
-- The code is renamed alongside the name because src/lib/headWaste.ts matches
-- in-house locations on a normalised form of the NAME ('plant' → 'sme'), and
-- leaving the two out of step is the kind of thing that bites later.

UPDATE locations
SET name = 'SME',
    code = 'sme'
WHERE lower(trim(name)) = 'plant';

-- Verify: should list SME with its original sort_order, and no 'Plant' left.
-- SELECT name, code, sort_order, is_active FROM locations ORDER BY sort_order;

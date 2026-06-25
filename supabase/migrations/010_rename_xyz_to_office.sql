-- Rename location 'XYZ' to 'OFFICE' and update its code accordingly
UPDATE locations
SET name = 'OFFICE',
    code = 'office'
WHERE name = 'XYZ';

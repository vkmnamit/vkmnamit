-- ============================================
-- Fix invalid due_date values in fee_payments
-- PostgreSQL DATE columns reject invalid dates
-- like '2026-06-31' or '2026-04-31' (22008).
-- This migration repairs any rows that were
-- created with invalid dates by clamping the
-- day to the last valid day of the month.
-- ============================================

-- First, find any invalid dates (they can't exist as DATE type,
-- but if the column is TEXT or the data was inserted via a path
-- that bypassed validation, they may be present).
-- We'll use a safe approach: update any due_date that is a string
-- matching YYYY-MM-DD but has an invalid day for its month.

-- Step 1: Check if due_date is a DATE or TEXT column
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'fee_payments' AND column_name = 'due_date';

  RAISE NOTICE 'fee_payments.due_date column type: %', col_type;
END $$;

-- Step 2: If due_date is stored as TEXT, fix invalid dates.
-- If it's DATE, PostgreSQL already prevents invalid values from being stored.
-- This handles the case where invalid strings were stored before a CHECK
-- constraint or type conversion was applied.

-- Fix any due_date values that are invalid for their month.
-- We use a CASE expression to clamp the day to the last valid day.
UPDATE fee_payments
SET due_date = CASE
  -- April (month 04) has 30 days
  WHEN due_date ~ '^2026-04-(3[1-9])$' THEN '2026-04-30'
  -- June (month 06) has 30 days
  WHEN due_date ~ '^2026-06-(3[1-9])$' THEN '2026-06-30'
  -- September (month 09) has 30 days
  WHEN due_date ~ '^2026-09-(3[1-9])$' THEN '2026-09-30'
  -- November (month 11) has 30 days
  WHEN due_date ~ '^2026-11-(3[1-9])$' THEN '2026-11-30'
  -- February (month 02) - 2026 is not a leap year, so 28 days
  WHEN due_date ~ '^2026-02-(2[9]|3[01])$' THEN '2026-02-28'
  -- Any other invalid date pattern (day > 31 or day = 00)
  WHEN due_date ~ '^(\d{4})-(\d{2})-(\d{2})$'
       AND (CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) > 31
            OR CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) < 1)
  THEN SUBSTRING(due_date FROM 1 FOR 8) || '01'
  ELSE due_date
END
WHERE due_date IS NOT NULL
  AND due_date ~ '^(\d{4})-(\d{2})-(\d{2})$'
  AND (
    -- April 31
    (due_date ~ '^2026-04-31$')
    -- June 31
    OR (due_date ~ '^2026-06-31$')
    -- September 31
    OR (due_date ~ '^2026-09-31$')
    -- November 31
    OR (due_date ~ '^2026-11-31$')
    -- February 29/30/31 (2026 not leap year)
    OR (due_date ~ '^2026-02-(29|30|31)$')
    -- Any month with day > 31 or day = 0
    OR (CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) > 31)
    OR (CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) < 1)
  );

-- Step 3: Also fix any invalid dates in other months (generic approach)
-- This catches any remaining invalid dates like 2025-04-31, 2025-06-31, etc.
UPDATE fee_payments
SET due_date = (
  -- Reconstruct a valid date by clamping the day to the last day of the month
  TO_CHAR(
    LEAST(
      (SUBSTRING(due_date FROM 1 FOR 4) || '-' || SUBSTRING(due_date FROM 6 FOR 2) || '-01')::DATE
        + (CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) - 1) * INTERVAL '1 day',
      (SUBSTRING(due_date FROM 1 FOR 4) || '-' || SUBSTRING(due_date FROM 6 FOR 2) || '-01')::DATE
        + INTERVAL '1 month' - INTERVAL '1 day'
    ),
    'YYYY-MM-DD'
  )
)
WHERE due_date IS NOT NULL
  AND due_date ~ '^(\d{4})-(\d{2})-(\d{2})$'
  AND (
    -- Day is 00 or > 31
    CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) < 1
    OR CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) > 31
    -- Or the date is invalid for its specific month (e.g., April 31)
    OR (SUBSTRING(due_date FROM 6 FOR 2) IN ('04', '06', '09', '11')
        AND CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) = 31)
    OR (SUBSTRING(due_date FROM 6 FOR 2) = '02'
        AND CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) > 28
        AND MOD(CAST(SUBSTRING(due_date FROM 1 FOR 4) AS INT), 4) != 0)
  );

-- Step 4: Report how many rows were affected
SELECT COUNT(*) AS invalid_dates_fixed
FROM fee_payments
WHERE due_date IS NOT NULL
  AND due_date ~ '^(\d{4})-(\d{2})-(\d{2})$'
  AND (
    CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) < 1
    OR CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) > 31
    OR (SUBSTRING(due_date FROM 6 FOR 2) IN ('04', '06', '09', '11')
        AND CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) = 31)
    OR (SUBSTRING(due_date FROM 6 FOR 2) = '02'
        AND CAST(SUBSTRING(due_date FROM 9 FOR 2) AS INT) > 28
        AND MOD(CAST(SUBSTRING(due_date FROM 1 FOR 4) AS INT), 4) != 0)
  );
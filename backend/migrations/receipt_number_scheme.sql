-- ============================================================
-- Receipt / Bill number scheme
--    Format: {SCHOOL_SHORT_NAME}{YY}{MONTH}{SERIAL}
--    e.g. Gyananda Nation Academy, August 2026, 1st receipt
--         => GNA + 26 + 8 + 1  =>  "GNA2681"
--
-- What this does:
--   1. Adds schools.short_name (auto-derived initials when empty) so each
--      school has a short prefix like "GNA".
--   2. Creates transaction_counters, a concurrency-safe per-school /
--      per-month counter (serial resets every month).
--   3. (Re)defines generate_receipt_number(p_school_id) — used by fee
--      receipts — and generate_bill_number(p_school_id) — used by the
--      expense bills. Both return the same {SHORT}{YY}{MONTH}{SERIAL}.
--
-- Run this file in the project's Supabase SQL editor (one-shot).
-- ============================================================

-- 1. Short name for every school ------------------------------------
ALTER TABLE schools ADD COLUMN IF NOT EXISTS short_name TEXT;

-- Initials helper used only to backfill short_name from the school name.
CREATE OR REPLACE FUNCTION public.school_initials(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $fn$
  SELECT LEFT(
    (SELECT string_agg(upper(substring(w FROM 1 FOR 1)), '')
     FROM regexp_split_to_table(COALESCE(trim(p_name), ''), '\s+') AS w
     WHERE w <> ''
       AND lower(w) NOT IN ('the','of','and','for','at','in','an','a',
                            'society','trust','regd','registered','charitable','public','vidyalaya')),
    4
  );
$fn$;

UPDATE schools
SET short_name = COALESCE(
  NULLIF(short_name, ''),
  NULLIF(public.school_initials(name), ''),
  'SCH'
);

-- 2. Per-school / per-month counter ---------------------------------
CREATE TABLE IF NOT EXISTS transaction_counters (
  school_id     UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  kind          TEXT        NOT NULL,               -- 'receipt' | 'bill'
  counter_year  INT         NOT NULL,
  counter_month INT         NOT NULL,
  last_serial   INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, kind)
);

-- 3. Receipt number generator (fee receipts) -------------------------
CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_prefix TEXT;
  v_year   INT;
  v_month  INT;
  v_serial INT;
BEGIN
  SELECT COALESCE(
           NULLIF(short_name, ''),
           NULLIF(public.school_initials(name), ''),
           'SCH'
         )
    INTO v_prefix
    FROM public.schools
   WHERE id = p_school_id;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'SCH';
  END IF;

  v_year  := EXTRACT(YEAR  FROM CURRENT_DATE)::INT;
  v_month := EXTRACT(MONTH FROM CURRENT_DATE)::INT;

  -- Serialize number generation per school so two receipts never collide.
  PERFORM pg_advisory_xact_lock(hashtext('rcpt:' || p_school_id::text));

  INSERT INTO public.transaction_counters (school_id, kind, counter_year, counter_month, last_serial)
  VALUES (p_school_id, 'receipt', v_year, v_month, 1)
  ON CONFLICT (school_id, kind) DO UPDATE
     SET last_serial = CASE
           WHEN transaction_counters.counter_year  = v_year
            AND transaction_counters.counter_month = v_month
             THEN transaction_counters.last_serial + 1
           ELSE 1
         END,
         counter_year  = v_year,
         counter_month = v_month
  RETURNING last_serial INTO v_serial;

  -- {SHORT}{YY}{MONTH}{SERIAL} — e.g. GNA2681
  RETURN v_prefix
      || lpad(MOD(v_year, 100)::text, 2, '0')
      || v_month::text
      || v_serial::text;
END;
$fn$;

-- 4. Bill number generator (expense bills) ---------------------------
CREATE OR REPLACE FUNCTION public.generate_bill_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_prefix TEXT;
  v_year   INT;
  v_month  INT;
  v_serial INT;
BEGIN
  SELECT COALESCE(
           NULLIF(short_name, ''),
           NULLIF(public.school_initials(name), ''),
           'SCH'
         )
    INTO v_prefix
    FROM public.schools
   WHERE id = p_school_id;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'SCH';
  END IF;

  v_year  := EXTRACT(YEAR  FROM CURRENT_DATE)::INT;
  v_month := EXTRACT(MONTH FROM CURRENT_DATE)::INT;

  PERFORM pg_advisory_xact_lock(hashtext('bill:' || p_school_id::text));

  INSERT INTO public.transaction_counters (school_id, kind, counter_year, counter_month, last_serial)
  VALUES (p_school_id, 'bill', v_year, v_month, 1)
  ON CONFLICT (school_id, kind) DO UPDATE
     SET last_serial = CASE
           WHEN transaction_counters.counter_year  = v_year
            AND transaction_counters.counter_month = v_month
             THEN transaction_counters.last_serial + 1
           ELSE 1
         END,
         counter_year  = v_year,
         counter_month = v_month
  RETURNING last_serial INTO v_serial;

  RETURN v_prefix
      || lpad(MOD(v_year, 100)::text, 2, '0')
      || v_month::text
      || v_serial::text;
END;
$fn$;

-- 5. Expense bills: store payee, reason and bill number ---------------
ALTER TABLE school_expenses
  ADD COLUMN IF NOT EXISTS bill_number TEXT,
  ADD COLUMN IF NOT EXISTS payee TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS paid_date TIMESTAMPTZ;

-- Backfill a friendly bill number for old rows (best-effort).
UPDATE school_expenses e
   SET bill_number = COALESCE(
         e.bill_number,
         public.generate_bill_number(e.school_id)
       )
 WHERE e.bill_number IS NULL;
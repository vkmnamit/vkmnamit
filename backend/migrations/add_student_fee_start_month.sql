-- ═══════════════════════════════════════════════════════════════
-- ADD fee_start_month TO students
--
-- Controls when a student's recurring (monthly) fees begin.
-- Format: 'YYYY-MM' e.g. '2026-08'
--   NULL            → fees start immediately (legacy behaviour)
--   '2026-08'       → August 2026 is the first month billed
--   '2026-09'       → September 2026 is the first month billed
--                     (i.e. August is skipped)
--
-- The admission wizard sets this automatically from the admin's
-- "Start charging from" selection. Bulk import defaults it to the
-- current month. Auto-generation and admission fee pushes only
-- bill students whose fee_start_month is <= the billing month.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS fee_start_month TEXT;

-- Index used by auto-generation to skip students whose start month
-- hasn't arrived yet.
CREATE INDEX IF NOT EXISTS idx_students_fee_start_month
  ON public.students (school_id, fee_start_month);
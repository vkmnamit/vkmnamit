-- Aggregate exam types: when is_aggregate = true, ALL subject exams of this type
-- are combined into a single aggregate report card for the student
-- (e.g. "Mid-Term" → one report listing every subject, with totals & position).
-- Non-aggregate types (Unit Test, Mock Test, ...) stay as one report per exam.
ALTER TABLE exam_types ADD COLUMN IF NOT EXISTS is_aggregate BOOLEAN NOT NULL DEFAULT false;

-- Mark the classic "big" exam types as aggregate (idempotent)
UPDATE exam_types SET is_aggregate = true
WHERE lower(trim(name)) IN (
  'mid-term', 'mid term', 'midterm',
  'final exam', 'final',
  'half-yearly', 'half yearly',
  'annual exam', 'annual'
);

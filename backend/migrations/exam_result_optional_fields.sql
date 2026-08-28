-- Align older production databases with the exam-result fields used by result entry.
ALTER TABLE exam_results
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS is_absent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

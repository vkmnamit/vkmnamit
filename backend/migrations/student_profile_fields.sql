-- Supports the Health & Safety and previous-school fields in the student profile editor.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS medical_conditions TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS previous_school TEXT;

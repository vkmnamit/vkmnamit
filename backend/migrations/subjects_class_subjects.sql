-- Migration: Subject management and class_subjects table
-- Run this in your Supabase SQL Editor

-- 1. Add is_elective and description columns to subjects table
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_elective BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Create class_subjects table for mapping subjects to classes with teacher assignment
CREATE TABLE IF NOT EXISTS class_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  periods_per_week INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, subject_id)
);

-- 3. Enable Row Level Security
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Allow read access to all authenticated users in the school
CREATE POLICY "class_subjects_read" ON class_subjects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM classes c 
      JOIN users u ON u.school_id = (SELECT school_id FROM classes WHERE id = class_subjects.class_id LIMIT 1)
      WHERE u.id = auth.uid()
    )
  );

-- 5. Policy: Allow admins to manage class_subjects
CREATE POLICY "class_subjects_admin" ON class_subjects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. Helpful index
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_id ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_id ON class_subjects(subject_id);

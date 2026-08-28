-- Migration: Support assignments by class/section/subject
ALTER TABLE lms_assignments ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS description TEXT;

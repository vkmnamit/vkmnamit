-- ============================================
-- EXAM PAPER GENERATION SYSTEM
-- ============================================

-- Exam Paper Templates (Admin-configured structures)
CREATE TABLE IF NOT EXISTS exam_paper_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_marks INT NOT NULL,
  duration_minutes INT DEFAULT 180,
  instructions TEXT,
  general_instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paper Sections (Section A, B, C, etc.)
CREATE TABLE IF NOT EXISTS exam_paper_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES exam_paper_templates(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL, -- 'A', 'B', 'C', 'D', etc.
  section_title TEXT, -- 'Multiple Choice Questions', 'Short Answer', etc.
  instructions TEXT,
  section_order INT NOT NULL,
  total_marks INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions Bank
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'text' CHECK (question_type IN ('text', 'image', 'mcq')),
  question_image_url TEXT,
  options JSONB, -- For MCQ: {A: "...", B: "...", C: "...", D: "..."}
  correct_answer TEXT, -- For MCQ
  marks INT NOT NULL DEFAULT 1,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  chapter TEXT,
  topic TEXT,
  tags TEXT[],
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated Question Papers
CREATE TABLE IF NOT EXISTS exam_papers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  template_id UUID REFERENCES exam_paper_templates(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  paper_code TEXT UNIQUE NOT NULL,
  version INT DEFAULT 1,
  total_marks INT NOT NULL,
  duration_minutes INT NOT NULL,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paper Questions (Questions included in a specific paper)
CREATE TABLE IF NOT EXISTS exam_paper_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID REFERENCES exam_papers(id) ON DELETE CASCADE,
  section_id UUID REFERENCES exam_paper_sections(id) ON DELETE CASCADE,
  question_id UUID REFERENCES exam_questions(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  custom_question_text TEXT, -- Override if needed
  custom_marks INT, -- Override default marks
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paper Versions (for multiple versions of same paper)
CREATE TABLE IF NOT EXISTS exam_paper_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID REFERENCES exam_papers(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  version_code TEXT NOT NULL,
  questions JSONB NOT NULL, -- Array of question IDs in order
  total_marks INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paper Moderation & Status
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed', 'approved', 'locked'));
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS comments TEXT;

-- Question Usage Tracking (for duplicate detection)
CREATE TABLE IF NOT EXISTS question_usage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES exam_questions(id) ON DELETE CASCADE,
  paper_id UUID REFERENCES exam_papers(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, paper_id)
);

CREATE INDEX IF NOT EXISTS idx_question_usage_history_question ON question_usage_history(question_id);
CREATE INDEX IF NOT EXISTS idx_question_usage_history_paper ON question_usage_history(paper_id);

-- Paper Print Settings
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS print_settings JSONB DEFAULT '{
  "showHeader": true,
  "showFooter": true,
  "showPageNumbers": true,
  "showWatermark": false,
  "showSignature": false,
  "showInstructions": true
}';

-- Blueprint Compliance
ALTER TABLE exam_paper_templates ADD COLUMN IF NOT EXISTS blueprint JSONB DEFAULT '[]';
-- Blueprint format: [{"type": "mcq", "percentage": 20}, {"type": "short", "percentage": 30}, {"type": "long", "percentage": 50}]

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exam_paper_templates_school ON exam_paper_templates(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_paper_templates_class ON exam_paper_templates(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_paper_templates_subject ON exam_paper_templates(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_school ON exam_questions(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_subject ON exam_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_class ON exam_questions(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_papers_school ON exam_papers(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_papers_template ON exam_papers(template_id);
CREATE INDEX IF NOT EXISTS idx_exam_papers_exam ON exam_papers(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_paper_questions_paper ON exam_paper_questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_exam_paper_questions_section ON exam_paper_questions(section_id);

-- Triggers for updated_at (idempotent: drop first if exists)
DROP TRIGGER IF EXISTS update_exam_paper_templates_updated_at ON exam_paper_templates;
CREATE TRIGGER update_exam_paper_templates_updated_at BEFORE UPDATE ON exam_paper_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_exam_questions_updated_at ON exam_questions;
CREATE TRIGGER update_exam_questions_updated_at BEFORE UPDATE ON exam_questions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_exam_papers_updated_at ON exam_papers;
CREATE TRIGGER update_exam_papers_updated_at BEFORE UPDATE ON exam_papers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Add title and exam_type columns to exam_papers
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS exam_type TEXT;

-- Add question_type and options columns to exam_paper_questions
ALTER TABLE exam_paper_questions ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'short';
ALTER TABLE exam_paper_questions ADD COLUMN IF NOT EXISTS options JSONB;

-- Allow question_id to be NULL in exam_paper_questions (for inline/typed questions)
-- Run in Supabase SQL editor if not already done:
-- ALTER TABLE exam_paper_questions ALTER COLUMN question_id DROP NOT NULL;

-- Add image_url column to exam_paper_questions for inline question image persistence
ALTER TABLE exam_paper_questions ADD COLUMN IF NOT EXISTS image_url TEXT;

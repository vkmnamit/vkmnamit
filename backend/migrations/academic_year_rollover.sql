-- ============================================
-- ACADEMIC YEAR ROLLOVER & PROMOTION
-- Adds student status tracking for promotions,
-- passed-out (alumni) handling, repeaters, and
-- an audit log for rollover operations.
-- ============================================

-- 1. Add student status column for promotion lifecycle
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active', 'passed_out', 'transferred'));

-- 2. Track which academic year a student passed out
ALTER TABLE students ADD COLUMN IF NOT EXISTS passed_out_year TEXT;

-- 3. Allow marking students as repeaters (stay in same class)
ALTER TABLE students ADD COLUMN IF NOT EXISTS repeat_class BOOLEAN DEFAULT false;

-- 4. Any rollover transfers existing students' new status
ALTER TABLE students ADD COLUMN IF NOT EXISTS promoted_from_class_id UUID REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS promoted_to_class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

-- 5. Track class change history
CREATE TABLE IF NOT EXISTS student_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  from_section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  to_section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  from_academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  to_academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  promotion_type TEXT DEFAULT 'promoted' CHECK (promotion_type IN ('promoted', 'passed_out', 'repeat', 'transferred')),
  promoted_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- 6. Rollover audit log
CREATE TABLE IF NOT EXISTS rollover_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  from_academic_year_id UUID REFERENCES academic_years(id),
  to_academic_year_id UUID REFERENCES academic_years(id),
  students_promoted INT DEFAULT 0,
  students_passed_out INT DEFAULT 0,
  students_repeated INT DEFAULT 0,
  fee_structures_copied INT DEFAULT 0,
  transport_assignments_copied INT DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'reverted')),
  fee_increase_percent DECIMAL(5,2) DEFAULT 0,
  error_message TEXT,
  created_by UUID,
  reverted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Opening balance / arrears support on fee payments (for real school migration)
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS is_opening_balance BOOLEAN DEFAULT false;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS opening_balance_note TEXT;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS original_due_date DATE;

-- 8. Indexes for performance on rollover queries
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_academic_year ON students(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_rollover_logs_school ON rollover_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_student_promotions_school ON student_promotions(school_id);
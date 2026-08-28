-- Fee Exemptions Table
CREATE TABLE IF NOT EXISTS fee_exemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, fee_structure_id)
);
CREATE INDEX IF NOT EXISTS idx_fee_exemptions_school ON fee_exemptions(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_exemptions_structure ON fee_exemptions(fee_structure_id);

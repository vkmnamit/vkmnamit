-- Add payroll structures for teachers

CREATE TABLE payroll_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  frequency TEXT DEFAULT 'monthly',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add payroll_structure_id to existing teacher_payroll table
ALTER TABLE teacher_payroll 
ADD COLUMN payroll_structure_id UUID REFERENCES payroll_structures(id) ON DELETE SET NULL;

CREATE INDEX idx_payroll_structures_school ON payroll_structures(school_id);

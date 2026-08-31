-- Complete Fee Management System Migration

-- Fee Categories
CREATE TABLE IF NOT EXISTS fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  default_amount DECIMAL(12,2) DEFAULT 0,
  tax_percent DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_categories_school ON fee_categories(school_id);

-- Fee Discounts
CREATE TABLE IF NOT EXISTS fee_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  fee_payment_id UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'custom',
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_discounts_student ON fee_discounts(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_discounts_school ON fee_discounts(school_id);

-- Fee Fines
CREATE TABLE IF NOT EXISTS fee_fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  fee_payment_id UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE,
  is_paid BOOLEAN DEFAULT false,
  remarks TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_fines_student ON fee_fines(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_fines_school ON fee_fines(school_id);

-- Fee Refunds
CREATE TABLE IF NOT EXISTS fee_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  fee_payment_id UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  reference_number TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_refunds_student ON fee_refunds(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_refunds_school ON fee_refunds(school_id);

-- Add missing columns to fee_payments
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES fee_categories(id) ON DELETE SET NULL;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS fine_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS reference_number TEXT;

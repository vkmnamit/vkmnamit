-- Run this in your Supabase SQL Editor to upgrade the inventory schema

CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(12,2);
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12,2);
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS max_stock INT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Piece';
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS shelf_number TEXT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS warranty_details TEXT;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'stock_added', 'issue', 'return', 'repair', 'damage', 'lost', 'dispose', 'adjustment')),
  quantity INT NOT NULL,
  previous_stock INT NOT NULL,
  updated_stock INT NOT NULL,
  issued_to_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  issued_to_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  remarks TEXT,
  reference_doc_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_inventory_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  required_quantity INT DEFAULT 1,
  is_mandatory BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_inventory_distribution (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'returned', 'lost', 'damaged', 'replaced')),
  issue_date TIMESTAMPTZ,
  expected_return_date DATE,
  actual_return_date TIMESTAMPTZ,
  fee_payment_id UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
  receipt_number TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

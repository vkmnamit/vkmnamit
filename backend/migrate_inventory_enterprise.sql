CREATE TABLE inventory_kits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_kit_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kit_id UUID REFERENCES inventory_kits(id) ON DELETE CASCADE,
  item_id UUID REFERENCES school_inventory(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1
);

CREATE TABLE bulk_inventory_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  kit_id UUID REFERENCES inventory_kits(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'undone')),
  student_count INT DEFAULT 0,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_transactions ADD COLUMN bulk_operation_id UUID REFERENCES bulk_inventory_operations(id) ON DELETE SET NULL;
ALTER TABLE student_inventory_distribution ADD COLUMN bulk_operation_id UUID REFERENCES bulk_inventory_operations(id) ON DELETE SET NULL;
ALTER TABLE fee_payments ADD COLUMN bulk_operation_id UUID REFERENCES bulk_inventory_operations(id) ON DELETE SET NULL;

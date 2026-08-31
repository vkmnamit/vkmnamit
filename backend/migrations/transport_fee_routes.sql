-- Transport Routes & Fees Migration
-- Route-based recurring fee support, independent of class/section

-- 1. Create transport_routes table
CREATE TABLE IF NOT EXISTS transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  fee_amount DECIMAL(12,2) DEFAULT 0,
  pickup_points TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transport_routes_school ON transport_routes(school_id);

-- 2. Add transport_route_id to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS transport_route_id UUID REFERENCES transport_routes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_students_transport_route ON students(transport_route_id);

-- 3. Add transport_route_id and applies_to to fee_structures
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS transport_route_id UUID REFERENCES transport_routes(id) ON DELETE SET NULL;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS applies_to TEXT DEFAULT 'class';
-- applies_to values: 'class', 'all', 'transport_route'

-- 4. Add transport_route_id to fee_payments for reference tracking
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS transport_route_id UUID REFERENCES transport_routes(id) ON DELETE SET NULL;

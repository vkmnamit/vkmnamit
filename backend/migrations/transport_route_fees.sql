-- Transport Routes: Add fee frequency columns
-- Run this in your Supabase SQL editor

ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(12,2) DEFAULT 0;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS quarterly_fee DECIMAL(12,2) DEFAULT 0;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS annual_fee DECIMAL(12,2) DEFAULT 0;

-- Compatibility for installations created from the original schema, which
-- used route_name, JSON pickup points, and did not include route fee metadata.
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS route_name TEXT;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE transport_routes ALTER COLUMN pickup_points TYPE TEXT USING pickup_points::text;

UPDATE transport_routes
SET name = route_name
WHERE name IS NULL AND route_name IS NOT NULL;

-- Migration to fix school_inventory schema mismatches
-- 1. Add missing 'unit' column to school_inventory
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS unit TEXT;

-- 2. Add 'description' column for better item tracking
ALTER TABLE school_inventory ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Update category check to include 'Office' (as seen in the user's Postman request)
ALTER TABLE school_inventory DROP CONSTRAINT IF EXISTS school_inventory_category_check;
ALTER TABLE school_inventory ADD CONSTRAINT school_inventory_category_check 
  CHECK (category IN ('Library', 'Stationery', 'Arts', 'IT', 'Sports', 'Office', 'Other'));

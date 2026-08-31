-- Add Razorpay columns to schools table if missing
ALTER TABLE schools ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;

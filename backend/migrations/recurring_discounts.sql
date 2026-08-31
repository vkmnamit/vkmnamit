ALTER TABLE fee_discounts ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT 'one_time';
ALTER TABLE fee_discounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_fee_discounts_recurrence ON fee_discounts(recurrence);
CREATE INDEX IF NOT EXISTS idx_fee_discounts_active ON fee_discounts(is_active);
UPDATE fee_discounts SET recurrence = 'monthly' WHERE type = 'monthly' AND recurrence = 'one_time';
UPDATE fee_discounts SET recurrence = 'quarterly' WHERE type = 'quarterly' AND recurrence = 'one_time';
UPDATE fee_discounts SET recurrence = 'annually' WHERE type = 'annually' AND recurrence = 'one_time';

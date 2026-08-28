-- Keeps fee records reportable by academic year, including fees created by
-- automation, manual adjustments, inventory, and bulk operations.
ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL;

UPDATE students AS student
SET academic_year_id = year.id
FROM academic_years AS year
WHERE student.academic_year_id IS NULL
  AND student.school_id = year.school_id
  AND year.is_current = true;

UPDATE fee_payments AS payment
SET academic_year_id = COALESCE(structure.academic_year_id, student.academic_year_id)
FROM students AS student
LEFT JOIN fee_structures AS structure ON structure.id = payment.fee_structure_id
WHERE payment.student_id = student.id
  AND payment.academic_year_id IS NULL;

UPDATE fee_payments AS payment
SET academic_year_id = year.id
FROM academic_years AS year
WHERE payment.academic_year_id IS NULL
  AND payment.school_id = year.school_id
  AND year.is_current = true;

CREATE INDEX IF NOT EXISTS idx_fee_payments_school_academic_year
  ON fee_payments(school_id, academic_year_id);

CREATE OR REPLACE FUNCTION assign_fee_payment_academic_year()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.academic_year_id IS NULL AND NEW.fee_structure_id IS NOT NULL THEN
    SELECT academic_year_id INTO NEW.academic_year_id
    FROM fee_structures
    WHERE id = NEW.fee_structure_id;
  END IF;

  IF NEW.academic_year_id IS NULL AND NEW.student_id IS NOT NULL THEN
    SELECT academic_year_id INTO NEW.academic_year_id
    FROM students
    WHERE id = NEW.student_id;
  END IF;

  IF NEW.academic_year_id IS NULL AND NEW.school_id IS NOT NULL THEN
    SELECT id INTO NEW.academic_year_id
    FROM academic_years
    WHERE school_id = NEW.school_id
      AND is_current = true
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_fee_payment_academic_year ON fee_payments;
CREATE TRIGGER set_fee_payment_academic_year
  BEFORE INSERT OR UPDATE OF fee_structure_id, student_id, school_id, academic_year_id
  ON fee_payments
  FOR EACH ROW
  EXECUTE FUNCTION assign_fee_payment_academic_year();

-- Drop the restrictive check constraint on lms_submissions status
ALTER TABLE lms_submissions DROP CONSTRAINT IF EXISTS lms_submissions_status_check;

-- Add the updated constraint that allows 'assigned', 'pending', and 'completed' statuses
ALTER TABLE lms_submissions ADD CONSTRAINT lms_submissions_status_check CHECK (status IN ('submitted', 'graded', 'late', 'assigned', 'pending', 'completed'));

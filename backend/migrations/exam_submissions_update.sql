-- Add content_url to exam_results to allow students to upload exam answer sheets
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS content_url TEXT;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;

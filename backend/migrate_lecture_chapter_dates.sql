ALTER TABLE lecture_plans ADD COLUMN IF NOT EXISTS chapter_start_date DATE;
ALTER TABLE lecture_plans ADD COLUMN IF NOT EXISTS chapter_end_date DATE;

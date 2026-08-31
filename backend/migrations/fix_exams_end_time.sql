-- Fix: "Could not find the 'end_time' column of 'exams'"
-- Run in Supabase SQL Editor if exam creation fails

ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS room TEXT;

-- Add created_by column to exams table
ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

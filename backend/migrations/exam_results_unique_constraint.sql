-- Marks save uses upsert with onConflict: 'exam_id,student_id'. Postgres rejects
-- that when the unique constraint is missing, which made teacher-entered marks
-- silently fail to persist (UI kept showing defaults). Run once:
CREATE UNIQUE INDEX IF NOT EXISTS exam_results_exam_student_unique
  ON exam_results (exam_id, student_id);

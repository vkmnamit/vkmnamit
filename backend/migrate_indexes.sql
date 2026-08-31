-- ==========================================
-- COMPREHENSIVE DATABASE INDEXING
-- Run this in Supabase SQL Editor
-- ==========================================

-- Core School/Student Relations
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_sections_class ON sections(class_id);

-- Attendance (High Volume)
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, date);

-- Fees & Payments (High Volume)
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school ON fee_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_bulk_op ON fee_payments(bulk_operation_id);

-- Inventory Core
CREATE INDEX IF NOT EXISTS idx_school_inventory_status ON school_inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_categories_school ON inventory_categories(school_id);

-- Inventory Transactions (High Volume)
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_school ON inventory_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_student ON inventory_transactions(issued_to_student_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_bulk_op ON inventory_transactions(bulk_operation_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at ON inventory_transactions(created_at DESC);

-- Inventory Distribution (High Volume)
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_student ON student_inventory_distribution(student_id);
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_item ON student_inventory_distribution(item_id);
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_status ON student_inventory_distribution(status);
CREATE INDEX IF NOT EXISTS idx_student_inv_dist_bulk_op ON student_inventory_distribution(bulk_operation_id);

-- Enterprise Bulk Issue (New Tables)
CREATE INDEX IF NOT EXISTS idx_inventory_kits_school ON inventory_kits(school_id);
CREATE INDEX IF NOT EXISTS idx_inventory_kit_items_kit ON inventory_kit_items(kit_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inv_ops_school ON bulk_inventory_operations(school_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inv_ops_class_section ON bulk_inventory_operations(class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inv_ops_status ON bulk_inventory_operations(status);

-- Timetable & Academic
CREATE INDEX IF NOT EXISTS idx_timetable_section ON timetable_slots(section_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_day ON timetable_slots(day_of_week);

-- Exams & Results
CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON exam_results(student_id);

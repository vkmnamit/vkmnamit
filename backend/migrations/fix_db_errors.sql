-- Migration: Fix missing columns causing Postgres errors in logs
-- Run this in Supabase SQL Editor

-- 1. Add 'room' column to timetable_slots (the code uses room_number but some queries use 'room')
ALTER TABLE timetable_slots
  ADD COLUMN IF NOT EXISTS room TEXT;

-- Sync existing room_number into room
UPDATE timetable_slots SET room = room_number WHERE room IS NULL AND room_number IS NOT NULL;

-- 2. Ensure fee_payments.amount has a default of 0 to prevent NOT NULL violations
ALTER TABLE fee_payments
  ALTER COLUMN amount SET DEFAULT 0,
  ALTER COLUMN paid_amount SET DEFAULT 0;

-- 3. Add payment_method default
ALTER TABLE fee_payments
  ALTER COLUMN payment_method SET DEFAULT 'unpaid';

-- 4. Make classes.grade nullable and default to 0 to support text/word classes like Nursery, LKG, UKG
ALTER TABLE classes
  ALTER COLUMN grade DROP NOT NULL,
  ALTER COLUMN grade SET DEFAULT 0;
-- 5. Fix missing school_id column in exam_results
ALTER TABLE exam_results
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

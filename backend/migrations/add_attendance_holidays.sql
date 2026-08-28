-- Attendance Holidays & Non-Working Days
-- School staff (admin / class teacher) can mark one-off dates as holidays.
-- Sundays are always treated as non-working, plus any row in this table.
CREATE TABLE IF NOT EXISTS attendance_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_holidays_school_date ON attendance_holidays(school_id, date);

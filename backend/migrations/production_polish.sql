-- Production polish: section-level subject allocation + notification indexes
-- Run in Supabase SQL Editor

ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE CASCADE;

-- Per-section subject+teacher mapping (allows different teachers per section)
DROP INDEX IF EXISTS uq_class_subjects_section_subject;
CREATE UNIQUE INDEX uq_class_subjects_section_subject
  ON class_subjects (section_id, subject_id)
  WHERE section_id IS NOT NULL;

-- Track fee reminder sends to avoid duplicates
CREATE TABLE IF NOT EXISTS fee_reminder_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fee_payment_id UUID NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fee_payment_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_fee_reminder_log_payment ON fee_reminder_log(fee_payment_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, status) WHERE status = 'unread';

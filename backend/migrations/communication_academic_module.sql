-- ============================================
-- Communication & Academic Module Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- ── 1. IN-APP NOTIFICATIONS ────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read')),
  source_type TEXT CHECK (source_type IN ('notification', 'email', 'query', 'assignment', 'exam', 'timetable')),
  source_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_notifications_school ON user_notifications(school_id);

-- ── 2. INTERNAL MESSAGES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'chat' CHECK (type IN ('chat', 'query', 'announcement')),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_school ON messages(school_id);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, receiver_id);

-- ── 3. EMAIL LOGS (School-level email management) ───────────
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES users(id),
  recipient_user_id UUID REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  recipient_type TEXT CHECK (recipient_type IN ('student', 'parent', 'teacher', 'admin', 'staff')),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  template_type TEXT,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'opened')),
  opened_at TIMESTAMPTZ,
  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_school ON email_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_student ON email_logs(student_id);

-- ── 4. SUPPORT QUERIES / TICKETING ─────────────────────────
CREATE TABLE IF NOT EXISTS support_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  raised_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raised_by_role TEXT NOT NULL CHECK (raised_by_role IN ('student', 'parent', 'teacher', 'admin')),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'academic', 'leave', 'fee', 'transport', 'certificate', 'complaint',
    'hr', 'technical', 'resource', 'administrative', 'general'
  )),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(school_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_support_queries_school ON support_queries(school_id);
CREATE INDEX IF NOT EXISTS idx_support_queries_status ON support_queries(status);
CREATE INDEX IF NOT EXISTS idx_support_queries_raised_by ON support_queries(raised_by_user_id);

CREATE TABLE IF NOT EXISTS query_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_id UUID NOT NULL REFERENCES support_queries(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_replies_query ON query_replies(query_id);

-- Ticket number sequence per school (function)
CREATE OR REPLACE FUNCTION generate_ticket_number(p_school_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM support_queries WHERE school_id = p_school_id;
  RETURN 'TKT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ── 5. COMMUNICATION TIMELINE ──────────────────────────────
CREATE TABLE IF NOT EXISTS communication_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'notification', 'email', 'query', 'query_reply', 'assignment', 'exam', 'timetable', 'message'
  )),
  title TEXT NOT NULL,
  description TEXT,
  reference_id UUID,
  reference_table TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_timeline_user ON communication_timeline(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_timeline_student ON communication_timeline(student_id);

-- ── 6. SUBJECT ENHANCEMENTS ────────────────────────────────
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id);

ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE CASCADE;

-- ── 7. TIMETABLE ENHANCEMENTS ────────────────────────────────
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS room_number TEXT;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS is_break BOOLEAN DEFAULT false;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS timetable_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  published_by UUID REFERENCES users(id),
  snapshot JSONB NOT NULL DEFAULT '[]',
  published_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, version_number)
);

-- ── 8. ASSIGNMENT ENHANCEMENTS ───────────────────────────────
ALTER TABLE lms_assignments ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS max_marks DECIMAL(6,2);
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS reference_files JSONB DEFAULT '[]';
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE lms_assignments ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;

-- ── 9. EXAM ENHANCEMENTS ─────────────────────────────────────
ALTER TABLE exams ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS duration_minutes INT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_time TIME;

-- ── 10. NOTIFICATION LOGS ENHANCEMENT ────────────────────────
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS subject TEXT;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time TIMESTAMPTZ,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_school ON push_subscriptions(school_id);

-- ── 11. UPDATED_AT TRIGGER FOR QUERIES ───────────────────────
CREATE OR REPLACE FUNCTION update_support_query_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_queries_updated ON support_queries;
CREATE TRIGGER trg_support_queries_updated
  BEFORE UPDATE ON support_queries
  FOR EACH ROW EXECUTE FUNCTION update_support_query_timestamp();

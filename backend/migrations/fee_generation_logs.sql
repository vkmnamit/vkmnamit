-- ════════════════════════════════════════════════════════════════════════════
-- FEE GENERATION LOGS + PERFORMANCE INDEXES
-- 
-- 1. fee_generation_logs table — tracks every fee generation run (cron/admin)
--    so schools can answer "Why were only 2,942 fees generated?"
-- 2. Performance indexes on fee_payments — speeds up duplicate detection
--    as payment records grow (100k+ rows)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Generation Logs Table
CREATE TABLE IF NOT EXISTS fee_generation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                    -- e.g. "August 2026"
  year INT NOT NULL,                      -- e.g. 2026
  triggered_by TEXT NOT NULL DEFAULT 'admin',  -- 'cron' | 'admin'
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  fee_type TEXT NOT NULL DEFAULT 'both',  -- 'tuition' | 'transport' | 'both'
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  
  -- Counts
  total_generated INT NOT NULL DEFAULT 0,
  tuition_generated INT NOT NULL DEFAULT 0,
  transport_generated INT NOT NULL DEFAULT 0,
  total_skipped INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  
  -- Metrics
  generation_time_ms INT,                -- total time in milliseconds
  students_processed INT NOT NULL DEFAULT 0,
  fees_per_sec DECIMAL(10,2),             -- generated / (time_ms / 1000)
  
  -- Details
  details JSONB,                          -- array of per-structure breakdowns
  errors TEXT[],                          -- array of error messages
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for generation logs
CREATE INDEX IF NOT EXISTS idx_fee_gen_logs_school ON fee_generation_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_gen_logs_school_month ON fee_generation_logs(school_id, month, year);
CREATE INDEX IF NOT EXISTS idx_fee_gen_logs_status ON fee_generation_logs(status);
CREATE INDEX IF NOT EXISTS idx_fee_gen_logs_created ON fee_generation_logs(created_at DESC);

-- 2. Performance Indexes on fee_payments
-- These speed up the duplicate detection queries that check:
--   "Does this student already have a fee for this structure this month?"

-- Composite index for tuition fee duplicate detection
-- Used by: WHERE school_id = ? AND (title.ilike.%month% OR remarks.ilike.%month%)
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_title 
  ON fee_payments(school_id, title);

CREATE INDEX IF NOT EXISTS idx_fee_payments_school_remarks 
  ON fee_payments(school_id, remarks);

-- Used by: WHERE school_id = ? AND fee_structure_id = ? AND student_id = ?
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_struct_student 
  ON fee_payments(school_id, fee_structure_id, student_id);

-- Used by: WHERE transport_route_id = ? AND title = ? AND created_at >= ?
CREATE INDEX IF NOT EXISTS idx_fee_payments_transport_route 
  ON fee_payments(school_id, transport_route_id, title, created_at);

-- Used by: WHERE school_id = ? AND status = ? (for overdue marking, stats)
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_status 
  ON fee_payments(school_id, status);

-- Used by: WHERE school_id = ? AND due_date < ? (for overdue detection)
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_due_date 
  ON fee_payments(school_id, due_date);

-- Used by: WHERE school_id = ? AND created_at >= ? AND created_at < ? (monthly range)
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_created 
  ON fee_payments(school_id, created_at);

-- Used by: WHERE student_id = ? AND school_id = ? (student ledger)
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_school 
  ON fee_payments(student_id, school_id);

-- 3. Add comment to the table
COMMENT ON TABLE fee_generation_logs IS 'Tracks every fee generation run (cron or admin-triggered) with metrics for audit and performance monitoring';
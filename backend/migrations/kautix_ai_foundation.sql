-- Kautix AI: durable chat context, action audit, and school-scoped knowledge retrieval.

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE;

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

UPDATE chat_sessions
SET school_id = users.school_id
FROM users
WHERE chat_sessions.user_id = users.id
  AND chat_sessions.school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_school
  ON chat_sessions(user_id, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON chat_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS ai_action_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmation_status TEXT NOT NULL CHECK (confirmation_status IN ('not_required', 'pending', 'confirmed', 'rejected', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_audits_school_created
  ON ai_action_audits(school_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_session_memories (
  session_id UUID PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_session_memories_user_school
  ON ai_session_memories(user_id, school_id);

CREATE TABLE IF NOT EXISTS ai_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  workflow_type TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'planned',
  confirmation_required BOOLEAN NOT NULL DEFAULT true,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES ai_workflows(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  position SMALLINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')) DEFAULT 'pending',
  confirmation_required BOOLEAN NOT NULL DEFAULT false,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(workflow_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_workflows_user_school_status
  ON ai_workflows(user_id, school_id, status, created_at DESC);

ALTER TABLE ai_workflow_steps ADD COLUMN IF NOT EXISTS depends_on TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE ai_workflow_steps ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_workflow_steps ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_workflow_steps ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_documents_school_active
  ON ai_knowledge_documents(school_id, is_active);

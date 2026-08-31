import { Router, Response } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.middleware';
import { aiService } from '../services/ai.service';
import { refreshSessionMemory } from '../services/ai-context.service';
import { aiWorkflowService } from '../services/ai-workflow.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

async function requireOwnedWorkflow(req: AuthenticatedRequest, workflowId: string) {
  const { data, error } = await supabaseAdmin
    .from('ai_workflows')
    .select('id')
    .eq('id', workflowId)
    .eq('user_id', req.user!.id)
    .eq('school_id', req.user!.school_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Workflow not found');
}

router.get('/workflows/:workflowId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    await requireOwnedWorkflow(req, req.params.workflowId);
    return res.json(await aiWorkflowService.getProgress(req.params.workflowId));
  } catch (error: any) {
    return res.status(error.message === 'Workflow not found' ? 404 : 500).json({ error: error.message || 'Failed to fetch workflow progress' });
  }
});

router.post('/workflows/:workflowId/retry', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    await requireOwnedWorkflow(req, req.params.workflowId);
    const progress = await aiWorkflowService.retry(req.params.workflowId);
    await supabaseAdmin.from('ai_action_audits').insert({
      school_id: req.user!.school_id, user_id: req.user!.id, role: req.user!.role,
      tool_name: 'workflow_retry', input: { workflowId: req.params.workflowId }, result: progress, confirmation_status: 'confirmed',
    });
    return res.json(progress);
  } catch (error: any) {
    return res.status(error.message === 'Workflow not found' ? 404 : 400).json({ error: error.message || 'Failed to retry workflow' });
  }
});

router.post('/workflows/:workflowId/rollback', authMiddleware, roleGuard('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    await requireOwnedWorkflow(req, req.params.workflowId);
    const progress = await aiWorkflowService.rollback(req.params.workflowId);
    await supabaseAdmin.from('ai_action_audits').insert({
      school_id: req.user!.school_id, user_id: req.user!.id, role: req.user!.role,
      tool_name: 'workflow_rollback', input: { workflowId: req.params.workflowId }, result: progress, confirmation_status: 'confirmed',
    });
    return res.json(progress);
  } catch (error: any) {
    return res.status(error.message === 'Workflow not found' ? 404 : 400).json({ error: error.message || 'Failed to roll back workflow' });
  }
});

/** School administrators manage the documents available to Kautix knowledge search. */
router.get('/knowledge', authMiddleware, roleGuard('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_knowledge_documents')
      .select('id, title, category, metadata, is_active, created_at, updated_at')
      .eq('school_id', req.user!.school_id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch knowledge documents' });
  }
});

router.post('/knowledge', authMiddleware, roleGuard('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const { title, content, category, metadata = {} } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'A title and document content are required' });
    }
    const { data, error } = await supabaseAdmin
      .from('ai_knowledge_documents')
      .insert({ school_id: req.user!.school_id, title: title.trim(), content: content.trim(), category: category?.trim() || null, metadata, created_by: req.user!.id })
      .select('id, title, category, is_active, created_at')
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create knowledge document' });
  }
});

/**
 * @route GET /api/ai/sessions
 * @desc Get all chat sessions for the current user
 */
router.get('/sessions', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { data: sessions, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(sessions);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * @route POST /api/ai/sessions
 * @desc Create a new chat session
 */
router.post('/sessions', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { title = 'New Conversation' } = req.body;

    const { data: session, error } = await supabaseAdmin
      .from('chat_sessions')
      .insert({ user_id: userId, school_id: req.user!.school_id, title })
      .select()
      .single();

    if (error) throw error;
    return res.json(session);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * @route POST /api/ai/chat
 * @desc Get a response from the Kautix AI chatbot (Session-aware)
 */
router.post('/chat', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, sessionId, language = 'en' } = req.body;
    const user = req.user!;
    const userId = user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Resolve a session from the authenticated user only. Session IDs supplied by
    // clients are never trusted as an authority boundary.
    let activeSessionId = sessionId;
    if (activeSessionId) {
      const { data: ownedSession, error: sessionError } = await supabaseAdmin
        .from('chat_sessions')
        .select('id')
        .eq('id', activeSessionId)
        .eq('user_id', userId)
        .eq('school_id', user.school_id)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!ownedSession) return res.status(404).json({ error: 'Chat session not found' });
    } else {
      const { data: newSess } = await supabaseAdmin
        .from('chat_sessions')
        .insert({ user_id: userId, school_id: user.school_id, title: message.substring(0, 30) })
        .select()
        .single();
      activeSessionId = newSess?.id;
    }

    // Give the model recent, user-owned context from this conversation only.
    const { data: previousMessages } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', userId)
      .eq('session_id', activeSessionId)
      .order('created_at', { ascending: false })
      .limit(12);

    // 2. Save user message
    if (activeSessionId) {
      await supabaseAdmin.from('chat_messages').insert({
        user_id: userId,
        session_id: activeSessionId,
        role: 'user',
        content: message
      });
    }

    // 3. Get AI response
    const response = await aiService.getChatbotResponse({
      userId,
      schoolId: user.school_id,
      role: user.role,
      message,
      language,
      sessionId: activeSessionId,
      conversation: (previousMessages || []).reverse(),
    });

    if (response.toolEvents?.length) {
      await supabaseAdmin.from('ai_action_audits').insert(response.toolEvents.map((event: any) => ({
        school_id: user.school_id,
        user_id: userId,
        role: user.role,
        session_id: activeSessionId,
        tool_name: event.toolName,
        input: event.input,
        result: event.result,
        confirmation_status: event.confirmationStatus,
      })));
    }

    // 4. Save AI response
    if (response.reply && activeSessionId) {
      await supabaseAdmin.from('chat_messages').insert({
        user_id: userId,
        session_id: activeSessionId,
        role: 'assistant',
        content: response.reply
      });
      try {
        await refreshSessionMemory({ sessionId: activeSessionId, userId, schoolId: user.school_id });
      } catch (memoryError) {
        // Memory failures should not hide a completed AI response from the user.
        console.error('AI session memory refresh failed:', memoryError);
      }
    }

    const { toolEvents: _toolEvents, ...chatResponse } = response;
    return res.json({ ...chatResponse, sessionId: activeSessionId });
  } catch (error) {
    console.error('AI Chat Error:', error);
    return res.status(500).json({ error: 'Internal AI processing error' });
  }
});

/**
 * @route GET /api/ai/history
 * @desc Get chat history for a specific session
 */
router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.query;

    let activeSessionId = sessionId as string | undefined;
    if (!activeSessionId) {
      const { data: latestSession } = await supabaseAdmin
        .from('chat_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('school_id', req.user!.school_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      activeSessionId = latestSession?.id;
    }

    let query = supabaseAdmin
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (activeSessionId) {
      const { data: ownedSession, error: sessionError } = await supabaseAdmin
        .from('chat_sessions')
        .select('id')
        .eq('id', activeSessionId)
        .eq('user_id', userId)
        .eq('school_id', req.user!.school_id)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!ownedSession) return res.status(404).json({ error: 'Chat session not found' });
      query = query.eq('session_id', activeSessionId);
    } else {
      return res.json({ sessionId: null, messages: [] });
    }

    const { data: messages, error } = await query.limit(100);

    if (error) throw error;
    return res.json({ sessionId: activeSessionId, messages });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * @route GET /api/ai/trends
 * @desc Get AI-driven analysis of studying trends
 */
router.get('/trends', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { level = 'school' } = req.query;
    const analysis = await aiService.analyzeStudyingTrends(
      req.user!.school_id,
      level as any
    );
    return res.json(analysis);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to analyze trends' });
  }
});

/**
 * @route GET /api/ai/performance-summary/:studentId
 * @desc Get AI-generated performance summary for a specific student
 */
router.get('/performance-summary/:studentId?', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const studentId = req.params.studentId || req.query.studentId;

    // 1. Resolve Student profile
    let studentQuery = supabaseAdmin
      .from('students')
      .select('*, section:sections(*, class:classes(*))');

    if (studentId && (req.user!.role === 'admin' || req.user!.role === 'teacher')) {
      studentQuery = studentQuery.eq('id', studentId);
    } else {
      studentQuery = studentQuery.eq('user_id', userId);
    }

    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student || !student.section || !(student.section as any).class) {
      return res.status(404).json({
        error: 'Student profile or class mapping not found',
        suggestion: 'Ensure the studentId is valid and the student is assigned to a class.'
      });
    }

    // 2. Call AI service
    const aiSummary = await aiService.getPerformanceSummary({
      schoolId: req.user!.school_id,
      className: (student.section as any).class.name,
      sectionName: (student.section as any).name,
    });

    return res.json({ aiSummary });
  } catch (error: any) {
    console.error('AI performance summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch AI performance summary' });
  }
});

export default router;

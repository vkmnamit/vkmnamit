import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { notificationService } from '../services/notification.service';

async function logTimeline(params: {
  schoolId: string;
  userId: string;
  studentId?: string;
  eventType: string;
  title: string;
  description?: string;
  referenceId?: string;
  referenceTable?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from('communication_timeline').insert({
      school_id: params.schoolId,
      user_id: params.userId,
      student_id: params.studentId || null,
      event_type: params.eventType,
      title: params.title,
      description: params.description || null,
      reference_id: params.referenceId || null,
      reference_table: params.referenceTable || null,
      metadata: params.metadata || {},
    });
  } catch {
    /* non-blocking */
  }
}

export async function createQuery(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const role = req.user!.role;
    const { category, subject, description, studentId, priority, targetRole, teacherId } = req.body;

    if (!subject?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }

    const allowedRoles = ['student', 'parent', 'teacher'];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Only students, parents, and teachers can raise queries' });
    }

    const { count } = await supabaseAdmin
      .from('support_queries')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId);
    const ticketNumber = `TKT-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(5, '0')}`;

    const { data, error } = await supabaseAdmin
      .from('support_queries')
      .insert({
        school_id: schoolId,
        ticket_number: ticketNumber,
        raised_by_user_id: userId,
        raised_by_role: role,
        student_id: studentId || null,
        category: category || 'general',
        subject: subject.trim(),
        description: description.trim(),
        priority: priority || 'medium',
        status: 'open',
        ...(teacherId ? { teacher_id: teacherId } : {})
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    await logTimeline({
      schoolId,
      userId,
      studentId,
      eventType: 'query',
      title: `Query raised: ${subject}`,
      description,
      referenceId: data.id,
      referenceTable: 'support_queries',
    });

    // Notify target role
    const notifyRole = targetRole || 'admin';
    
    let notifyQuery = supabaseAdmin
      .from('users')
      .select('id, email, name')
      .eq('school_id', schoolId)
      .eq('is_active', true);
      
    if (notifyRole === 'teacher' && teacherId) {
      notifyQuery = notifyQuery.eq('id', teacherId);
    } else {
      notifyQuery = notifyQuery.eq('role', notifyRole);
    }

    const { data: notifyUsers } = await notifyQuery;

    for (const u of notifyUsers || []) {
      await notificationService.createInAppNotification({
        schoolId,
        userId: u.id,
        type: 'query_new',
        title: `New ${role} query: ${subject}`,
        message: description.slice(0, 200),
        sourceType: 'query',
        sourceId: data.id,
      });
    }

    return res.status(201).json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to create query' });
  }
}

export async function getQueries(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const role = req.user!.role;
    const { status, category, priority, userType, startDate, endDate } = req.query;

    let query = supabaseAdmin
      .from('support_queries')
      .select(`
        *,
        raised_by:users!support_queries_raised_by_user_id_fkey(id, first_name, last_name, role, email),
        assigned:users!support_queries_assigned_to_fkey(id, first_name, last_name),
        student:students(id, admission_number, user:users(first_name, last_name))
      `)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (role !== 'admin') {
      query = query.eq('raised_by_user_id', userId);
    } else {
      if (userType) query = query.eq('raised_by_role', userType as string);
    }

    if (status) query = query.eq('status', status as string);
    if (category) query = query.eq('category', category as string);
    if (priority) query = query.eq('priority', priority as string);
    if (startDate) query = query.gte('created_at', startDate as string);
    if (endDate) query = query.lte('created_at', endDate as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch queries' });
  }
}

export async function getQueryById(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const role = req.user!.role;
    const { id } = req.params;

    const { data: query, error } = await supabaseAdmin
      .from('support_queries')
      .select(`
        *,
        raised_by:users!support_queries_raised_by_user_id_fkey(id, first_name, last_name, role, email),
        assigned:users!support_queries_assigned_to_fkey(id, first_name, last_name),
        student:students(id, admission_number, user:users(first_name, last_name))
      `)
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (error || !query) return res.status(404).json({ error: 'Query not found' });
    if (role !== 'admin' && query.raised_by_user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: replies } = await supabaseAdmin
      .from('query_replies')
      .select('*, sender:users(id, first_name, last_name, role)')
      .eq('query_id', id)
      .order('created_at', { ascending: true });

    return res.json({ ...query, replies: replies || [] });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch query' });
  }
}

export async function replyToQuery(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const role = req.user!.role;
    const { id } = req.params;
    const { message, attachments } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const { data: query, error: qErr } = await supabaseAdmin
      .from('support_queries')
      .select('*')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (qErr || !query) return res.status(404).json({ error: 'Query not found' });

    const isAdmin = role === 'admin';
    const isOwner = query.raised_by_user_id === userId;
    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Access denied' });

    const { data: reply, error } = await supabaseAdmin
      .from('query_replies')
      .insert({
        query_id: id,
        sender_id: userId,
        sender_role: role,
        message: message.trim(),
        attachments: attachments || [],
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const newStatus = isAdmin && query.status === 'open' ? 'in_progress' : query.status;
    await supabaseAdmin
      .from('support_queries')
      .update({ status: newStatus })
      .eq('id', id);

    const notifyUserId = isAdmin ? query.raised_by_user_id : query.assigned_to;
    if (notifyUserId) {
      await notificationService.createInAppNotification({
        schoolId,
        userId: notifyUserId,
        type: 'query_reply',
        title: `Reply on: ${query.subject}`,
        message: message.slice(0, 200),
        sourceType: 'query',
        sourceId: id,
      });
    }

    await logTimeline({
      schoolId,
      userId: query.raised_by_user_id,
      studentId: query.student_id,
      eventType: 'query_reply',
      title: `Reply: ${query.subject}`,
      description: message,
      referenceId: id,
      referenceTable: 'support_queries',
    });

    return res.status(201).json(reply);
  } catch {
    return res.status(500).json({ error: 'Failed to send reply' });
  }
}

export async function updateQuery(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const role = req.user!.role;
    if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { status, priority, assignedTo } = req.body;

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (assignedTo !== undefined) updates.assigned_to = assignedTo;
    if (status === 'closed' || status === 'resolved') updates.closed_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('support_queries')
      .update(updates)
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    if (data) {
      await notificationService.createInAppNotification({
        schoolId,
        userId: data.raised_by_user_id,
        type: 'query_status',
        title: `Query ${status}: ${data.subject}`,
        message: `Your ticket ${data.ticket_number} has been updated to ${status}.`,
        sourceType: 'query',
        sourceId: data.id,
      });
    }

    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to update query' });
  }
}

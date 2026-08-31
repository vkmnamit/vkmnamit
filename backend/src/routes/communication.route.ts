import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../config/supabase';
import { notificationService } from '../services/notification.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getUserScope } from '../utils/userScope';
import { generateEmailHtml } from '../utils/email.template';
import { fetchAllRows } from '../utils/supabasePagination';

const router = express.Router();

// GET /api/communication/logs — Fetch notification logs for a school
router.get('/logs', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const { page = '1', limit = '100', channel, type } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const scope = await getUserScope(req.user!);

    let query = supabaseAdmin
      .from('notification_logs')
      .select('*', { count: 'exact' })
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    // If teacher, only show logs they sent (or logs for their sections if metadata allows filtering, but easiest is logs where user_id is theirs)
    if (req.user!.role === 'teacher') {
      query = query.eq('user_id', req.user!.id);
    }

    if (channel) query = query.eq('channel', channel as string);
    if (type) query = query.eq('type', type as string);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ logs: data, total: count });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// GET /api/communication — legacy route (same as logs)
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const { data } = await supabaseAdmin
      .from('notification_logs')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(50);

    return res.json({ announcements: [], messages: [], logs: data || [], stats: { totalNotices: data?.length || 0, unreadCount: 0, sentToday: 0 } });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch communication data' });
  }
});

// POST /api/communication/send-email — Bulk or targeted email dispatch
router.post('/send-email', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const { recipientType, filters, subject, message, type, channels: reqChannels, whatsappTemplate } = req.body;
    const activeChannels: ('whatsapp' | 'email')[] = reqChannels?.length
      ? reqChannels.filter((c: string) => ['whatsapp', 'email'].includes(c))
      : ['email', 'whatsapp'];

    let recipients: { email?: string; phone?: string; userId?: string; name?: string; type?: string; studentId?: string }[] = [];

    // Fetch school details
    const { data: school } = await supabaseAdmin.from('schools').select('name').eq('id', schoolId).single();
    const schoolName = school?.name || 'School Notification';

    // Security check: Parents and students can ONLY message teachers or admin
    if (['student', 'parent'].includes(req.user!.role)) {
      if (!['admin', 'teachers'].includes(recipientType)) {
        return res.status(403).json({ error: 'You are only authorized to message School Administration or Teachers.' });
      }
    }

    if (recipientType === 'admin') {
      const { data: admins } = await supabaseAdmin
        .from('users')
        .select('id, email, phone, first_name, last_name')
        .eq('school_id', schoolId)
        .eq('role', 'admin')
        .eq('is_active', true);
      recipients = (admins || []).map(a => ({ email: a.email, phone: a.phone, userId: a.id, name: `${a.first_name} ${a.last_name || ''}`, type: 'admin' }));
    } else if (recipientType === 'individual') {
      if (filters?.email || filters?.phone) {
        recipients.push({ email: filters.email, phone: filters.phone });
      } else if (filters?.studentId) {
        const { data: student } = await supabaseAdmin
          .from('students')
          .select('id, user:users(id, email, phone, first_name, last_name)')
          .eq('id', filters.studentId)
          .single();
        const sUser = (student as any)?.user;
        if (sUser) {
          recipients.push({ email: sUser.email, phone: sUser.phone, userId: sUser.id, name: `${sUser.first_name} ${sUser.last_name || ''}`, type: 'student', studentId: filters.studentId });
        }
        const { data: parentLink } = await supabaseAdmin
          .from('parent_students')
          .select('parent:parents(id, user:users(email, phone, id, first_name, last_name))')
          .eq('student_id', filters.studentId)
          .limit(1)
          .single();
        const pUser = (parentLink as any)?.parent?.user;
        if (pUser) {
          recipients.push({ email: pUser.email, phone: pUser.phone, userId: pUser.id, name: `${pUser.first_name} ${pUser.last_name || ''}`, type: 'parent', studentId: filters.studentId });
        }
      } else if (filters?.userId) {
        const { data: u } = await supabaseAdmin.from('users').select('*').eq('id', filters.userId).eq('school_id', schoolId).single();
        if (u) recipients.push({ email: u.email, phone: u.phone, userId: u.id, name: `${u.first_name} ${u.last_name || ''}`, type: u.role });
      }
    } else if (recipientType === 'teachers') {
      const { data: teachers } = await supabaseAdmin
        .from('users')
        .select('id, email, phone, first_name, last_name')
        .eq('school_id', schoolId)
        .eq('role', 'teacher')
        .eq('is_active', true);
      recipients = (teachers || []).map(t => ({ email: t.email, phone: t.phone, userId: t.id, name: `${t.first_name} ${t.last_name || ''}`, type: 'teacher' }));
    } else if (recipientType === 'all' || recipientType === 'school') {
      if (req.user!.role === 'teacher') {
        return res.status(403).json({ error: 'Teachers cannot send messages to the entire school. Please select a specific section you are assigned to.' });
      }
      const users = await fetchAllRows<any>(
        supabaseAdmin
          .from('users')
          .select('id, email, phone, first_name, last_name, role')
          .eq('school_id', schoolId)
          .eq('is_active', true)
          .in('role', ['student', 'parent', 'teacher'])
      );
      recipients = (users || []).map((u: any) => ({ email: u.email, phone: u.phone, userId: u.id, name: `${u.first_name} ${u.last_name || ''}`, type: u.role }));
    } else {
      // Build query to get students
      let studentQuery = supabaseAdmin
        .from('students')
        .select('id, user:users(first_name, last_name), section:sections(id, name, class_id)')
        .eq('school_id', schoolId);

      if (recipientType === 'class' && filters?.classId) {
        studentQuery = studentQuery.eq('section.class_id', filters.classId);
      }
      if (recipientType === 'section' && filters?.sectionId) {
        studentQuery = studentQuery.eq('section_id', filters.sectionId);
      }

      // Restrict teachers to their assigned sections
      if (req.user!.role === 'teacher') {
        const scope = await getUserScope(req.user!);
        if (!scope || scope.sectionIds.length === 0) {
          return res.status(403).json({ error: 'You are not assigned to any sections to send messages.' });
        }

        // If they requested a specific section, verify they have access to it
        if (filters?.sectionId) {
          if (!scope.sectionIds.includes(filters.sectionId)) {
            return res.status(403).json({ error: 'You do not have access to send messages to this section.' });
          }
        } else {
          // If they requested a class or no specific section, restrict query to their scope
          studentQuery = studentQuery.in('section_id', scope.sectionIds);
        }
      }

      const students = await fetchAllRows<any>(
        studentQuery
      );

      // Fetch parents for each student
      for (const student of students || []) {
        const { data: parentLink } = await supabaseAdmin
          .from('parent_students')
          .select('parent:parents(user:users(email, phone, id, first_name, last_name))')
          .eq('student_id', student.id)
          .limit(1)
          .single();

        const pUser = (parentLink as any)?.parent?.user;
        if (pUser) {
          const u = pUser;
          if (u.email && !recipients.find(r => r.email === u.email)) {
            recipients.push({ email: u.email, phone: u.phone, userId: u.id, name: `${u.first_name} ${u.last_name || ''}` });
          }
        }
      }
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No valid recipients found for the given filters.' });
    }

    let sentCount = 0;
    for (const r of recipients) {
      await notificationService.sendMultiChannel({
        schoolId,
        userId: r.userId,
        channels: activeChannels,
        type: type || 'custom',
        title: subject,
        message: message.replace('{parent_name}', r.name || 'Parent').replace('{student_name}', r.name || 'Student'),
        emailAddress: r.email,
        phone: r.phone,
        whatsappTemplate,
        htmlContent: generateEmailHtml(
          schoolName,
          subject,
          type || 'NOTIFICATION',
          message.replace('{parent_name}', r.name || 'Parent').replace('{student_name}', r.name || 'Student').replace(/\n/g, '<br/>')
        ),
      });
      sentCount++;
    }

    return res.json({ success: true, sent: sentCount, total: recipients.length });
  } catch (err: any) {
    console.error('Send email error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send emails' });
  }
});

router.post('/push-subscriptions', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const subscription = req.body?.subscription;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription payload' });
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        school_id: schoolId,
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        expiration_time: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null,
        user_agent: req.headers['user-agent'] || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });

    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to save push subscription' });
  }
});

router.delete('/push-subscriptions', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const endpoint = req.body?.endpoint;

    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint is required' });
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('school_id', schoolId)
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete push subscription' });
  }
});

// POST /api/communication/send-receipt — Send fee receipt to parent
router.post('/send-receipt', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const { feePaymentId } = req.body;

    // Fetch payment with student and parent info
    const { data: payment, error } = await supabaseAdmin
      .from('fee_payments')
      .select(`
        *,
        student:students(
          roll_number,
          user:users(first_name, last_name),
          section:sections(name, class:classes(name))
        ),
        fee_structure:fee_structures(name)
      `)
      .eq('id', feePaymentId)
      .eq('school_id', schoolId)
      .single();

    if (error || !payment) return res.status(404).json({ error: 'Payment not found' });

    // Get parent
    const { data: parentLink } = await supabaseAdmin
      .from('parent_students')
      .select('parent:parents(user:users(id, email, phone, first_name, last_name))')
      .eq('student_id', (payment as any).student_id)
      .limit(1)
      .single();

    const pUser = (parentLink as any)?.parent?.user;
    if (!pUser) {
      return res.status(404).json({ error: 'Parent not found for this student' });
    }

    // Fetch school name
    const { data: school } = await supabaseAdmin.from('schools').select('name').eq('id', schoolId).single();
    const schoolName = school?.name || 'School Notification';

    const parentUser = pUser;
    const studentUser = (payment as any).student?.user;
    await notificationService.sendMultiChannel({
      schoolId,
      userId: parentUser.id,
      channels: ['email', 'whatsapp'],
      type: 'fee_receipt',
      title: `Fee Receipt - ${payment.receipt_number}`,
      message: `Dear Parent, your fee receipt is ready. Amount: ${payment.amount}`,
      emailAddress: parentUser.email,
      phone: parentUser.phone,
      htmlContent: generateEmailHtml(
        schoolName,
        'Receipt Details',
        'FEE RECEIPT',
        `
          <p style="line-height: 1.7; color: #475569; font-size: 14px;">
            Receipt Number: <strong>${payment.receipt_number || `RCP-${feePaymentId.substring(0, 8)}`}</strong><br/>
            Student: <strong>${studentUser?.first_name} ${studentUser?.last_name || ''}</strong><br/>
            Roll No.: <strong>${(payment as any).student?.roll_number || '—'}</strong><br/>
            Amount: <strong>${payment.amount}</strong><br/>
            Payment Method: <strong>${payment.payment_method || 'Online'}</strong><br/>
            Transaction ID: <strong>${payment.transaction_id || feePaymentId}</strong><br/>
            Date: <strong>${new Date(payment.paid_date || payment.created_at).toLocaleDateString('en-IN')}</strong>
          </p>
        `
      )
    });

    return res.json({ success: true, message: 'Receipt sent to parent' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send receipt' });
  }
});

// POST /api/communication/trigger-due-reminders — Manually trigger monthly fee reminders
router.post('/trigger-due-reminders', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { feesAutomation } = require('../services/fees_automation.service');

    // Force the reminder check to run immediately for this admin's school
    // We pass a flag to bypass the date check
    await feesAutomation.checkAndSendReminders(true);

    return res.json({ success: true, message: 'Monthly fee reminders triggered successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to trigger reminders' });
  }
});

// GET /api/communication/notifications/count — Unread count for badge
router.get('/notifications/count', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { count, error } = await supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'unread');

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ count: count || 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch notification count' });
  }
});

// GET /api/communication/notifications — Fetch unread notifications for navbar
router.get('/notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { data, error } = await supabaseAdmin
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'unread')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user notifications' });
  }
});

// POST /api/communication/notifications/mark-read — Clear notification
router.post('/notifications/mark-read', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { notificationIds } = req.body;

    const { error } = await supabaseAdmin
      .from('user_notifications')
      .update({ status: 'read' })
      .in('id', notificationIds || [])
      .eq('user_id', userId);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// POST /api/communication/send-message — Internal Messaging
router.post('/send-message', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const senderId = req.user!.id;
    const { receiverId, message, type = 'chat' } = req.body;
    const schoolId = req.user!.school_id;

    const { data: msg, error } = await supabaseAdmin
      .from('messages')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        school_id: schoolId,
        content: message,
        type: type,
        status: 'sent'
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ success: true, message: 'Message sent', data: msg });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/communication/emergency-alert — Targeted emergency broadcast
router.post('/emergency-alert', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const { studentId, message, channels = ['email', 'whatsapp'] } = req.body;

    // 1. Get Student and Parent Info
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('*, user:users(first_name, last_name)')
      .eq('id', studentId)
      .single();

    if (studentError || !student) return res.status(404).json({ error: 'Student not found' });

    const { data: parentLink } = await supabaseAdmin
      .from('parent_students')
      .select('parent:parents(user:users(id, email, phone, first_name, last_name))')
      .eq('student_id', studentId)
      .limit(1)
      .single();

    const parentUser = (parentLink as any)?.parent?.user;
    if (!parentUser) return res.status(404).json({ error: 'Parent not found' });

    // 2. Send Multi-Channel Alert
    const alertTitle = `🚨 EMERGENCY ALERT: ${student.user.first_name} ${student.user.last_name}`;
    const alertMessage = message || `Emergency alert triggered for ${student.user.first_name}. Please contact the school immediately.`;

    await notificationService.sendMultiChannel({
      schoolId,
      userId: parentUser.id,
      channels,
      type: 'emergency_alert',
      title: alertTitle,
      message: alertMessage,
      phone: parentUser.phone,
      emailAddress: parentUser.email,
      htmlContent: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #fef2f2; border: 2px solid #ef4444; border-radius: 16px; overflow: hidden;">
          <div style="background: #ef4444; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 900;">🚨 EMERGENCY ALERT</h1>
          </div>
          <div style="padding: 32px; background: white;">
            <p style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 16px;">Immediate Action Required</p>
            <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin-bottom: 24px;">${alertMessage}</p>
            <div style="padding: 16px; background: #fef2f2; border-radius: 12px; border: 1px solid #fee2e2;">
              <p style="margin: 0; font-size: 14px; font-weight: 700; color: #b91c1c;">Student: ${student.user.first_name} ${student.user.last_name}</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #7f1d1d;">Timestamp: ${new Date().toLocaleString('en-IN')}</p>
            </div>
            <p style="margin-top: 32px; font-size: 12px; color: #9ca3af; text-align: center;">This is an automated emergency message from Kautix School Platform.</p>
          </div>
        </div>
      `,
    });

    return res.json({ success: true, message: 'Emergency alert dispatched across all channels' });
  } catch (err: any) {
    console.error('Emergency alert error:', err);
    return res.status(500).json({ error: 'Failed to dispatch emergency alert' });
  }
});

// GET /api/communication/emails — Email history (admin: all school emails; others: own)
router.get('/emails', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const role = req.user!.role;
    const { page = '1', limit = '50', status, recipientType } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabaseAdmin
      .from('email_logs')
      .select('*', { count: 'exact' })
      .eq('school_id', schoolId)
      .order('sent_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (role !== 'admin') query = query.eq('recipient_user_id', userId);
    if (status) query = query.eq('delivery_status', status as string);
    if (recipientType) query = query.eq('recipient_type', recipientType as string);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ emails: data, total: count });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// GET /api/communication/emails/analytics — Email delivery stats
router.get('/emails/analytics', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const { data, error } = await supabaseAdmin
      .from('email_logs')
      .select('delivery_status')
      .eq('school_id', schoolId);

    if (error) return res.status(400).json({ error: error.message });

    const stats = { sent: 0, delivered: 0, failed: 0, opened: 0, pending: 0, total: data?.length || 0 };
    for (const row of data || []) {
      const s = row.delivery_status as keyof typeof stats;
      if (s in stats && s !== 'total') stats[s]++;
    }
    return res.json(stats);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch email analytics' });
  }
});

// GET /api/communication/emails/:id — Email detail
router.get('/emails/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;
    const role = req.user!.role;
    const { id } = req.params;

    let query = supabaseAdmin
      .from('email_logs')
      .select('*')
      .eq('id', id)
      .eq('school_id', schoolId);

    const { data, error } = await query.single();
    if (error || !data) return res.status(404).json({ error: 'Email not found' });
    if (role !== 'admin' && data.recipient_user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// GET /api/communication/timeline/:userId — Communication history for a user
router.get('/timeline/:userId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const role = req.user!.role;
    const { userId } = req.params;
    const { studentId } = req.query;

    if (role !== 'admin' && req.user!.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let query = supabaseAdmin
      .from('communication_timeline')
      .select('*')
      .eq('school_id', schoolId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (studentId) query = query.eq('student_id', studentId as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// GET /api/communication/my-notifications — Full notification history for current user
router.get('/my-notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { status, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (status) query = query.eq('status', status as string);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ notifications: data, total: count });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/communication/whatsapp/send — Direct WhatsApp Message
router.post('/whatsapp/send', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.user!.school_id;
    const { to, message } = req.body; // to: E.164 formatted phone number

    if (!to || !message) {
      return res.status(400).json({ error: 'Missing to or message' });
    }

    // Lookup WhatsApp Connection
    const { data: conn, error: connErr } = await supabaseAdmin
      .from('whatsapp_connections')
      .select('access_token, phone_number_id, status')
      .eq('school_id', schoolId)
      .single();

    if (connErr || !conn || conn.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'WhatsApp is not connected or active for this school.' });
    }

    const { access_token, phone_number_id } = conn;

    // Call Meta Graph API
    const response = await require('axios').post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json({ success: true, messageId: response.data.messages[0].id });
  } catch (error: any) {
    console.error('WhatsApp send error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to send WhatsApp message via Meta.' });
  }
});

export default router;

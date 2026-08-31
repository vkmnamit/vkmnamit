import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

// Admin: Get all parents
export async function getParents(req: AuthenticatedRequest, res: Response) {
  try {
    const { data: parents, error } = await supabaseAdmin
      .from('parents')
      .select(`
        *,
        user:users(id, email, first_name, last_name, phone, is_active, avatar_url),
        children:parent_students(
          student_id,
          student:students(
            id,
            admission_number,
            section_id,
            section:sections(id, name, class_id, class:classes(id, name)),
            user:users(first_name, last_name)
          )
        )
      `)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });

    // Normalize user to object in case Supabase returns an array
    const normalizedParents = parents.map((p: any) => ({
      ...p,
      user: Array.isArray(p.user) ? p.user[0] : p.user
    }));

    return res.json(normalizedParents);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch parents' });
  }
}

// Get parent's children
export async function getMyChildren(req: AuthenticatedRequest, res: Response) {
  try {
    // Get parent record
    const { data: parent } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('user_id', req.user!.id)
      .single();

    if (!parent) return res.status(404).json({ error: 'Parent profile not found' });

    const { data: children, error } = await supabaseAdmin
      .from('parent_students')
      .select(`
        relationship,
        student:students(
          *,
          user:users(first_name, last_name, email, phone, avatar_url),
          section:sections(name, class:classes(name, grade))
        )
      `)
      .eq('parent_id', parent.id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(children);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch children' });
  }
}

// Get child's attendance
export async function getChildAttendance(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;
    const { month, year } = req.query;

    let query = supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false });

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
      query = query.gte('date', startDate).lte('date', endDate);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch attendance' });
  }
}

// Get child's fee status
export async function getChildFees(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('fee_payments')
      .select('*, fee_structure:fee_structures(name, frequency)')
      .eq('student_id', studentId)
      .order('due_date', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch fees' });
  }
}

// Get child's exam results
export async function getChildResults(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;

    // First verify this parent has access to this student
    const { data: parent, error: parentFetchErr } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('user_id', req.user!.id)
      .single();

    if (parentFetchErr) {
      console.error('getChildResults: failed to fetch parent', parentFetchErr);
      return res.status(500).json({ error: 'Failed to verify parent profile' });
    }
    if (!parent) {
      console.warn('getChildResults: parent profile not found for user', req.user!.id);
      return res.status(403).json({ error: 'Parent profile not found' });
    }

    const { data: link, error: linkErr } = await supabaseAdmin
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', parent.id)
      .eq('student_id', studentId)
      .maybeSingle();

    if (linkErr) {
      console.error('getChildResults: parent_students lookup failed', linkErr);
      return res.status(500).json({ error: 'Failed to verify parent-student link' });
    }
    if (!link) {
      console.warn('getChildResults: access denied — parent', parent.id, 'student', studentId);
      return res.status(403).json({ error: 'Access denied to this student' });
    }

    const { data: resultRows, error: resultError } = await supabaseAdmin
      .from('exam_results')
      .select('id, exam_id, student_id, marks_obtained, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (resultError) {
      console.error('getChildResults: failed to fetch results', resultError);
      return res.status(400).json({ error: 'Failed to load exam results' });
    }

    const examIds = [...new Set((resultRows || []).map((row: any) => row.exam_id).filter(Boolean))];
    if (examIds.length === 0) return res.json([]);

    const { data: exams, error: examError } = await supabaseAdmin
      .from('exams')
      .select('id, name, total_marks, status')
      .in('id', examIds);

    if (examError) {
      console.error('getChildResults: failed to fetch exams', examError);
      return res.status(400).json({ error: 'Failed to load exam details' });
    }

    const examsById = new Map((exams || []).map((exam: any) => [exam.id, exam]));

    const filtered = (resultRows || [])
      .map((result: any) => ({ ...result, exam: examsById.get(result.exam_id) || null }))
      .filter((result: any) => result.exam && (result.exam.status === 'completed' || result.marks_obtained !== null));
    return res.json(filtered);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch results' });
  }
}


// Get notifications for parent
export async function getNotifications(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('notification_logs')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

// Send message to teacher
export async function sendMessage(req: AuthenticatedRequest, res: Response) {
  try {
    const { receiverId, subject, content } = req.body;

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        school_id: req.user!.school_id,
        sender_id: req.user!.id,
        receiver_id: receiverId,
        subject,
        content,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to send message' });
  }
}

// Get messages
export async function getMessages(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(first_name, last_name, role, avatar_url),
        receiver:users!messages_receiver_id_fkey(first_name, last_name, role, avatar_url)
      `)
      .or(`sender_id.eq.${req.user!.id},receiver_id.eq.${req.user!.id}`)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
}
// Get consolidated dashboard for parent
export async function getParentDashboard(req: AuthenticatedRequest, res: Response) {
  try {
    // 1. Get parent
    const { data: parent } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('user_id', req.user!.id)
      .single();

    if (!parent) return res.status(404).json({ error: 'Parent profile not found' });

    // 2. Get children
    const { data: childrenLinks } = await supabaseAdmin
      .from('parent_students')
      .select(`
        student:students(
          id, roll_number, attendance_percentage, risk_level,
          user:users(first_name, last_name, avatar_url),
          section:sections(name, class:classes(name))
        )
      `)
      .eq('parent_id', parent.id);

    const studentIds = childrenLinks?.map(cl => (cl.student as any).id) || [];

    let fees: any[] = [];
    let attendanceLogs: any[] = [];
    let results: any[] = [];

    if (studentIds.length > 0) {
      const feesResp = await supabaseAdmin
        .from('fee_payments')
        .select('*')
        .in('student_id', studentIds);
      fees = feesResp.data || [];

      const attendanceResp = await supabaseAdmin
        .from('attendance')
        .select('student_id, status')
        .in('student_id', studentIds);
      attendanceLogs = attendanceResp.data || [];

      const resultsResp = await supabaseAdmin
        .from('exam_results')
        .select('*, exam:exams!inner(id, name, total_marks, status)')
        .in('student_id', studentIds);
      // Avoid filtering on aliased/joined fields at DB level — filter in JS to prevent Supabase alias issues
      const rawResults = resultsResp.data || [];
      results = rawResults.filter((r: any) => r.exam?.status === 'completed' || r.marks_obtained !== null);
    }

    const sectionIds = childrenLinks?.map((cl: any) => cl.student.section?.id).filter(Boolean) || [];

    const dayMap: Record<string, number> = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const todayNum = dayMap[new Date().toLocaleDateString('en-US', { weekday: 'long' })] || 1;

    const { data: timetableSlots } = await supabaseAdmin
      .from('timetable_slots')
      .select('*, subject:subjects(name), teacher:users(first_name, last_name)')
      .in('section_id', sectionIds)
      .eq('day_of_week', todayNum)
      .order('period_number', { ascending: true });

    const { data: assignments } = await supabaseAdmin
      .from('lms_assignments')
      .select('*, course:lms_courses(title)')
      .in('section_id', sectionIds)
      .gte('due_date', new Date().toISOString().split('T')[0])
      .order('due_date', { ascending: true });

    // Fetch all submissions for all linked students (to filter out completed work)
    const allStudentIds = (childrenLinks || []).map((cl: any) => cl.student.id);
    let allSubmissions: any[] = [];
    if (allStudentIds.length > 0) {
      const subResp = await supabaseAdmin
        .from('lms_submissions')
        .select('assignment_id, student_id, status')
        .in('student_id', allStudentIds)
        .in('status', ['submitted', 'graded']);
      allSubmissions = subResp.data || [];
    }

    const submissionSet = new Set(
      (allSubmissions || []).map((s: any) => `${s.student_id}::${s.assignment_id}`)
    );

    const children = (childrenLinks || []).map((cl: any) => {
      const studentId = cl.student.id;
      const sectionId = cl.student.section?.id;
      const childFees = fees?.filter(f => f.student_id === studentId) || [];
      const childResults = results?.filter(r => r.student_id === studentId) || [];
      const childAttendance = attendanceLogs?.filter(a => a.student_id === studentId) || [];

      const totalDue = childFees.reduce((sum, f) => sum + (Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0)), 0);
      const totalPaid = childFees.reduce((sum, f) => sum + Number(f.paid_amount || 0), 0);
      const pendingAmount = totalDue - totalPaid;

      const avgScore = childResults.length > 0
        ? Math.round(childResults.reduce((sum, r) => sum + (Number(r.marks_obtained) / Number(r.exam.total_marks) * 100), 0) / childResults.length)
        : 0;

      const totalDays = childAttendance.length;
      const presentDays = childAttendance.filter(a => a.status === 'present').length;
      const attendancePercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : (cl.student.attendance_percentage || 0);

      const childTimetable = timetableSlots?.filter(t => t.section_id === sectionId).map(s => ({
        subject: (s as any).subject?.name || 'Class',
        teacher: `${(s as any).teacher?.first_name || ''} ${(s as any).teacher?.last_name || ''}`,
        start_time: s.start_time,
        end_time: s.end_time,
        room: s.room,
        period_number: s.period_number
      })) || [];

      const childAssignments = (assignments?.filter(a => a.section_id === sectionId) || [])
        .filter(a => !submissionSet.has(`${studentId}::${a.id}`))
        .map((a: any) => ({ id: a.id, title: a.title, course: a.course?.title || 'General', due_date: a.due_date }));

      return {
        id: studentId,
        name: `${cl.student.user.first_name} ${cl.student.user.last_name}`,
        class: `${cl.student.section?.class?.name || 'Class'}-${cl.student.section?.name || ''}`,
        rollNo: cl.student.roll_number,
        avatar: cl.student.user.avatar_url,
        attendance: `${attendancePercent}%`,
        performance: `${avgScore}%`,
        fees: pendingAmount > 0 ? `₹${pendingAmount.toLocaleString()}` : '₹0',
        pendingFees: childFees.filter(f => f.status === 'pending' || f.status === 'overdue'),
        todaySchedule: childTimetable,
        assignments: childAssignments,
        results: childResults,
        riskAnalysis: cl.student.risk_level === 'high'
          ? { level: 'high', message: 'Requires attention — attendance or fees may be at risk.' }
          : cl.student.risk_level === 'medium'
            ? { level: 'medium', message: 'Monitor progress closely.' }
            : null,
      };
    });

    // 4. Comparison Data for Chart
    const months = Array.from({ length: 5 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (4 - i));
      return d.toLocaleString('default', { month: 'short' });
    });
    const comparisonData = months.map(month => {
      const entry: any = { month };
      children.forEach(child => {
        // Find results for this child in this month dynamically if available
        const monthlyResults = child.results?.filter((r: any) => new Date(r.created_at).toLocaleString('default', { month: 'short' }) === month) || [];
        const avg = monthlyResults.length > 0
          ? Math.round(monthlyResults.reduce((sum: number, r: any) => sum + (Number(r.marks_obtained) / Number(r.exam.total_marks) * 100), 0) / monthlyResults.length)
          : 0;
        entry[child.name.toLowerCase()] = avg;
      });
      return entry;
    });

    // 5. Real Communication Logs — in-app notifications + external logs
    const { data: inAppNotifications } = await supabaseAdmin
      .from('user_notifications')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: notifications } = await supabaseAdmin
      .from('notification_logs')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(3);

    const mappedInApp = (inAppNotifications || []).map(n => ({
      from: 'School',
      time: new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      subject: n.title || n.type || 'Alert',
      message: n.message,
      type: n.type,
      unread: n.status === 'unread',
    }));

    const mappedCommunications = notifications?.map(n => ({
      from: n.metadata?.sender_name || 'School Admin',
      time: new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      subject: n.metadata?.title || 'System Update',
      message: n.message
    })) || [];

    const allCommunications = [...mappedInApp, ...mappedCommunications].slice(0, 8);

    return res.json({
      children,
      comparisonData,
      communications: allCommunications,
      alerts: mappedInApp.filter(a => a.unread),
      meetings: [], // Dynamic meetings array
      stats: {
        totalFeesPaid: `₹${(fees?.reduce((sum, f) => sum + Number(f.paid_amount || 0), 0) || 0).toLocaleString()}`,
        avgAttendance: `${Math.round(children.reduce((sum, c) => sum + parseInt(c.attendance), 0) / (children.length || 1))}%`,
        activeChildren: children.length
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
}

// Admin: Get single parent
export async function getParentById(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { data: parent, error } = await supabaseAdmin
      .from('parents')
      .select(`
        *,
        user:users(*),
        children:parent_students(
          relationship,
          student:students(
            *,
            user:users(*),
            section:sections(*, class:classes(*))
          )
        )
      `)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .single();

    if (error || !parent) return res.status(404).json({ error: 'Parent not found' });
    return res.json(parent);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch parent' });
  }
}

// Admin: Update parent
export async function updateParent(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      firstName, lastName, email, phone,
      ...parentUpdates
    } = req.body;

    // 1. Get parent to find user_id
    const { data: parent, error: fetchErr } = await supabaseAdmin
      .from('parents')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !parent) return res.status(404).json({ error: 'Parent not found' });

    // 2. Update User table
    if (firstName || lastName || email || phone) {
      await supabaseAdmin
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          email,
          phone
        })
        .eq('id', parent.user_id);
    }

    // 3. Update Parents table
    const { data, error } = await supabaseAdmin
      .from('parents')
      .update(parentUpdates)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update parent' });
  }
}

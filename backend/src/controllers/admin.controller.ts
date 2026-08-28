import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getUserScope, clearScopeCache } from '../utils/userScope';
import { aiService } from '../services/ai.service';
import { generateRandomPassword } from '../util/user.util';
import { notificationService } from '../services/notification.service';
import { aiEntityResolver } from '../services/ai-entity-resolver.service';
import { format, startOfMonth, endOfMonth } from 'date-fns';

// In-memory rate limit for manual automation triggers (per school, 10-min cooldown)
const automationRateLimit = new Map<string, number>();

// Get dashboard stats
export async function getDashboardStats(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;

    // Calculate date boundaries for growth metrics
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    // Student count and growth
    const { count: studentCount } = await supabaseAdmin
      .from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId);

    const { count: studentsUpToLastMonth } = await supabaseAdmin
      .from('students').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId).lt('created_at', firstDayThisMonth);

    const studentGrowthRaw = studentsUpToLastMonth ? (((studentCount || 0) - studentsUpToLastMonth) / studentsUpToLastMonth) * 100 : 0;
    const studentGrowth = studentGrowthRaw > 0 ? `+${studentGrowthRaw.toFixed(1)}%` : `${studentGrowthRaw.toFixed(1)}%`;

    // Teacher count and growth
    const { count: teacherCount } = await supabaseAdmin
      .from('teachers').select('*', { count: 'exact', head: true }).eq('school_id', schoolId);

    const { count: teachersUpToLastMonth } = await supabaseAdmin
      .from('teachers').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId).lt('created_at', firstDayThisMonth);

    const teacherGrowthRaw = teachersUpToLastMonth ? (((teacherCount || 0) - teachersUpToLastMonth) / teachersUpToLastMonth) * 100 : 0;
    const teacherGrowth = teacherGrowthRaw > 0 ? `+${teacherGrowthRaw.toFixed(1)}%` : `${teacherGrowthRaw.toFixed(1)}%`;

    // Today's attendance
    const today = new Date().toISOString().split('T')[0];
    const { data: todayAttendance } = await supabaseAdmin
      .from('attendance').select('status').eq('school_id', schoolId).eq('date', today);

    const totalToday = todayAttendance?.length || 0;
    const presentToday = todayAttendance?.filter((a: any) => a.status === 'present').length || 0;
    const attendanceRate = totalToday > 0 ? Math.round((presentToday / totalToday) * 10000) / 100 : 0;

    // Fee stats and growth
    const { data: fees } = await supabaseAdmin
      .from('fee_payments').select('amount, paid_amount, status, paid_date').eq('school_id', schoolId);

    const totalFees = fees?.reduce((sum, f: any) => sum + Number(f.amount), 0) || 0;
    const collectedFees = fees?.filter((f: any) => f.status === 'paid')
      .reduce((sum, f: any) => sum + Number(f.paid_amount || 0), 0) || 0;
    const defaulterCount = fees?.filter((f: any) => f.status === 'overdue' || f.status === 'pending').length || 0;

    // Fee Growth calculation (this month vs last month)
    const feesThisMonth = fees?.filter((f: any) => f.status === 'paid' && f.paid_date && f.paid_date >= firstDayThisMonth)
      .reduce((sum, f: any) => sum + Number(f.paid_amount || 0), 0) || 0;
    const feesLastMonth = fees?.filter((f: any) => f.status === 'paid' && f.paid_date && f.paid_date >= firstDayLastMonth && f.paid_date < firstDayThisMonth)
      .reduce((sum, f: any) => sum + Number(f.paid_amount || 0), 0) || 0;

    const feeGrowthRaw = feesLastMonth ? ((feesThisMonth - feesLastMonth) / feesLastMonth) * 100 : 0;
    const feeGrowth = feeGrowthRaw > 0 ? `+${feeGrowthRaw.toFixed(1)}%` : `${feeGrowthRaw.toFixed(1)}%`;

    // Recent events
    const { data: events } = await supabaseAdmin
      .from('events').select('*').eq('school_id', schoolId)
      .order('start_date', { ascending: true }).limit(5);

    // Upcoming exams
    const { data: exams } = await supabaseAdmin
      .from('exams')
      .select('*, subject:subjects(name), class:classes(name)')
      .eq('school_id', schoolId)
      .eq('status', 'scheduled')
      .order('date', { ascending: true })
      .limit(5);

    // Real academic performance from exam_results
    const { data: results } = await supabaseAdmin
      .from('exam_results')
      .select('marks_obtained, exam_id, student_id, exams(total_marks), students(section:sections(name, class:classes(name)))')
      .eq('exams.school_id', schoolId);

    let classPerformance: any[] = [];
    if (results && results.length > 0) {
      const classMap: Record<string, { total: number, max: number }> = {};
      results.forEach((r: any) => {
        if (!r.students?.section?.class?.name) return;
        const className = `${r.students.section.class.name}-${r.students.section.name}`;
        if (!classMap[className]) classMap[className] = { total: 0, max: 0 };
        classMap[className].total += Number(r.marks_obtained || 0);
        classMap[className].max += Number(r.exams?.total_marks || 100);
      });
      classPerformance = Object.keys(classMap).map(c => ({
        class: c,
        score: Math.round((classMap[c].total / classMap[c].max) * 100)
      }));
    }

    // Inventory count
    const { count: inventoryCount } = await supabaseAdmin
      .from('school_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId);

    // Canteen sales
    const { data: canteenOrders } = await supabaseAdmin
      .from('canteen_orders')
      .select('total_amount')
      .eq('school_id', schoolId);

    const canteenSales = canteenOrders?.reduce((acc, order) => acc + Number(order.total_amount), 0) || 0;

    // Attendance trends (last 5 months)
    const attendanceTrends: any[] = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();

    for (let i = 4; i >= 0; i--) {
      const targetMonth = (currentMonth - i + 12) % 12;
      const targetYear = new Date().getFullYear() - (currentMonth - i < 0 ? 1 : 0);
      const monthLabel = months[targetMonth];

      const startDate = `${targetYear}-${(targetMonth + 1).toString().padStart(2, '0')}-01`;
      const endDate = `${targetYear}-${(targetMonth + 1).toString().padStart(2, '0')}-31`;

      const { data: monthAttendance } = await supabaseAdmin
        .from('attendance')
        .select('status')
        .eq('school_id', schoolId)
        .gte('date', startDate)
        .lte('date', endDate);

      const total = monthAttendance?.length || 0;
      const present = monthAttendance?.filter((a: any) => a.status === 'present').length || 0;
      const absent = total - present;

      attendanceTrends.push({
        month: monthLabel,
        present: total > 0 ? Math.round((present / total) * 100) : 0,
        absent: total > 0 ? Math.round((absent / total) * 100) : 0
      });
    }

    // Teacher performance
    const { data: teacherProfiles } = await supabaseAdmin
      .from('teachers')
      .select('performance_rating, user:users(first_name, last_name, email)')
      .eq('school_id', schoolId)
      .order('performance_rating', { ascending: false })
      .limit(5);

    const teacherPerformance = teacherProfiles?.map((tp: any) => ({
      name: `${tp.user.first_name} ${tp.user.last_name}`,
      subject: tp.department || 'Faculty',
      rating: tp.performance_rating || 0,
      students: 0
    })) || [];

    // Recent Users for Admin POV
    const { data: recentStudents } = await supabaseAdmin
      .from('students')
      .select('id, user:users(first_name, last_name, avatar_url, email)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: recentTeachers } = await supabaseAdmin
      .from('teachers')
      .select('id, department, user:users(first_name, last_name, avatar_url, email)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: recentParents } = await supabaseAdmin
      .from('parents')
      .select('id, user:users(first_name, last_name, avatar_url, email)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Attendance growth based on trends
    let attendanceGrowth = '+0%';
    if (attendanceTrends.length >= 2) {
      const thisMonthAtt = attendanceTrends[attendanceTrends.length - 1].present;
      const lastMonthAtt = attendanceTrends[attendanceTrends.length - 2].present;
      const attGrowthRaw = thisMonthAtt - lastMonthAtt; // Absolute percentage points difference
      attendanceGrowth = attGrowthRaw > 0 ? `+${attGrowthRaw}%` : `${attGrowthRaw}%`;
    }

    return res.json({
      students: { total: studentCount || 0, recent: recentStudents || [], growth: studentGrowth },
      teachers: { total: teacherCount || 0, recent: recentTeachers || [], growth: teacherGrowth },
      parents: { recent: recentParents || [] },
      attendance: {
        rate: attendanceRate,
        present: presentToday,
        total: totalToday,
        trends: attendanceTrends,
        growth: attendanceGrowth
      },
      academic: {
        classPerformance: classPerformance,
        teacherPerformance: teacherPerformance
      },
      inventory: { library: inventoryCount?.toString() || '0' },
      transport: { activeBuses: '0' },
      canteen: { sales: `₹${canteenSales}` },
      fees: {
        total: totalFees,
        collected: collectedFees,
        pending: totalFees - collectedFees,
        rate: totalFees > 0 ? Math.round((collectedFees / totalFees) * 10000) / 100 : 0,
        defaulters: defaulterCount,
        growth: feeGrowth
      },
      events: events || [],
      upcomingExams: exams || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
}

// Get AI insights
export async function getAIInsights(req: AuthenticatedRequest, res: Response) {
  try {
    const { period = 'monthly' } = req.query;
    const report = await aiService.generatePeriodicReport(req.user!.school_id, period as any);
    return res.json(report);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to generate AI insights' });
  }
}

// Get dropout risks
export async function getDropoutRisks(req: AuthenticatedRequest, res: Response) {
  try {
    const risks = await aiService.detectDropoutRisk(req.user!.school_id);
    return res.json(risks);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to detect dropout risks' });
  }
}

// Get student performance prediction
export async function getStudentPrediction(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;
    const prediction = await aiService.predictStudentPerformance(studentId, req.user!.school_id);
    return res.json(prediction);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to predict performance' });
  }
}

// Get fee default predictions
export async function getFeeDefaultPredictions(req: AuthenticatedRequest, res: Response) {
  try {
    const predictions = await aiService.predictFeeDefaults(req.user!.school_id);
    return res.json(predictions);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to predict fee defaults' });
  }
}

// Generate smart timetable
export async function generateSmartTimetable(req: AuthenticatedRequest, res: Response) {
  try {
    const { sectionId, periodsPerDay = 8, daysPerWeek = 6, periodDuration = 40, startTime = '08:00', breakAfterPeriod = 4, breakDuration = 30 } = req.body;

    const result = await aiService.generateTimetable({
      schoolId: req.user!.school_id,
      sectionId,
      periodsPerDay,
      daysPerWeek,
      periodDuration,
      startTime,
      breakAfterPeriod,
      breakDuration,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to generate timetable' });
  }
}

// Save timetable
export async function saveTimetable(req: AuthenticatedRequest, res: Response) {
  try {
    const { sectionId, slots } = req.body;

    // Delete existing timetable for this section
    await supabaseAdmin.from('timetable_slots').delete().eq('section_id', sectionId);

    // Insert new slots
    const { data, error } = await supabaseAdmin
      .from('timetable_slots')
      .insert(slots)
      .select();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Timetable saved', slots: data });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to save timetable' });
  }
}

// Get timetable
export async function getTimetable(req: AuthenticatedRequest, res: Response) {
  try {
    const { section_id, teacher_id } = req.query;

    let query = supabaseAdmin
      .from('timetable_slots')
      .select(`
        *,
        section:sections(name, class:classes(name)),
        subject:subjects(name, code),
        teacher:users(first_name, last_name)
      `)
      .eq('school_id', req.user!.school_id)
      .order('day_of_week', { ascending: true })
      .order('period_number', { ascending: true });

    if (section_id) query = query.eq('section_id', section_id as string);
    if (teacher_id) query = query.eq('teacher_id', teacher_id as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch timetable' });
  }
}

// Get classes and sections
export async function getClasses(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('classes')
      .select('*, sections(*)')
      .eq('school_id', req.user!.school_id)
      .order('grade', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    // ── Add student count (class strength) per section ──
    // Fetch all students for this school grouped by section_id
    const { data: allStudents } = await supabaseAdmin
      .from('students')
      .select('section_id')
      .eq('school_id', req.user!.school_id);

    // Count students per section
    const sectionCounts: Record<string, number> = {};
    (allStudents || []).forEach((s: any) => {
      if (s.section_id) {
        sectionCounts[s.section_id] = (sectionCounts[s.section_id] || 0) + 1;
      }
    });

    // Attach student_count and strength to each section
    const enriched = (data || []).map((cls: any) => {
      const sections = (cls.sections || []).map((sec: any) => ({
        ...sec,
        student_count: sectionCounts[sec.id] || 0,
        strength: sectionCounts[sec.id] || 0,
        capacity: sec.capacity || 60,
        seats_available: Math.max(0, (sec.capacity || 60) - (sectionCounts[sec.id] || 0)),
      }));
      // Also compute total class strength
      const totalStudents = sections.reduce((sum: number, s: any) => sum + (s.student_count || 0), 0);
      return { ...cls, sections, student_count: totalStudents, strength: totalStudents };
    });

    return res.json(enriched);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch classes' });
  }
}

// Create class
export async function createClass(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, grade, sections, academicYearId } = req.body;

    let parsedGrade = parseInt(grade);
    if (isNaN(parsedGrade)) {
      parsedGrade = 0; // Pre-K, Nursery, LKG, UKG fallback grade ordering index
    }

    const { data: classData, error: classError } = await supabaseAdmin
      .from('classes')
      .insert({
        school_id: req.user!.school_id,
        academic_year_id: academicYearId,
        name,
        grade: parsedGrade,
      })
      .select()
      .single();

    if (classError) return res.status(400).json({ error: classError.message });

    // Create sections
    if (sections && sections.length > 0) {
      // Resolve teacher_ids to user_ids for class_teacher_id
      const teacherIds = sections.map((s: any) => s.classTeacherId).filter(Boolean);
      let teacherMap = new Map();
      if (teacherIds.length > 0) {
        const { data: ts } = await supabaseAdmin.from('teachers').select('id, user_id').in('id', teacherIds);
        if (ts) {
          ts.forEach((t: any) => teacherMap.set(t.id, t.user_id));
        }
      }

      // 1. Clear previous assignments to enforce one-teacher-one-class rule
      for (const s of sections) {
        if (s.classTeacherId) {
          const userId = teacherMap.get(s.classTeacherId);
          if (userId) {
            await supabaseAdmin
              .from('sections')
              .update({ class_teacher_id: null })
              .eq('class_teacher_id', userId);
          }
        }
      }

      const sectionRecords = sections.map((s: any) => ({
        class_id: classData.id,
        name: s.name || s,
        capacity: s.capacity || 60,
        class_teacher_id: s.classTeacherId ? teacherMap.get(s.classTeacherId) : null,
      }));

      await supabaseAdmin.from('sections').insert(sectionRecords);

      // Invalidate cache for assigned teachers
      for (const userId of Array.from(teacherMap.values())) {
        clearScopeCache(userId);
      }
    }

    return res.status(201).json(classData);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create class' });
  }
}

// Add section to existing class
export async function addSection(req: AuthenticatedRequest, res: Response) {
  try {
    const { classId } = req.params;
    const { name, capacity } = req.body;

    // Verify the class belongs to the school
    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('school_id', req.user!.school_id)
      .single();

    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const { data, error } = await supabaseAdmin
      .from('sections')
      .insert({ class_id: classId, name: name || 'A', capacity: capacity || 60 })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to add section' });
  }
}

// Delete section
export async function updateSection(req: AuthenticatedRequest, res: Response) {
  try {
    const { sectionId } = req.params;
    const { name, capacity } = req.body;

    if (!name) return res.status(400).json({ error: 'Section name is required' });

    const { data, error } = await supabaseAdmin
      .from('sections')
      .update({ name, capacity: capacity || 60 })
      .eq('id', sectionId)
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update section' });
  }
}

// Helper: fully delete a list of student IDs (auth + user + student record)
async function purgeStudents(studentIds: string[]) {
  if (!studentIds.length) return;

  // 1. Get user_ids and auth_ids for all students
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id, user_id')
    .in('id', studentIds);

  if (!students?.length) return;
  const userIds = students.map(s => s.user_id).filter(Boolean);

  // 2. Get auth_ids from users table
  const { data: userRecords } = await supabaseAdmin
    .from('users')
    .select('id, auth_id')
    .in('id', userIds);

  // 3. Delete from Supabase Auth (revokes login)
  for (const u of userRecords || []) {
    if (u.auth_id) {
      try { await supabaseAdmin.auth.admin.deleteUser(u.auth_id); } catch (_) { }
    }
  }

  // 4. Delete parent_students links
  await supabaseAdmin.from('parent_students').delete().in('student_id', studentIds);

  // 5. Delete the student records
  await supabaseAdmin.from('students').delete().in('id', studentIds);

  // 6. Delete the user records
  if (userIds.length) {
    await supabaseAdmin.from('users').delete().in('id', userIds);
  }
}

export async function deleteSection(req: AuthenticatedRequest, res: Response) {
  try {
    const { sectionId } = req.params;

    // 1. Get all students in this section
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('section_id', sectionId);

    const studentIds = (students || []).map((s: any) => s.id);

    // 2. Fully purge all students
    await purgeStudents(studentIds);

    // 3. Delete the section itself
    const { error } = await supabaseAdmin
      .from('sections')
      .delete()
      .eq('id', sectionId);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Section deleted', studentsDeleted: studentIds.length });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete section' });
  }
}

// Delete class — also fully deletes all students in all its sections
export async function deleteClass(req: AuthenticatedRequest, res: Response) {
  try {
    const { classId } = req.params;

    // 1. Get all sections of this class
    const { data: sections } = await supabaseAdmin
      .from('sections')
      .select('id')
      .eq('class_id', classId);

    if (sections && sections.length > 0) {
      const sectionIds = sections.map(s => s.id);

      // 2. Get all students across all sections
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id')
        .in('section_id', sectionIds);

      const studentIds = (students || []).map((s: any) => s.id);

      // 3. Fully purge all students
      await purgeStudents(studentIds);

      // 4. Delete all sections
      await supabaseAdmin.from('sections').delete().in('id', sectionIds);
    }

    // 5. Delete the class itself
    const { error } = await supabaseAdmin
      .from('classes')
      .delete()
      .eq('id', classId)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Class deleted' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete class' });
  }
}

// Update class name/grade
export async function updateClass(req: AuthenticatedRequest, res: Response) {
  try {
    const { classId } = req.params;
    const { name, grade } = req.body;

    const updates: any = {};
    if (name) updates.name = name;
    if (grade !== undefined) {
      const parsedGrade = parseInt(grade);
      updates.grade = isNaN(parsedGrade) ? 0 : parsedGrade;
    }

    const { data, error } = await supabaseAdmin
      .from('classes')
      .update(updates)
      .eq('id', classId)
      .eq('school_id', req.user!.school_id)
      .select('*, sections(*)')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update class' });
  }
}

// Get audit logs
export async function getAuditLogs(req: AuthenticatedRequest, res: Response) {
  try {
    const { page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const { data, error, count } = await supabaseAdmin
      .from('audit_logs')
      .select('*, user:users(first_name, last_name, email)', { count: 'exact' })
      .eq('school_id', req.user!.school_id)
      .range(offset, offset + parseInt(limit as string) - 1)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ logs: data, total: count });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
}

// --- BULK PROMOTE STUDENTS ---

/**
 * Promote a batch of students to a new section + academic year in one shot.
 * Body: { studentIds: string[], targetSectionId: string, targetAcademicYearId: string }
 */
export async function bulkPromoteStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { studentIds, targetSectionId, targetAcademicYearId } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'studentIds must be a non-empty array' });
    }
    if (!targetSectionId) return res.status(400).json({ error: 'targetSectionId is required' });
    if (!targetAcademicYearId) return res.status(400).json({ error: 'targetAcademicYearId is required' });

    // Verify all students belong to this school before updating
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, section_id, transport_route_id')
      .eq('school_id', schoolId)
      .in('id', studentIds);

    if (fetchErr) return res.status(400).json({ error: fetchErr.message });
    const validIds = (existing || []).map((s: any) => s.id);
    if (validIds.length === 0) return res.status(404).json({ error: 'No matching students found' });

    // Single batch update
    const { error: updateErr } = await supabaseAdmin
      .from('students')
      .update({
        section_id: targetSectionId,
        academic_year_id: targetAcademicYearId,
      })
      .in('id', validIds);

    if (updateErr) return res.status(400).json({ error: updateErr.message });

    // Step 1: Update all pending fees from old academic year to new academic year
    let feesUpdated = 0;
    try {
      console.log(`[PROMOTION] Updating pending fees to new academic year...`);
      const { data: oldFees, error: fetchOldFeesErr } = await supabaseAdmin
        .from('fee_payments')
        .select('id')
        .eq('school_id', schoolId)
        .in('student_id', validIds)
        .eq('status', 'pending')
        .neq('academic_year_id', targetAcademicYearId);

      if (fetchOldFeesErr) {
        console.error('[PROMOTION] Error fetching old fees:', fetchOldFeesErr);
      } else if (oldFees && oldFees.length > 0) {
        const oldFeeIds = oldFees.map(f => f.id);
        const { error: updateFeesErr } = await supabaseAdmin
          .from('fee_payments')
          .update({ academic_year_id: targetAcademicYearId })
          .in('id', oldFeeIds);

        if (updateFeesErr) {
          console.error('[PROMOTION] Error updating old fees:', updateFeesErr);
        } else {
          feesUpdated = oldFeeIds.length;
          console.log(`[PROMOTION] ✅ Updated ${feesUpdated} pending fees to new academic year`);
        }
      } else {
        console.log('[PROMOTION] No pending fees to update');
      }
    } catch (updateErr) {
      console.error('[PROMOTION] ❌ Error updating pending fees:', updateErr);
    }

    // Step 2: Generate fees for the new class/section
    let feesGenerated = 0;
    try {
      // Get target section details
      const { data: targetSection } = await supabaseAdmin
        .from('sections')
        .select('class_id')
        .eq('id', targetSectionId)
        .single();

      console.log(`[PROMOTION] Target section: ${targetSectionId}, class: ${targetSection?.class_id}, year: ${targetAcademicYearId}`);

      if (targetSection) {
        // Get applicable fee structures for the new class
        const { data: feeStructures } = await supabaseAdmin
          .from('fee_structures')
          .select('id, name, amount, frequency, due_day, applies_to, transport_route_id, class_id')
          .eq('school_id', schoolId)
          .eq('academic_year_id', targetAcademicYearId)
          .or(`applies_to.eq.all,applies_to.eq.class,class_id.eq.${targetSection.class_id}`);

        console.log(`[PROMOTION] Found ${feeStructures?.length || 0} fee structures for class ${targetSection.class_id}`);

        if (feeStructures && feeStructures.length > 0) {
          const now = new Date();
          const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);
          const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

          console.log(`[PROMOTION] Processing ${validIds.length} students for ${monthLabel}`);

          // Create fee payments for each student
          const feePayments: any[] = [];
          for (const studentId of validIds) {
            const student = (existing || []).find((s: any) => s.id === studentId);
            console.log(`[PROMOTION] Processing student ${studentId}, transport: ${student?.transport_route_id}`);

            for (const structure of feeStructures) {
              // Skip transport fees if student doesn't have transport
              if (structure.applies_to === 'transport_route' && !student?.transport_route_id) {
                console.log(`[PROMOTION] Skipping transport fee for student ${studentId} (no transport)`);
                continue;
              }

              // Check if fee already exists for this student/structure/month
              const { data: existingFee } = await supabaseAdmin
                .from('fee_payments')
                .select('id')
                .eq('student_id', studentId)
                .eq('fee_structure_id', structure.id)
                .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`)
                .maybeSingle();

              if (!existingFee) {
                console.log(`[PROMOTION] Creating fee: ${structure.name} - ₹${structure.amount} for student ${studentId}`);
                feePayments.push({
                  school_id: schoolId,
                  student_id: studentId,
                  fee_structure_id: structure.id,
                  amount: structure.amount,
                  title: structure.frequency === 'monthly' ? `Monthly Fee - ${monthLabel}` : structure.name || 'Fee',
                  due_date: dueDate.toISOString().split('T')[0],
                  status: 'pending',
                  academic_year_id: targetAcademicYearId,
                });
              } else {
                console.log(`[PROMOTION] Fee already exists for student ${studentId}, structure ${structure.id}`);
              }
            }
          }

          // Insert fees in batches
          if (feePayments.length > 0) {
            console.log(`[PROMOTION] Inserting ${feePayments.length} fee payments...`);
            const { error: feeError } = await supabaseAdmin
              .from('fee_payments')
              .insert(feePayments);

            if (!feeError) {
              feesGenerated = feePayments.length;
              console.log(`[PROMOTION] ✅ Successfully created ${feesGenerated} fee payments`);
            } else {
              console.error('[PROMOTION] ❌ Error creating fees:', feeError);
              throw feeError; // Throw error so it's caught below
            }
          } else {
            console.log('[PROMOTION] No new fees to create (all already exist)');
          }
        } else {
          console.log(`[PROMOTION] ⚠️ No fee structures found for class ${targetSection.class_id} in year ${targetAcademicYearId}`);
          console.log('[PROMOTION] 💡 TIP: Create fee structures first in Fees > Structures tab');
        }
      }
    } catch (feeErr) {
      console.error('[PROMOTION] ❌ Fee generation failed:', feeErr);
      // Don't fail the whole promotion if fee generation fails
    }

    const totalFees = feesUpdated + feesGenerated;
    return res.json({
      promoted: validIds.length,
      skipped: studentIds.length - validIds.length,
      feesUpdated,
      feesGenerated,
      totalFees,
      message: `${validIds.length} student(s) promoted successfully${feesUpdated > 0 ? `, ${feesUpdated} pending fees carried forward` : ''}${feesGenerated > 0 ? `, ${feesGenerated} new fees created` : ''}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to promote students' });
  }
}

// --- USER BULK IMPORT & MANAGEMENT ---

/**
 * Bulk Import Students with auto-generated credentials and parent mapping
 */
export async function bulkImportStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { students } = req.body; // Array of students

    if (!Array.isArray(students)) return res.status(400).json({ error: 'Students must be an array' });

    // Pre-fetch all academic years for this school so we can resolve by name
    const { data: academicYears } = await supabaseAdmin
      .from('academic_years')
      .select('id, name')
      .eq('school_id', schoolId);
    const yearMap: Record<string, string> = {};
    (academicYears || []).forEach((y: any) => { yearMap[y.name.trim()] = y.id; });

    // Pre-fetch current/active year as fallback
    const { data: currentYear } = await supabaseAdmin
      .from('academic_years')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle();
    const fallbackYearId = currentYear?.id || null;

    const results: any[] = [];
    for (const student of students) {
      try {
        const sectionId = student.section_id ?? student.sectionId;
        const className = student.existing_class_name ?? student.existingClassName ?? student.class_name ?? student.className ?? student.class;
        const sectionName = student.existing_section_name ?? student.existingSectionName ?? student.section_name ?? student.sectionName ?? student.section;
        if (!sectionId && (className == null || sectionName == null)) {
          results.push({ email: student.email, status: 'error', message: 'Class and Section are required, unless an existing Section ID is provided.' });
          continue;
        }
        const sectionResolution = await aiEntityResolver.resolveSection({
          schoolId,
          sectionId,
          className: className == null ? undefined : String(className).trim(),
          sectionName: sectionName == null ? undefined : String(sectionName).trim(),
        });
        if (sectionResolution.status !== 'resolved') {
          results.push({
            email: student.email,
            status: 'error',
            message: 'The specified existing class and section could not be resolved. No student or section was created.',
          });
          continue;
        }

        // Resolve academic_year_id from name (if provided) or fall back to current year
        const requestedAcademicYear = student.existing_academic_year ?? student.existingAcademicYear ?? student.academic_year ?? student.academicYear;
        const academicYearId = requestedAcademicYear
          ? yearMap[String(requestedAcademicYear).trim()]
          : fallbackYearId;
        if (!academicYearId) {
          results.push({
            email: student.email,
            status: 'error',
            message: requestedAcademicYear
              ? `Academic year ${requestedAcademicYear} does not exist in this school.`
              : 'Set an active academic year before importing students.',
          });
          continue;
        }

        const password = generateRandomPassword(10);

        // 1. Create Auth User
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: student.email,
          password: password,
          email_confirm: true,
          user_metadata: { role: 'student', schoolId }
        });

        if (authError) {
          results.push({ email: student.email, status: 'error', message: authError.message });
          continue;
        }

        // 2. Create User Record
        const { data: userRecord, error: userError } = await supabaseAdmin
          .from('users')
          .insert({
            auth_id: authUser.user.id,
            school_id: schoolId,
            email: student.email,
            role: 'student',
            first_name: student.first_name,
            last_name: student.last_name,
            phone: student.phone,
          })
          .select()
          .single();

        if (userError) {
          results.push({ email: student.email, status: 'error', message: userError.message });
          continue;
        }

        // 3. Create Student Profile
        const { data: studentProfile, error: profileError } = await supabaseAdmin
          .from('students')
          .insert({
            user_id: userRecord.id,
            school_id: schoolId,
            section_id: sectionResolution.id,
            academic_year_id: academicYearId,
            admission_number: student.admission_number || `ADM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            roll_number: student.roll_number,
            gender: student.gender,
            date_of_birth: student.date_of_birth,
            blood_group: student.blood_group,
            address: student.address,
            city: student.city,
            state: student.state,
            pincode: student.pincode,
          })
          .select()
          .single();

        if (profileError) {
          results.push({ email: student.email, status: 'error', message: profileError.message });
          continue;
        }

        // 4. Handle Parent Mapping
        if (student.guardian_email) {
          let parentUserId;
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', student.guardian_email)
            .single();

          if (existingUser) {
            parentUserId = existingUser.id;
          } else {
            const pPassword = generateRandomPassword(10);
            const { data: pAuthUser } = await supabaseAdmin.auth.admin.createUser({
              email: student.guardian_email,
              password: pPassword,
              email_confirm: true,
              user_metadata: { role: 'parent', schoolId }
            });

            if (pAuthUser) {
              const { data: dbUser, error: pUserErr } = await supabaseAdmin.from('users').insert({
                auth_id: pAuthUser.user?.id,
                school_id: schoolId,
                email: student.guardian_email,
                role: 'parent',
                first_name: student.father_name || student.mother_name || 'Parent',
                last_name: student.last_name,
                phone: student.guardian_phone
              }).select().single();
              if (pUserErr) throw pUserErr;
              if (dbUser) parentUserId = dbUser.id;
            }
          }

          if (parentUserId) {
            const { data: parentProfile, error: pRoleErr } = await supabaseAdmin
              .from('parents')
              .insert({ user_id: parentUserId, school_id: schoolId })
              .select()
              .single();

            if (pRoleErr && pRoleErr.code !== '23505') throw pRoleErr; // Ignore duplicate if they are already in the parents table

            // If they were already in parents, we must fetch their profile to link
            let pProfile = parentProfile;
            if (!pProfile) {
              const { data: existingProfile } = await supabaseAdmin.from('parents').select('*').eq('user_id', parentUserId).single();
              pProfile = existingProfile;
            }

            if (studentProfile && pProfile) {
              // Link as father/mother via API body preference; for now defaults to Father
              await supabaseAdmin.from('parent_students').insert({
                parent_id: pProfile.id,
                student_id: studentProfile.id,
                relationship: student.father_name ? 'Father' : 'Mother'
              });
            }
          }
        }

        results.push({
          email: student.email,
          username: student.email,
          password: password,
          status: 'success',
          studentId: studentProfile.id,
          message: 'Created successfully'
        });
      } catch (err: any) {
        results.push({ email: student.email, status: 'error', message: err.message });
      }
    }
    // Respond immediately — don't block the HTTP request
    const successfulStudentIds: string[] = results
      .filter((r: any) => r.status === 'success' && r.studentId)
      .map((r: any) => r.studentId);

    res.json({ results, message: `${successfulStudentIds.length} students created. Fee assignment is running in the background.` });

    // #1 OPTIMIZATION: Run fee assignment asynchronously after response
    if (successfulStudentIds.length > 0) {
      setImmediate(async () => {
        try {
          const now = new Date();
          const monthLabel = format(now, 'MMMM yyyy');

          const { data: structures } = await supabaseAdmin
            .from('fee_structures')
            .select('id, class_id, name, amount, due_day')
            .eq('school_id', schoolId)
            .eq('frequency', 'monthly')
            .eq('is_active', true);

          for (const structure of structures || []) {
            const { data: linkedStudents } = await supabaseAdmin
              .from('students')
              .select('id, user:users(id, first_name, last_name, email, phone)')
              .in('id', successfulStudentIds)
              .eq('is_active', true);

            if (!linkedStudents || linkedStudents.length === 0) continue;

            const { data: existingPayments } = await supabaseAdmin
              .from('fee_payments')
              .select('student_id')
              .eq('fee_structure_id', structure.id)
              .gte('created_at', format(startOfMonth(now), 'yyyy-MM-dd'))
              .lte('created_at', format(endOfMonth(now), 'yyyy-MM-dd'));

            const existingIds = new Set(existingPayments?.map((p: any) => p.student_id) || []);
            const dueDay = Math.min(structure.due_day || 10, endOfMonth(now).getDate());
            const dueDate = `${format(now, 'yyyy-MM')}-${String(dueDay).padStart(2, '0')}`;

            const newPayments = linkedStudents
              .filter((s: any) => !existingIds.has(s.id))
              .map((s: any) => ({ school_id: schoolId, student_id: s.id, fee_structure_id: structure.id, amount: structure.amount, paid_amount: 0, status: 'pending' }));

            if (newPayments.length > 0) {
              await supabaseAdmin.from('fee_payments').insert(newPayments);

              for (const s of linkedStudents.filter((s: any) => !existingIds.has(s.id))) {
                const sUser = (s as any).user;
                if (!sUser) continue;
                const msg = `📋 Welcome! A fee "${structure.name}" of ₹${structure.amount} for ${monthLabel} has been assigned. Due by: ${dueDate}. Please pay on time.`;

                await notificationService.createInAppNotification({ schoolId, userId: sUser.id, type: 'fee_generated', title: `New Fee: ${structure.name} — ${monthLabel}`, message: msg });
                await notificationService.sendMultiChannel({ schoolId, userId: sUser.id, channels: ['email', 'whatsapp'], type: 'fee_generated', title: `Fee Due: ${structure.name} — ${monthLabel}`, message: msg, emailAddress: sUser.email, phone: sUser.phone });

                const { data: parentLink } = await supabaseAdmin
                  .from('parent_students')
                  .select('parent:parents(user:users(id, email, phone))')
                  .eq('student_id', s.id).limit(1).maybeSingle();
                const pUser = (parentLink as any)?.parent?.user;
                if (pUser) {
                  const pMsg = `📋 Dear Parent, a new fee "${structure.name}" of ₹${structure.amount} for ${sUser.first_name} ${sUser.last_name || ''} for ${monthLabel} has been raised. Due by: ${dueDate}.`;
                  await notificationService.createInAppNotification({ schoolId, userId: pUser.id, type: 'fee_generated', title: `New Fee for ${sUser.first_name}: ${structure.name}`, message: pMsg });
                  await notificationService.sendMultiChannel({ schoolId, userId: pUser.id, channels: ['email', 'whatsapp'], type: 'fee_generated', title: `Fee Due: ${structure.name}`, message: pMsg, emailAddress: pUser.email, phone: pUser.phone });
                }
              }
            }
          }
          console.log(`[BULK-IMPORT] ✅ Background fee assignment complete for ${successfulStudentIds.length} students.`);
        } catch (feeErr: any) {
          console.error('[BULK-IMPORT] Background fee assignment failed:', feeErr.message);
        }
      });
    }
    return;
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Bulk Import Teachers
 */
export async function bulkImportTeachers(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { teachers } = req.body;

    if (!Array.isArray(teachers)) return res.status(400).json({ error: 'Teachers must be an array' });

    const results: any[] = [];
    for (const teacher of teachers) {
      const password = generateRandomPassword(12);

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: teacher.email,
        password: password,
        email_confirm: true,
        user_metadata: { role: 'teacher', schoolId }
      });

      if (authError) {
        results.push({ email: teacher.email, status: 'error', message: authError.message });
        continue;
      }

      const { data: userRecord, error: userError } = await supabaseAdmin
        .from('users')
        .insert({
          auth_id: authUser.user.id,
          school_id: schoolId,
          email: teacher.email,
          role: 'teacher',
          first_name: teacher.first_name,
          last_name: teacher.last_name,
          phone: teacher.phone,
        })
        .select()
        .single();

      if (userError) {
        results.push({ email: teacher.email, status: 'error', message: userError.message });
        continue;
      }

      await supabaseAdmin.from('teachers').insert({
        user_id: userRecord.id,
        school_id: schoolId,
        employee_id: teacher.employee_id || `EMP-${Date.now()}`,
        designation: teacher.designation,
        department: teacher.department,
      });

      results.push({
        email: teacher.email,
        password: password,
        status: 'success'
      });
    }

    return res.json({ results });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Update any user profile
 */
export async function updateUserDetails(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId } = req.params;
    const { firstName, lastName, phone, isActive, ...profileData } = req.body;
    const schoolId = req.user!.school_id;

    // First fetch the user to know their role
    const { data: user } = await supabaseAdmin.from('users').select('role').eq('id', userId).single();

    // Enforce phone uniqueness for admin and teacher
    if (phone && (user?.role === 'admin' || user?.role === 'teacher')) {
      const { data: existingPhone } = await supabaseAdmin
        .from('users')
        .select('id')
        .in('role', ['admin', 'teacher'])
        .eq('phone', phone)
        .neq('id', userId)
        .maybeSingle();

      if (existingPhone) {
        return res.status(400).json({ error: 'This phone number is already registered to another Admin or Teacher.' });
      }
    }

    // 1. Update Core User
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({ first_name: firstName, last_name: lastName, phone, is_active: isActive })
      .eq('id', userId)
      .eq('school_id', schoolId);

    if (userError) return res.status(400).json({ error: userError.message });

    // 2. Identify Role and Update Table
    if (user?.role === 'student') {
      await supabaseAdmin.from('students').update(profileData).eq('user_id', userId).eq('school_id', schoolId);
    } else if (user?.role === 'teacher') {
      await supabaseAdmin.from('teachers').update(profileData).eq('user_id', userId).eq('school_id', schoolId);
    }

    return res.json({ message: 'User updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Update failed' });
  }
}

export async function updateSchoolProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const { schoolName, schoolAddress, schoolPhone, schoolEmail, schoolWebsite } = req.body;
    const updates: Record<string, any> = {};

    if (typeof schoolName !== 'undefined') updates.name = (schoolName || '').trim() || null;
    if (typeof schoolAddress !== 'undefined') updates.address = (schoolAddress || '').trim() || null;
    if (typeof schoolPhone !== 'undefined') updates.phone = (schoolPhone || '').trim() || null;
    if (typeof schoolEmail !== 'undefined') updates.email = (schoolEmail || '').trim() || null;
    if (typeof schoolWebsite !== 'undefined') updates.website = (schoolWebsite || '').trim() || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No school profile fields were provided' });
    }

    const { data, error } = await supabaseAdmin
      .from('schools')
      .update(updates)
      .eq('id', req.user!.school_id)
      .select('id, name, address, phone, email, website')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update school profile' });
  }
}

/**
 * Remove User (Deactivate)
 */
export async function removeUser(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId } = req.params;
    const { error } = await supabaseAdmin
      .from('users')
      .update({ is_active: false })
      .eq('id', userId)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'User deactivated' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Operation failed' });
  }
}

/**
 * Manual Automation Trigger (for Demo/Testing)
 * @route POST /api/admin/automation/trigger
 * @param type 'fee_gen' | 'reminders' | 'reports' | 'overdue'
 */
export async function triggerAutomation(req: AuthenticatedRequest, res: Response) {
  try {
    const { type } = req.body;
    const schoolId = req.user!.school_id;

    // #8 OPTIMIZATION: Rate limit — max once per 10 minutes per school
    const COOLDOWN_MS = 10 * 60 * 1000;
    const lastRun = automationRateLimit.get(`${schoolId}:${type}`);
    if (lastRun && Date.now() - lastRun < COOLDOWN_MS) {
      const secondsLeft = Math.ceil((COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
      return res.status(429).json({ error: `Please wait ${secondsLeft}s before triggering this automation again.` });
    }
    automationRateLimit.set(`${schoolId}:${type}`, Date.now());

    const { feesAutomation } = require('../services/fees_automation.service');

    // Respond immediately, run heavy jobs in background
    switch (type) {
      case 'fee_gen':
        res.json({ message: 'Monthly fee generation started in background. Students and parents will be notified shortly.' });
        // Scoped to THIS school → dramatically faster, and the per-school
        // in-flight guard prevents a race with the midnight cron.
        setImmediate(() => feesAutomation.autoGenerateMonthlyFees({ schoolId }));
        return;
      case 'reminders':
        res.json({ message: 'Fee reminders dispatch started in background.' });
        setImmediate(() => feesAutomation.runScheduledFeeReminders());
        return;
      case 'reports':
        res.json({ message: 'End-of-month reports and receipts started in background.' });
        setImmediate(async () => {
          await feesAutomation.sendMonthlyProgressReports();
          await feesAutomation.sendEndOfMonthReceipts();
        });
        return;
      case 'overdue':
        res.json({ message: 'Overdue status check started in background.' });
        setImmediate(() => feesAutomation.markOverdueFees());
        return;
      default:
        return res.status(400).json({ error: 'Invalid automation type' });
    }
  } catch (error: any) {
    console.error('Automation trigger error:', error);
    return res.status(500).json({ error: 'Failed to trigger automation' });
  }
}
// Payment Gateway Settings
export async function getPaymentSettings(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('schools')
      .select('razorpay_key_id, razorpay_key_secret')
      .eq('id', req.user!.school_id)
      .maybeSingle();

    if (error) {
      // If columns are missing, return nulls instead of crashing
      if (error.code === '42703') {
        return res.json({ razorpay_key_id: null, razorpay_key_secret: null });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.json(data || { razorpay_key_id: null, razorpay_key_secret: null });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
}

export async function updatePaymentSettings(req: AuthenticatedRequest, res: Response) {
  try {
    const { keyId, keySecret } = req.body;
    const { error } = await supabaseAdmin
      .from('schools')
      .update({
        razorpay_key_id: keyId,
        razorpay_key_secret: keySecret
      })
      .eq('id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Payment gateway updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update settings' });
  }
}

// Get Academic Year Stats
export async function getAcademicYearStats(req: AuthenticatedRequest, res: Response) {
  try {
    const { yearId } = req.params;
    const schoolId = req.user!.school_id;

    // 1. Get classes for this school
    const { data: classes } = await supabaseAdmin
      .from('classes')
      .select('id, name, sections(id, name)')
      .eq('school_id', schoolId);

    if (!classes || classes.length === 0) {
      return res.json({ totalSections: 0, studentsBySection: [], fees: { total: 0, collected: 0, pending: 0 } });
    }

    let totalSections = 0;
    const sectionIds: string[] = [];
    const sectionMap: Record<string, string> = {};

    classes.forEach((c: any) => {
      totalSections += c.sections?.length || 0;
      c.sections?.forEach((s: any) => {
        sectionIds.push(s.id);
        sectionMap[s.id] = `${c.name} - ${s.name}`;
      });
    });

    // 2. Get students in these sections for the specific academic year
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('id, section_id')
      .in('section_id', sectionIds)
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId);

    const studentCounts: Record<string, number> = {};
    const studentIds: string[] = [];

    students?.forEach((s: any) => {
      studentIds.push(s.id);
      studentCounts[s.section_id] = (studentCounts[s.section_id] || 0) + 1;
    });

    const studentsBySection = Object.entries(studentCounts).map(([secId, count]) => ({
      section: sectionMap[secId] || 'Unknown Section',
      count
    }));

    // 3. Get fees mapped to this academic year
    const { data: fees } = await supabaseAdmin
      .from('fee_structures')
      .select('id, amount')
      .eq('academic_year_id', yearId)
      .eq('school_id', schoolId);

    let feeTotal = 0;
    let feeCollected = 0;

    if (fees && fees.length > 0) {
      const feeStructureIds = fees.map(f => f.id);

      const { data: feePayments } = await supabaseAdmin
        .from('fee_payments')
        .select('amount, paid_amount')
        .in('fee_structure_id', feeStructureIds)
        .eq('school_id', schoolId);

      feePayments?.forEach((p: any) => {
        feeTotal += Number(p.amount || 0);
        feeCollected += Number(p.paid_amount || 0);
      });
    }

    return res.json({
      totalSections,
      studentsBySection,
      fees: {
        total: feeTotal,
        collected: feeCollected,
        pending: feeTotal - feeCollected
      }
    });
  } catch (error: any) {
    console.error('getAcademicYearStats error:', error);
    return res.status(500).json({ error: 'Failed to fetch academic year stats' });
  }
}

// Bulk Import Fee Structures
export async function bulkImportFeeStructures(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { fees } = req.body;

    if (!Array.isArray(fees)) return res.status(400).json({ error: 'Fees must be an array' });

    const results: any[] = [];

    for (const fee of fees) {
      const { data, error } = await supabaseAdmin
        .from('fee_structures')
        .insert({
          school_id: schoolId,
          academic_year_id: fee.academic_year_id || null,
          class_id: fee.class_id || null,
          name: fee.name,
          amount: fee.amount,
          frequency: fee.frequency || 'monthly',
          due_day: fee.due_day || 10,
          is_mandatory: fee.is_mandatory !== false,
        })
        .select()
        .single();

      if (error) {
        results.push({ name: fee.name, status: 'error', message: error.message });
      } else {
        results.push({ name: fee.name, status: 'success' });
      }
    }

    return res.json({ results });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function triggerSchoolRollover(req: AuthenticatedRequest, res: Response) {
  try {
    const { targetAcademicYearId } = req.body;
    const schoolId = req.user!.school_id;

    if (!targetAcademicYearId) {
      return res.status(400).json({ error: 'Target academic year ID is required.' });
    }

    // 0. Automatically copy Fee Structures from the currently active year to the target year
    const { data: currentYear } = await supabaseAdmin
      .from('academic_years')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle();

    if (currentYear && currentYear.id !== targetAcademicYearId) {
      // Get all fee structures from the current year
      const { data: oldStructures } = await supabaseAdmin
        .from('fee_structures')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year_id', currentYear.id);

      if (oldStructures && oldStructures.length > 0) {
        // Check if structures already exist for target year to prevent double-copying
        const { data: newStructures } = await supabaseAdmin
          .from('fee_structures')
          .select('id')
          .eq('school_id', schoolId)
          .eq('academic_year_id', targetAcademicYearId);

        if (!newStructures || newStructures.length === 0) {
          const structuresToInsert = oldStructures.map((s: any) => ({
            school_id: schoolId,
            academic_year_id: targetAcademicYearId,
            class_id: s.class_id,
            name: s.name,
            amount: s.amount,
            frequency: s.frequency,
            due_day: s.due_day,
            is_mandatory: s.is_mandatory,
            transport_route_id: s.transport_route_id,
            applies_to: s.applies_to
          }));
          await supabaseAdmin.from('fee_structures').insert(structuresToInsert);
          console.log(`[ROLLOVER] Copied ${structuresToInsert.length} fee structures to new year.`);
        }
      }
    }

    // 1. Get classes and sort by grade/name. For word classes (Nursery, UKG etc) with grade=0, they will sort by name.
    const { data: classes } = await supabaseAdmin
      .from('classes')
      .select('*, sections(*)')
      .eq('school_id', schoolId);

    if (!classes || classes.length === 0) {
      return res.status(400).json({ error: 'No classes found in the school.' });
    }

    // Sort: Primary sort by grade (numeric), secondary sort by name alphabetically
    classes.sort((a: any, b: any) => {
      const gradeA = a.grade ?? 0;
      const gradeB = b.grade ?? 0;
      if (gradeA !== gradeB) {
        return gradeA - gradeB;
      }
      return String(a.name).localeCompare(String(b.name));
    });

    const maxGrade = classes[classes.length - 1].grade ?? 0;

    // 2. Get all active students for this school
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('id, section_id, transport_route_id, section:sections(name, class:classes(grade))')
      .eq('school_id', schoolId)
      .eq('is_active', true);

    if (!students) {
      return res.status(400).json({ error: 'No active students found.' });
    }

    let promotedCount = 0;
    let passedOutCount = 0;
    let skippedCount = 0;
    let feesUpdated = 0;
    let feesGenerated = 0;

    for (const student of students) {
      const currentGrade = (student as any).section?.class?.grade;
      const currentSectionName = (student as any).section?.name;

      if (currentGrade === undefined) {
        skippedCount++;
        continue;
      }

      if (currentGrade >= maxGrade) {
        // Max class student passes out
        await supabaseAdmin
          .from('students')
          .update({ is_active: false })
          .eq('id', student.id);
        passedOutCount++;
      } else {
        // Find next class
        const nextClass = classes.find((c: any) => c.grade > currentGrade);
        if (nextClass) {
          // Find matching section in next class
          let matchingSection = nextClass.sections?.find((s: any) => s.name === currentSectionName);
          let nextSectionId = matchingSection?.id;

          // If section doesn't exist, auto-create it!
          if (!nextSectionId && currentSectionName) {
            const { data: newSection } = await supabaseAdmin
              .from('sections')
              .insert({
                school_id: schoolId,
                class_id: nextClass.id,
                name: currentSectionName,
                capacity: 60
              })
              .select('id')
              .maybeSingle();

            if (newSection) {
              nextSectionId = newSection.id;
              if (!nextClass.sections) nextClass.sections = [];
              nextClass.sections.push({ id: newSection.id, name: currentSectionName });
            }
          }

          // Fallback just in case creation failed
          if (!nextSectionId) {
            nextSectionId = nextClass.sections?.[0]?.id || null;
          }

          // Update student to new section and academic year
          await supabaseAdmin
            .from('students')
            .update({
              academic_year_id: targetAcademicYearId,
              section_id: nextSectionId
            })
            .eq('id', student.id);

          // Step 1: Update pending fees to new academic year
          const { data: oldFees } = await supabaseAdmin
            .from('fee_payments')
            .select('id')
            .eq('student_id', student.id)
            .eq('status', 'pending')
            .neq('academic_year_id', targetAcademicYearId);

          if (oldFees && oldFees.length > 0) {
            const oldFeeIds = oldFees.map(f => f.id);
            await supabaseAdmin
              .from('fee_payments')
              .update({ academic_year_id: targetAcademicYearId })
              .in('id', oldFeeIds);
            feesUpdated += oldFeeIds.length;
          }

          // Step 2: Generate new fees for the new class
          const { data: feeStructures } = await supabaseAdmin
            .from('fee_structures')
            .select('id, name, amount, frequency, applies_to, transport_route_id')
            .eq('school_id', schoolId)
            .eq('academic_year_id', targetAcademicYearId)
            .or(`applies_to.eq.all,applies_to.eq.class,class_id.eq.${nextClass.id}`);

          if (feeStructures && feeStructures.length > 0) {
            const now = new Date();
            const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);
            const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

            for (const structure of feeStructures) {
              // Skip transport fees if student doesn't have transport
              if (structure.applies_to === 'transport_route' && !student.transport_route_id) {
                continue;
              }

              // Check if fee already exists
              const { data: existingFee } = await supabaseAdmin
                .from('fee_payments')
                .select('id')
                .eq('student_id', student.id)
                .eq('fee_structure_id', structure.id)
                .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`)
                .maybeSingle();

              if (!existingFee) {
                await supabaseAdmin.from('fee_payments').insert({
                  school_id: schoolId,
                  student_id: student.id,
                  fee_structure_id: structure.id,
                  amount: structure.amount,
                  title: structure.frequency === 'monthly' ? `Monthly Fee - ${monthLabel}` : structure.name || 'Fee',
                  due_date: dueDate.toISOString().split('T')[0],
                  status: 'pending',
                  academic_year_id: targetAcademicYearId,
                });
                feesGenerated++;
              }
            }
          }

          promotedCount++;
        } else {
          skippedCount++;
        }
      }
    }

    res.json({
      message: `Rollover complete! ${promotedCount} students promoted, ${passedOutCount} passed out, ${skippedCount} skipped. ${feesUpdated} pending fees carried forward, ${feesGenerated} new fees created.`,
      promotedCount,
      passedOutCount,
      skippedCount,
      feesUpdated,
      feesGenerated
    });
  } catch (error: any) {
    console.error('School rollover error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete school rollover.' });
  }
}

// Generate fees for existing students who don't have fees
export async function generateFeesForExistingStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { academic_year_id, section_id, class_id } = req.body;

    let studentQuery = supabaseAdmin
      .from('students')
      .select('id, section_id, transport_route_id')
      .eq('school_id', schoolId)
      .eq('is_active', true);

    if (academic_year_id) studentQuery = studentQuery.eq('academic_year_id', academic_year_id);
    if (section_id) studentQuery = studentQuery.eq('section_id', section_id);
    if (class_id) {
      const { data: sections } = await supabaseAdmin.from('sections').select('id').eq('class_id', class_id);
      const sectionIds = (sections || []).map((s: any) => s.id);
      studentQuery = studentQuery.in('section_id', sectionIds);
    }

    const { data: students } = await studentQuery;
    if (!students || students.length === 0) {
      return res.json({ message: 'No students found', feesGenerated: 0 });
    }

    // Get current academic year if not specified
    let targetYearId = academic_year_id;
    if (!targetYearId) {
      const { data: currentYear } = await supabaseAdmin
        .from('academic_years')
        .select('id')
        .eq('school_id', schoolId)
        .eq('is_current', true)
        .maybeSingle();
      targetYearId = currentYear?.id;
    }

    if (!targetYearId) {
      return res.status(400).json({ error: 'No academic year specified or found' });
    }

    // Get fee structures for this academic year
    const { data: feeStructures } = await supabaseAdmin
      .from('fee_structures')
      .select('id, name, amount, frequency, due_day, applies_to, transport_route_id, class_id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', targetYearId)
      .eq('is_active', true);

    if (!feeStructures || feeStructures.length === 0) {
      return res.json({ message: 'No fee structures found for this academic year', feesGenerated: 0 });
    }

    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    console.log(`[FEE-GEN] Generating fees for ${students.length} students, ${feeStructures.length} structures`);

    // 1. Fetch all sections for fast class_id resolution
    const { data: allSections } = await supabaseAdmin.from('sections').select('id, class_id').eq('school_id', schoolId);
    const sectionClassMap = new Map((allSections || []).map((s: any) => [s.id, s.class_id]));

    // 2. Fetch all existing fee payments for this month for fast deduplication
    const { data: existingPayments } = await supabaseAdmin
      .from('fee_payments')
      .select('student_id, fee_structure_id')
      .eq('school_id', schoolId)
      .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`);

    const existingSet = new Set((existingPayments || []).map((p: any) => `${p.student_id}:${p.fee_structure_id}`));

    // 3. Create fee payments for each student
    const feePayments: any[] = [];
    for (const student of students) {
      for (const structure of feeStructures) {
        // Skip transport fees if student doesn't have transport
        if (structure.applies_to === 'transport_route' && !student.transport_route_id) {
          continue;
        }

        // Skip class-specific fees if not matching
        if (structure.applies_to === 'class' && structure.class_id) {
          const studentClassId = sectionClassMap.get(student.section_id);
          if (studentClassId !== structure.class_id) {
            continue;
          }
        }

        // Check deduplication set
        if (!existingSet.has(`${student.id}:${structure.id}`)) {
          feePayments.push({
            school_id: schoolId,
            student_id: student.id,
            fee_structure_id: structure.id,
            amount: structure.amount,
            title: structure.frequency === 'monthly' ? `Monthly Fee - ${monthLabel}` : structure.name || 'Fee',
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pending',
            academic_year_id: targetYearId,
          });
        }
      }
    }

    // 4. Insert fees in chunks of 500
    let feesGenerated = 0;
    if (feePayments.length > 0) {
      console.log(`[FEE-GEN] Inserting ${feePayments.length} fee payments in chunks...`);
      const CHUNK_SIZE = 500;
      for (let i = 0; i < feePayments.length; i += CHUNK_SIZE) {
        const chunk = feePayments.slice(i, i + CHUNK_SIZE);
        const { error: feeError } = await supabaseAdmin.from('fee_payments').insert(chunk);
        if (feeError) {
          console.error('[FEE-GEN] ❌ Error creating fees chunk:', feeError);
          // Don't fail completely, just log and continue to next chunk, or fail early
          return res.status(400).json({ error: feeError.message });
        }
        feesGenerated += chunk.length;
      }
      console.log(`[FEE-GEN] ✅ Successfully created ${feesGenerated} fee payments`);
    } else {
      console.log('[FEE-GEN] No new fees to create (all already exist)');
    }

    return res.json({
      message: `Generated ${feesGenerated} fee records for ${students.length} students`,
      feesGenerated,
      studentsProcessed: students.length
    });
  } catch (error: any) {
    console.error('[FEE-GEN] Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate fees' });
  }
}

export async function resendAllAdmins(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    // role param can be 'admin', 'teacher', 'student', 'parent', or 'all'
    const role: string = req.body?.role || 'admin';

    let query = supabaseAdmin
      .from('users')
      .select('id, email, first_name, role')
      .eq('school_id', schoolId);

    if (role !== 'all') {
      query = query.eq('role', role);
    }

    const { data: users, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch users' });

    let successCount = 0;
    for (const u of users) {
      const newPassword = generateRandomPassword(10);
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(u.id, { password: newPassword });

      if (!authErr && u.email) {
        await notificationService.sendMultiChannel({
          schoolId,
          channels: ['email'],
          type: 'credentials',
          title: `Your ${u.role.charAt(0).toUpperCase() + u.role.slice(1)} Login Credentials`,
          message: `Hello ${u.first_name},\n\nYour login credentials for Kautix School Management:\n\nLogin URL: https://kautix.in/login\nEmail: ${u.email}\nPassword: ${newPassword}\n\nPlease login and change your password after your first login.`,
          emailAddress: u.email,
        });
        successCount++;
      }
    }

    return res.json({ message: `Credentials sent to ${successCount} ${role === 'all' ? 'users' : role + 's'} successfully.` });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to resend credentials' });
  }
}

export async function getAdmins(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { data: admins, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('school_id', schoolId)
      .eq('role', 'admin');

    if (error) return res.status(500).json({ error: 'Failed to fetch admins' });
    return res.json({ admins });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch admins' });
  }
}

import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import { notificationService } from '../services/notification.service';

// Get all teachers
export async function getTeachers(req: AuthenticatedRequest, res: Response) {
  try {
    const { status = 'active', department, performance_min } = req.query;

    let query = supabaseAdmin
      .from('teachers')
      .select(`
        id,
        employee_id,
        designation,
        department,
        qualification,
        experience_years,
        date_of_joining,
        specialization,
        salary,
        performance_rating,
        workload_percentage,
        is_class_teacher,
        user:users(
          id, 
          email, 
          first_name, 
          last_name, 
          phone, 
          avatar_url, 
          is_active
        )
      `)
      .eq('school_id', req.user!.school_id);

    // Filter by user active status
    if (status === 'active') query = query.filter('user.is_active', 'eq', true);
    if (status === 'inactive') query = query.filter('user.is_active', 'eq', false);
    if (department) query = query.eq('department', department as string);
    if (performance_min) query = query.gte('performance_rating', parseFloat(performance_min as string));

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    // Transform to SaaS-ready structure
    const transformedData = data.map((teacher: any) => {
      const workload = teacher.workload_percentage || 0;
      let status = 'optimal';
      if (workload < 30) status = 'underutilized';
      if (workload > 70) status = 'overloaded';

      const userObj = Array.isArray(teacher.user) ? teacher.user[0] : teacher.user;
      
      return {
        id: teacher.id,
        userId: userObj?.id,
        profile: {
          full_name: `${userObj?.first_name || ''} ${userObj?.last_name || ''}`.trim(),
          first_name: userObj?.first_name,
          last_name: userObj?.last_name,
          email: userObj?.email,
          phone: userObj?.phone,
          avatar: userObj?.avatar_url,
          is_active: userObj?.is_active
        },
        professional: {
          employee_id: teacher.employee_id,
          designation: teacher.designation,
          department: teacher.department,
          qualification: teacher.qualification,
          experience_years: teacher.experience_years,
          date_of_joining: teacher.date_of_joining,
          specialization: teacher.specialization
        },
        role: {
          is_class_teacher: teacher.is_class_teacher
        },
        performance: {
          rating: teacher.performance_rating,
          workload_percentage: workload,
          status: status
        },
        compensation: {
          salary: teacher.salary
        }
      };
    });

    return res.json({
      success: true,
      message: 'Teachers fetched successfully',
      data: transformedData,
      meta: {
        total: transformedData.length,
        active: transformedData.filter(t => t.profile.is_active).length,
        class_teachers: transformedData.filter(t => t.role.is_class_teacher).length
      }
    });
  } catch (error: any) {
    console.error('getTeachers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch teachers' });
  }
}

// Get teacher dashboard
export async function getTeacherDashboard(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user!.id;

    // Get teacher 
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id, designation, department')
      .eq('user_id', userId)
      .single();

    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    // Get timetable slots with rich section and subject info
    const { data: timetable } = await supabaseAdmin
      .from('timetable_slots')
      .select('*, subject:subjects(name, code), section:sections(id, name, class_teacher_id, class:classes(id, name))')
      .eq('teacher_id', userId);

    // Derive unique assigned sections from timetable
    const assignedSectionsMap = new Map<string, any>();
    timetable?.forEach((slot: any) => {
      if (slot.section_id && !assignedSectionsMap.has(slot.section_id)) {
        assignedSectionsMap.set(slot.section_id, {
          id: slot.section_id,
          name: slot.section?.name,
          className: slot.section?.class?.name,
          classId: slot.section?.class?.id,
        });
      }
    });
    const assignedSections = Array.from(assignedSectionsMap.values());
    const assignedSectionIds = assignedSections.map(s => s.id);
    // Calculate real stats
    const totalClassesContext = new Set(timetable?.map(t => t.section_id)).size;
    const { count: studentCount } = await supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).in('section_id', timetable?.map(t => t.section_id) || []).eq('is_active', true);

    const todayDate = new Date().toLocaleDateString('en-CA', { weekday: 'long' });
    const dayMap: Record<string, number> = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 0 };
    const dayOfWeek = dayMap[todayDate] || 1; // Default to Monday if lookup fails

    const todayClasses = timetable?.filter((t: any) => t.day_of_week === dayOfWeek).length || 0;

    // Get real performance data from exams for this teacher's sections
    let performanceData: any[] = [];
    if (assignedSectionIds.length > 0 || userId) {
      const perfExamFilter = assignedSectionIds.length > 0
        ? `created_by.eq.${userId},section_id.in.(${assignedSectionIds.join(',')})`
        : `created_by.eq.${userId}`;

      const { data: teacherExams } = await supabaseAdmin
        .from('exams')
        .select('id, total_marks, class:classes(name)')
        .eq('school_id', schoolId)
        .or(perfExamFilter);

      const teacherExamIds = teacherExams?.map((e: any) => e.id) || [];

      if (teacherExamIds.length > 0) {
        const { data: results } = await supabaseAdmin
          .from('exam_results')
          .select('marks_obtained, exam_id, exam:exams(total_marks, class:classes(name))')
          .in('exam_id', teacherExamIds);

        if (results && results.length > 0) {
          const classMap: Record<string, { total: number, max: number }> = {};
          results.forEach((r: any) => {
            const className = r.exam?.class?.name;
            if (!className) return;
            if (!classMap[className]) classMap[className] = { total: 0, max: 0 };
            classMap[className].total += Number(r.marks_obtained);
            classMap[className].max += Number(r.exam.total_marks);
          });
          performanceData = Object.keys(classMap).map(c => ({
            class: c,
            avg: Math.round((classMap[c].total / classMap[c].max) * 100)
          }));
        }
      }
    }

    // Get pending tasks (assignments to be graded)
    const { data: assignments } = await supabaseAdmin
      .from('lms_assignments')
      .select('*, course:lms_courses(title)')
      .eq('teacher_id', userId);

    const pendingTasks = assignments?.map(a => ({
      task: `Grade ${a.title}`,
      dueDate: new Date(a.due_date).toLocaleDateString(),
      priority: new Date(a.due_date) < new Date() ? 'high' : 'medium'
    })) || [];

    // Get exams teacher needs to grade or manage (created by teacher OR for their assigned sections)
    let examsQuery = supabaseAdmin
      .from('exams')
      .select('*, class:classes(name), subject:subjects(name)')
      .eq('school_id', schoolId)
      .order('date', { ascending: false })
      .limit(5);

    if (assignedSectionIds.length > 0) {
      examsQuery = examsQuery.or(`created_by.eq.${userId},section_id.in.(${assignedSectionIds.join(',')})`);
    } else {
      examsQuery = examsQuery.eq('created_by', userId);
    }

    const { data: exams } = await examsQuery;

    return res.json({
      teacher,
      assignedSections,
      timetableSections: Array.from(new Set(timetable?.map((t: any) => t.section_id) || [])),
      primarySectionId: assignedSections[0]?.id || null,
      primaryClassId: assignedSections[0]?.classId || null,
      stats: {
        totalClassesTaught: totalClassesContext,
        totalStudentsReached: studentCount || 0,
        classesToday: todayClasses,
        weeklyLoad: timetable?.length || 0,
        pendingTasks: pendingTasks.length,
        attendanceRate: 0
      },
      timetable: (timetable || []).filter((t: any) => t.day_of_week === dayOfWeek),
      performanceData: performanceData.length > 0 ? performanceData : [],
      tasks: pendingTasks.length > 0 ? pendingTasks : [],
      exams: exams?.map(e => ({
        id: e.id,
        name: e.name,
        subject: (e as any).subject.name,
        class: (e as any).class.name,
        date: new Date(e.date).toLocaleDateString(),
        status: e.status,
        totalMarks: e.total_marks,
        passingMarks: e.passing_marks
      })) || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
}

// Get teacher by ID
export async function getTeacherById(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { data: teacher, error } = await supabaseAdmin
      .from('teachers')
      .select(`
        *,
        user:users(id, email, first_name, last_name, phone, avatar_url, is_active)
      `)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .single();

    if (error || !teacher) return res.status(404).json({ error: 'Teacher not found' });
    
    // Handle cases where Supabase might return user as an array
    if (Array.isArray(teacher.user)) {
      teacher.user = teacher.user[0];
    }

    // Ensure we use the teacher's user_id for fetching relations (timetable slots uses users(id))
    const userId = teacher.user_id;

    // Get weekly load (number of periods)
    const { count: weeklyLoad } = await supabaseAdmin
      .from('timetable_slots')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', userId);

    // Get subjects taught
    const { data: subjects } = await supabaseAdmin
      .from('class_subjects')
      .select('subject:subjects(name)')
      .eq('teacher_id', userId);

    // Default student count formula based on periods
    const studentCount = (weeklyLoad || 0) * 15;

    // Get schedule
    const { data: schedule } = await supabaseAdmin
      .from('timetable_slots')
      .select(`
        *,
        section:sections(name, class:classes(name)),
        subject:subjects(name)
      `)
      .eq('teacher_id', userId);

    return res.json({
      ...teacher,
      weekly_load: weeklyLoad || 0,
      student_count: studentCount || 0,
      attendance_rate: 0,
      schedule: schedule || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch teacher' });
  }
}

// Create teacher
export async function createTeacher(req: AuthenticatedRequest, res: Response) {
  try {
    const { email, firstName, lastName, phone, employeeId, designation, department, qualification, experienceYears, dateOfJoining, specialization, salary, dateOfBirth, academicYearId, isClassTeacher, teacherClassId, teacherSectionId } = req.body;

    // Generate credentials
    const formatDOB = (dob: string) => {
      if (!dob) return 'Welcome@123';
      const parts = dob.split('-');
      if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
      return dob.replace(/\D/g, '');
    };

    const teacherPassword = formatDOB(dateOfBirth);
    const hashedPassword = await bcrypt.hash(teacherPassword, 10);

    const currentYear = new Date().getFullYear();
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const finalEmployeeId = `EMP-${currentYear}-${randomSuffix}`;
    const loginId = finalEmployeeId;
    const authEmail = `${loginId.toLowerCase().replace(/-/g, '')}@kautix.local`;

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        school_id: req.user!.school_id,
        email,
        username: loginId,
        phone,
        role: 'teacher',
        first_name: firstName,
        last_name: lastName,
        academic_year_id: academicYearId || null,
      })
      .select()
      .single();

    if (userError) return res.status(400).json({ error: userError.message });

    // Create REAL Supabase Auth User
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: teacherPassword,
      email_confirm: true,
      user_metadata: { role: 'teacher', school_id: req.user!.school_id }
    });

    if (authError) {
      await supabaseAdmin.from('users').delete().eq('id', user.id);
      return res.status(400).json({ error: authError.message });
    }

    if (authUser) {
      await supabaseAdmin.from('users').update({ auth_id: authUser.user.id }).eq('id', user.id);
    }


    const { data: teacher, error } = await supabaseAdmin
      .from('teachers')
      .insert({
        user_id: user.id,
        school_id: req.user!.school_id,
        employee_id: finalEmployeeId,
        designation,
        department,
        qualification,
        experience_years: experienceYears,
        date_of_joining: dateOfJoining,
        specialization,
        salary,
        is_class_teacher: isClassTeacher || false,
      })
      .select()
      .single();

    if (error) {
      // Rollback
      if (authUser) await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      await supabaseAdmin.from('users').delete().eq('id', user.id);
      return res.status(400).json({ error: error.message });
    }

    // Assign Class Teacher to Section if selected
    if (isClassTeacher && teacherSectionId) {
      // 1. Remove this teacher from any other sections first (one teacher = one class only)
      await supabaseAdmin
        .from('sections')
        .update({ class_teacher_id: null })
        .eq('class_teacher_id', user.id);

      // 2. Assign to the new section
      await supabaseAdmin
        .from('sections')
        .update({ class_teacher_id: user.id })
        .eq('id', teacherSectionId)
        .eq('school_id', req.user!.school_id);
    }

    // Send Credentials
    await notificationService.sendMultiChannel({
      schoolId: req.user!.school_id,
      channels: ['email', 'whatsapp'],
      type: 'credentials',
      title: 'Your Kautix Teacher Portal Credentials',
      message: `Welcome ${firstName}! Your Teacher account for Kautix is ready.\n\nLogin URL: https://kautix.in/login\nLogin ID: ${loginId}\nPass: ${teacherPassword}`,
      phone: phone,
      emailAddress: email,
    });

    return res.status(201).json(teacher);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create teacher' });
  }
}

// Bulk create teachers
export async function bulkCreateTeachers(req: AuthenticatedRequest, res: Response) {
  try {
    const { teachers } = req.body;
    if (!Array.isArray(teachers)) {
      return res.status(400).json({ error: 'Expected an array of teachers' });
    }

    const results: any[] = [];
    for (const teacherData of teachers) {
      const {
        email, firstName, lastName, phone, employeeId, designation,
        department, qualification, experienceYears, dateOfJoining,
        specialization, salary, dateOfBirth
      } = teacherData;

      try {
        const formatDOB = (dob: string) => {
          if (!dob) return 'Welcome@123';
          const parts = dob.split('-');
          if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
          return dob.replace(/\D/g, '');
        };

        const teacherPassword = formatDOB(dateOfBirth);
        const teacherEmail = email || `teacher_${Date.now()}_${Math.floor(Math.random() * 1000)}@kautix.local`;

        // 🟢 SMART ENGINE: Duplicate Teacher Detection
        let dupQuery = supabaseAdmin
          .from('users')
          .select('id, email, phone')
          .eq('role', 'teacher');
          
        if (phone && teacherEmail) {
          dupQuery = dupQuery.or(`phone.eq.${phone},email.eq.${teacherEmail}`);
        } else if (phone) {
          dupQuery = dupQuery.eq('phone', phone);
        } else {
          dupQuery = dupQuery.eq('email', teacherEmail);
        }

        const { data: existingTeacher } = await dupQuery.maybeSingle();

        if (existingTeacher) {
          results.push({
            success: false,
            status: 'duplicate',
            employeeId,
            message: `Teacher with phone ${phone} or email ${teacherEmail} already exists.`,
            raw: teacherData
          });
          continue;
        }

        const { data: user, error: userError } = await supabaseAdmin
          .from('users')
          .insert({
            school_id: req.user!.school_id,
            email: teacherEmail,
            phone,
            role: 'teacher',
            first_name: firstName,
            last_name: lastName,
          })
          .select()
          .maybeSingle();

        if (userError) throw userError;

        // Create REAL Supabase Auth User
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: teacherEmail,
          password: teacherPassword,
          email_confirm: true,
          user_metadata: { role: 'teacher', school_id: req.user!.school_id }
        });

        if (!authError && authUser) {
          await supabaseAdmin.from('users').update({ auth_id: authUser.user.id }).eq('id', user.id);
        }

        const currentYear = new Date().getFullYear();
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const finalEmployeeId = `EMP-${currentYear}-${randomSuffix}`;

        const { data: teacher, error } = await supabaseAdmin
          .from('teachers')
          .insert({
            user_id: user.id,
            school_id: req.user!.school_id,
            employee_id: finalEmployeeId,
            designation,
            department,
            qualification,
            experience_years: experienceYears,
            date_of_joining: dateOfJoining,
            specialization,
            salary,
          })
          .select()
          .maybeSingle();

        if (error) throw error;

        // Send Credentials
        await notificationService.sendMultiChannel({
          schoolId: req.user!.school_id,
          channels: ['email', 'whatsapp'],
          type: 'credentials',
          title: 'Your Kautix Teacher Portal Credentials',
          message: `Welcome ${firstName}! Your Teacher account for Kautix is ready.\n\nLogin URL: https://kautix.in/login\nEmail/ID: ${teacherEmail}\nPass: ${teacherPassword}`,
          phone: phone,
          emailAddress: teacherEmail,
        });

        results.push({ success: true, employeeId: teacher.employee_id, teacher });
      } catch (err: any) {
        results.push({ success: false, error: err.message, raw: teacherData });
      }
    }

    return res.status(201).json({ message: 'Bulk import complete', results });
  } catch (error: any) {
    console.error('Bulk create teacher error:', error);
    return res.status(500).json({ error: 'Failed to bulk create teachers' });
  }
}

// Get leave requests
export async function getLeaveRequests(req: AuthenticatedRequest, res: Response) {
  try {
    const { status, teacher_id } = req.query;

    let query = supabaseAdmin
      .from('leave_requests')
      .select(`
        *,
        teacher:teachers(user:users(first_name, last_name, email)),
        approver:users!leave_requests_approved_by_fkey(first_name, last_name)
      `)
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status as string);
    if (teacher_id) query = query.eq('teacher_id', teacher_id as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
}

// Submit leave request
export async function submitLeaveRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const { teacherId, leaveType, startDate, endDate, reason } = req.body;

    const { data, error } = await supabaseAdmin
      .from('leave_requests')
      .insert({
        school_id: req.user!.school_id,
        teacher_id: teacherId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to submit leave request' });
  }
}

// Approve/reject leave
export async function processLeaveRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    const { data, error } = await supabaseAdmin
      .from('leave_requests')
      .update({
        status,
        approved_by: req.user!.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to process leave request' });
  }
}

// Update teacher
export async function updateTeacher(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      firstName, lastName, email, phone,
      department, designation, salary, specialization,
      employee_id, qualification, experienceYears, dateOfJoining,
      isClassTeacher, sectionId,
    } = req.body;

    // 1. Get teacher to find user_id
    const { data: teacher, error: fetchErr } = await supabaseAdmin
      .from('teachers')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !teacher) return res.status(404).json({ error: 'Teacher not found' });

    // 2. Update User table (name/email/phone)
    const userUpdates: Record<string, unknown> = {};
    if (firstName !== undefined && firstName !== '') userUpdates.first_name = firstName;
    if (lastName !== undefined && lastName !== '') userUpdates.last_name = lastName;
    if (email !== undefined && email !== '') userUpdates.email = email;
    if (phone !== undefined && phone !== '') userUpdates.phone = phone;

    if (Object.keys(userUpdates).length) {
      const { error: userErr } = await supabaseAdmin
        .from('users')
        .update(userUpdates)
        .eq('id', teacher.user_id)
        .eq('school_id', req.user!.school_id);
      if (userErr) return res.status(400).json({ error: userErr.message });
    }

    // 3. Map camelCase fields to snake_case DB columns
    const teacherUpdates: Record<string, unknown> = {};
    if (department !== undefined && department !== '') teacherUpdates.department = department;
    if (designation !== undefined && designation !== '') teacherUpdates.designation = designation;
    if (salary !== undefined && salary !== '') teacherUpdates.salary = Number(salary);
    if (specialization !== undefined && specialization !== '') teacherUpdates.specialization = specialization;
    if (employee_id !== undefined && employee_id !== '') teacherUpdates.employee_id = employee_id;
    if (qualification !== undefined && qualification !== '') teacherUpdates.qualification = qualification;
    if (experienceYears !== undefined && experienceYears !== '') teacherUpdates.experience_years = Number(experienceYears);
    if (dateOfJoining !== undefined && dateOfJoining !== '') teacherUpdates.date_of_joining = dateOfJoining;
    if (isClassTeacher !== undefined) teacherUpdates.is_class_teacher = isClassTeacher;

    let data: any = { id, message: 'Teacher profile updated' };

    if (Object.keys(teacherUpdates).length > 0) {
      const { data: updated, error } = await supabaseAdmin
        .from('teachers')
        .update(teacherUpdates)
        .eq('id', id)
        .eq('school_id', req.user!.school_id)
        .select()
        .maybeSingle();

      if (error) return res.status(400).json({ error: error.message });
      data = updated;
    }

    // 4. Handle Class Teacher Assignment
    if (isClassTeacher && sectionId) {
      await supabaseAdmin
        .from('sections')
        .update({ class_teacher_id: null })
        .eq('class_teacher_id', teacher.user_id);

      await supabaseAdmin
        .from('sections')
        .update({ class_teacher_id: teacher.user_id })
        .eq('id', sectionId);
    }

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update teacher' });
  }
}


// Process teacher payout
export async function processTeacherPayout(req: AuthenticatedRequest, res: Response) {
  try {
    const { teacherId, amount, accountNumber, ifsc, name } = req.body;

    const { paymentService } = require('../services/payment.service');
    const result = await paymentService.createPayout({
      teacherId,
      amount,
      accountNumber,
      ifsc,
      name
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Log the payout
    await supabaseAdmin.from('audit_logs').insert({
      school_id: req.user!.school_id,
      action: 'teacher_payout',
      entity_type: 'teacher',
      entity_id: teacherId,
      new_data: {
        amount,
        payout_id: result.payoutId,
        status: result.status
      }
    });

    return res.json({ success: true, payoutId: result.payoutId });
  } catch (error: any) {
    console.error('Payout controller error:', error);
    return res.status(500).json({ error: 'Failed to process payout' });
  }
}

// Get sections allocated to the current teacher (for frontend pickers)
export async function getTeacherSections(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const schoolId = req.user!.school_id;

    // 1. Get sections where this teacher is class teacher
    const { data: classTeacherSections } = await supabaseAdmin
      .from('sections')
      .select('id, name, class_id, class:classes(id, name, grade)')
      .eq('class_teacher_id', userId)
      .eq('school_id', schoolId);

    // 2. Get sections from timetable slots (subject teacher)
    const { data: timetableSlots } = await supabaseAdmin
      .from('timetable_slots')
      .select('section_id, subject_id, section:sections(id, name, class_id, class:classes(id, name, grade))')
      .eq('teacher_id', userId)
      .eq('school_id', schoolId);

    // 3. Merge into unique sections map
    const sectionsMap = new Map<string, any>();

    if (classTeacherSections) {
      classTeacherSections.forEach((s: any) => {
        if (!s.id) return;
        sectionsMap.set(s.id, {
          id: s.id,
          name: s.name,
          classId: s.class_id,
          className: s.class?.name || '',
          classGrade: s.class?.grade,
          subjectIds: new Set<string>(),
          isClassTeacher: true,
        });
      });
    }

    if (timetableSlots) {
      timetableSlots.forEach((slot: any) => {
        const secId = slot.section_id;
        if (!secId) return;
        if (!sectionsMap.has(secId)) {
          sectionsMap.set(secId, {
            id: secId,
            name: slot.section?.name,
            classId: slot.section?.class_id,
            className: slot.section?.class?.name || '',
            classGrade: slot.section?.class?.grade,
            subjectIds: new Set<string>(),
            isClassTeacher: false,
          });
        }
        if (slot.subject_id) {
          sectionsMap.get(secId)!.subjectIds.add(slot.subject_id);
        }
      });
    }

    // 4. Collect all unique subject IDs to fetch names
    const allSubjectIds = new Set<string>();
    sectionsMap.forEach(s => s.subjectIds.forEach((id: string) => allSubjectIds.add(id)));

    let subjectMap = new Map<string, any>();
    if (allSubjectIds.size > 0) {
      const { data: subjects } = await supabaseAdmin
        .from('subjects')
        .select('id, name, code')
        .in('id', Array.from(allSubjectIds));
      if (subjects) {
        subjects.forEach(sub => subjectMap.set(sub.id, sub));
      }
    }

    // 5. Build response — group by class for easy frontend consumption
    const classesMap = new Map<string, any>();
    sectionsMap.forEach(sec => {
      if (!classesMap.has(sec.classId)) {
        classesMap.set(sec.classId, {
          id: sec.classId,
          name: sec.className,
          grade: sec.classGrade,
          sections: [],
        });
      }
      classesMap.get(sec.classId)!.sections.push({
        id: sec.id,
        name: sec.name,
        isClassTeacher: sec.isClassTeacher || false,
        subjects: Array.from(sec.subjectIds).map((sid: any) => subjectMap.get(sid)).filter(Boolean),
      });
    });

    const classes = Array.from(classesMap.values()).sort((a, b) => (a.grade || 0) - (b.grade || 0));

    return res.json(classes);
  } catch (error: any) {
    console.error('getTeacherSections error:', error);
    return res.status(500).json({ error: 'Failed to fetch teacher sections' });
  }
}

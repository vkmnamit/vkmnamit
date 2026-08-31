import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../config/supabase';
import { notificationService } from '../services/notification.service';

// ==========================================
// LECTURE PLANNER
// ==========================================

export async function createLecturePlan(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const {
      academicYearId, classId, sectionId, subjectId, teacherId,
      title, chapter, topic, description, date, startTime, endTime,
      room, meetingLink, resources, homework, priority, recurring,
      chapterStartDate, chapterEndDate
    } = req.body;

    let finalAcademicYearId = academicYearId;
    if (!finalAcademicYearId) {
      const { data: activeYear } = await supabaseAdmin
        .from('academic_years')
        .select('id')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .limit(1)
        .single();
      if (activeYear) finalAcademicYearId = activeYear.id;
    }

    // Check if recurring
    if (recurring && recurring.type !== 'none') {
      // Create multiple instances
      const lectures: any[] = [];
      let currentDate = new Date(date);
      const endDate = new Date(recurring.endDate);

      while (currentDate <= endDate) {
        lectures.push({
          school_id: schoolId,
          academic_year_id: finalAcademicYearId,
          class_id: classId,
          section_id: sectionId,
          subject_id: subjectId,
          teacher_id: teacherId || req.user!.id,
          title, chapter, topic, description,
          date: currentDate.toISOString().split('T')[0],
          start_time: startTime,
          end_time: endTime,
          room, meeting_link: meetingLink,
          resources, homework, priority,
          status: 'scheduled',
          chapter_start_date: chapterStartDate || null,
          chapter_end_date: chapterEndDate || null
        });

        // Increment date based on recurring type
        if (recurring.type === 'daily') {
          currentDate.setDate(currentDate.getDate() + 1);
        } else if (recurring.type === 'weekly') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (recurring.type === 'monthly') {
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }

      const { data, error } = await supabaseAdmin.from('lecture_plans' as any).insert(lectures).select();
      if (error) return res.status(400).json({ error: error.message });

      await notifyLectureParticipants(schoolId, classId, sectionId, teacherId || req.user!.id, title, date, startTime, endTime, data?.[0]?.id);

      return res.status(201).json({ message: `Created ${lectures.length} recurring lectures`, data });
    }

    // Single lecture
    const { data, error } = await supabaseAdmin
      .from('lecture_plans' as any)
      .insert({
        school_id: schoolId,
        academic_year_id: finalAcademicYearId,
        class_id: classId,
        section_id: sectionId,
        subject_id: subjectId,
        teacher_id: teacherId || req.user!.id,
        title, chapter, topic, description,
        date, start_time: startTime, end_time: endTime,
        room, meeting_link: meetingLink,
        resources, homework, priority,
        chapter_start_date: chapterStartDate || null,
        chapter_end_date: chapterEndDate || null
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    await notifyLectureParticipants(schoolId, classId, sectionId, teacherId || req.user!.id, title, date, startTime, endTime, data.id);

    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create lecture plan' });
  }
}

async function notifyLectureParticipants(schoolId: string, classId: string, sectionId: string, teacherId: string, title: string, date: string, startTime: string, endTime: string, sourceId: string) {
  try {
    // Notify Teacher
    if (teacherId) {
      await notificationService.createInAppNotification({
        schoolId, userId: teacherId,
        type: 'lecture_assigned',
        title: `New Lecture Assigned: ${title}`,
        message: `You have been assigned to teach ${title} on ${date} from ${startTime} to ${endTime}.`,
        sourceType: 'lecture', sourceId
      });
    }

    // Notify students
    if (classId && sectionId) {
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id, user_id, user:users(id)')
        .eq('class_id', classId)
        .eq('section_id', sectionId);

      if (students && students.length > 0) {
        for (const student of students) {
          if ((student as any).user?.id) {
            await notificationService.createInAppNotification({
              schoolId,
              userId: (student as any).user.id,
              type: 'lecture_scheduled',
              title: `New Lecture Scheduled: ${title}`,
              message: `A new lecture has been scheduled on ${date} from ${startTime} to ${endTime}.`,
              sourceType: 'lecture',
              sourceId
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to notify lecture participants:', error);
  }
}

export async function getLecturePlans(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { classId, sectionId, subjectId, teacherId, startDate, endDate } = req.query;

    let query = supabaseAdmin
      .from('lecture_plans' as any)
      .select(`
        *,
        class:classes(name),
        section:sections(name),
        subject:subjects(name),
        teacher:users!teacher_id(first_name, last_name)
      `)
      .eq('school_id', schoolId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (classId) query = query.eq('class_id', classId as string);
    if (sectionId) query = query.eq('section_id', sectionId as string);
    if (subjectId) query = query.eq('subject_id', subjectId as string);
    if (teacherId) query = query.eq('teacher_id', teacherId as string);
    if (startDate) query = query.gte('date', startDate as string);
    if (endDate) query = query.lte('date', endDate as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch lecture plans' });
  }
}

export async function updateLecturePlan(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const updates = req.body; // status, topic_covered, remarks, etc.

    // Map camelCase to snake_case if needed
    const payload: any = { ...updates };
    if (updates.startTime) { payload.start_time = updates.startTime; delete payload.startTime; }
    if (updates.endTime) { payload.end_time = updates.endTime; delete payload.endTime; }
    if (updates.meetingLink) { payload.meeting_link = updates.meetingLink; delete payload.meetingLink; }

    const { data, error } = await supabaseAdmin
      .from('lecture_plans' as any)
      .update(payload)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update lecture' });
  }
}

// ==========================================
// ASSESSMENT PLANNER
// ==========================================

export async function createAssessment(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const {
      academicYearId, classId, sectionId, subjectId, teacherId,
      type, title, description, totalMarks, passingMarks, weightage,
      assignedDate, dueDate, evalDate, resultDate, status, instructions, rubrics, attachments
    } = req.body;

    const { data, error } = await supabaseAdmin
      .from('academic_assessments' as any)
      .insert({
        school_id: schoolId,
        academic_year_id: academicYearId,
        class_id: classId,
        section_id: sectionId,
        subject_id: subjectId,
        teacher_id: teacherId || req.user!.id,
        type, title, description,
        total_marks: totalMarks, passing_marks: passingMarks, weightage,
        assigned_date: assignedDate, due_date: dueDate,
        eval_date: evalDate, result_date: resultDate,
        status: status || 'draft',
        instructions, rubrics,
        attachments: attachments || null
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create assessment' });
  }
}

export async function getAssessments(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { classId, sectionId, subjectId, teacherId, type } = req.query;

    let query = supabaseAdmin
      .from('academic_assessments' as any)
      .select(`
        *,
        class:classes(name),
        section:sections(name),
        subject:subjects(name),
        teacher:users!teacher_id(first_name, last_name)
      `)
      .eq('school_id', schoolId)
      .order('due_date', { ascending: true });

    if (classId) query = query.eq('class_id', classId as string);
    if (sectionId) query = query.eq('section_id', sectionId as string);
    if (subjectId) query = query.eq('subject_id', subjectId as string);
    if (teacherId) query = query.eq('teacher_id', teacherId as string);
    if (type) query = query.eq('type', type as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch assessments' });
  }
}

export async function updateAssessment(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Convert camelCase to snake_case
    const payload: any = { ...updates };
    const mappings: Record<string, string> = {
      totalMarks: 'total_marks', passingMarks: 'passing_marks',
      assignedDate: 'assigned_date', dueDate: 'due_date',
      evalDate: 'eval_date', resultDate: 'result_date'
    };
    for (const [camel, snake] of Object.entries(mappings)) {
      if (payload[camel] !== undefined) {
        payload[snake] = payload[camel];
        delete payload[camel];
      }
    }

    const { data, error } = await supabaseAdmin
      .from('academic_assessments' as any)
      .update(payload)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update assessment' });
  }
}

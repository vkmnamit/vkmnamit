import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { notificationService } from '../services/notification.service';
import { getUserScope } from '../utils/userScope';
import { calculatePercentage } from '../utils/percentage';

// ── LIVE-DB SCHEMA TOLERANCE ────────────────────────────────────────────────
// Some deployments are missing optional columns on `exams` (e.g.
// `academic_year_id`, `invigilator_id`). PostgREST fails the ENTIRE query when
// a join references a missing column — which made the whole exams page appear
// empty. Detect which columns exist once per process so joins/writes only
// reference columns that are actually present.
let examsColumnsCache: string[] | null = null;

async function getExamsColumns(): Promise<string[]> {
  if (examsColumnsCache) return examsColumnsCache;
  const present: string[] = [];
  for (const c of ['academic_year_id', 'invigilator_id', 'updated_at']) {
    const { error } = await supabaseAdmin.from('exams').select(c).limit(1);
    if (!error) present.push(c);
  }
  examsColumnsCache = present;
  return present;
}

// Create exam
export async function createExam(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, examTypeId, classId, sectionId, subjectId, date, startTime, endTime, totalMarks, passingMarks, room, instructions, academicYearId } = req.body;

    if (req.user!.role === 'teacher') {
      const scope = await getUserScope(req.user as any);
      if (sectionId) {
        if (!scope?.sectionIds.includes(sectionId)) {
          return res.status(403).json({ error: 'You can only create exams for your assigned sections.' });
        }
      } else {
        if (!scope?.classIds.includes(classId)) {
          return res.status(403).json({ error: 'You can only create exams for your assigned classes.' });
        }
      }
    }

    const examsCols = await getExamsColumns();

    const insertPayload: Record<string, any> = {
      school_id: req.user!.school_id,
      name,
      exam_type_id: examTypeId,
      class_id: classId,
      section_id: sectionId || null,
      subject_id: subjectId,
      date,
      start_time: startTime || null,
      end_time: endTime || null,
      total_marks: totalMarks,
      passing_marks: passingMarks || totalMarks * 0.33,
      room,
      instructions: instructions || null,
      status: 'scheduled',
      created_by: req.user!.id
    };
    // Only reference optional columns that actually exist on the live DB.
    if (examsCols.includes('academic_year_id')) insertPayload.academic_year_id = academicYearId;

    const { data: exam, error } = await supabaseAdmin
      .from('exams')
      .insert(insertPayload)
      .select(`*, class:classes(name), subject:subjects(name)`)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Notify target section(s)
    const sectionIds: string[] = [];
    if (sectionId) {
      sectionIds.push(sectionId);
    } else {
      const { data: sections } = await supabaseAdmin
        .from('sections')
        .select('id')
        .eq('class_id', classId);
      if (sections) sectionIds.push(...sections.map(s => s.id));
    }

    for (const secId of sectionIds) {
      notificationService.notifySection({
        schoolId: req.user!.school_id,
        sectionId: secId,
        type: 'exam',
        title: `📅 Exam Scheduled: ${name}`,
        message: `A new exam "${name}" has been scheduled for ${exam.subject?.name || 'Subject'} on ${date} at ${startTime || 'TBA'}. Venue: ${room || 'Main Hall'}.`,
        htmlContent: `
          <h3>📅 New Exam Scheduled</h3>
          <p><strong>Exam Name:</strong> ${name}</p>
          <p><strong>Subject:</strong> ${exam.subject?.name || 'Subject'}</p>
          <p><strong>Date:</strong> ${date || 'TBA'}</p>
          <p><strong>Time:</strong> ${startTime || 'TBA'}${endTime ? ` - ${endTime}` : ''}</p>
          <p><strong>Total Marks:</strong> ${totalMarks}</p>
          <p><strong>Passing Marks:</strong> ${passingMarks}</p>
          <p><strong>Venue:</strong> ${room || 'Main Hall'}</p>
        `,
        sourceId: exam.id,
      }).catch(err => console.error('Failed to send exam notification:', secId, err));
    }

    return res.status(201).json(exam);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create exam' });
  }
}

// Update exam
export async function updateExam(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, examTypeId, classId, sectionId, subjectId, date, startTime, endTime, totalMarks, passingMarks, room, instructions, status } = req.body;

    const { data: existingExam } = await supabaseAdmin
      .from('exams')
      .select('class_id, created_by')
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .single();

    if (!existingExam) return res.status(404).json({ error: 'Exam not found' });

    if (req.user!.role === 'teacher') {
      const scope = await getUserScope(req.user as any);
      const isCreator = existingExam.created_by === req.user!.id;
      const isClassTeacher = scope?.classIds.includes(existingExam.class_id);
      
      if (!isCreator && !isClassTeacher) {
        return res.status(403).json({ error: 'You do not have permission to edit this exam' });
      }
    }

    const updatePayload: Record<string, any> = {};
    if (name !== undefined) updatePayload.name = name;
    if (examTypeId !== undefined) updatePayload.exam_type_id = examTypeId;
    if (classId !== undefined) updatePayload.class_id = classId;
    if (sectionId !== undefined) updatePayload.section_id = sectionId || null;
    if (subjectId !== undefined) updatePayload.subject_id = subjectId;
    if (date !== undefined) updatePayload.date = date || null;
    if (startTime !== undefined) updatePayload.start_time = startTime || null;
    if (endTime !== undefined) updatePayload.end_time = endTime || null;
    if (totalMarks !== undefined) updatePayload.total_marks = totalMarks;
    if (passingMarks !== undefined) updatePayload.passing_marks = passingMarks;
    if (room !== undefined) updatePayload.room = room || null;
    if (instructions !== undefined) updatePayload.instructions = instructions || null;
    if (status !== undefined) updatePayload.status = status;

    const { data, error } = await supabaseAdmin
      .from('exams')
      .update(updatePayload)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select(`*, class:classes(name), subject:subjects(name)`)
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update exam' });
  }
}

// Delete exam
export async function deleteExam(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    const { data: existingExam } = await supabaseAdmin
      .from('exams')
      .select('class_id, created_by')
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .single();

    if (!existingExam) return res.status(404).json({ error: 'Exam not found' });

    if (req.user!.role === 'teacher') {
      const scope = await getUserScope(req.user as any);
      const isCreator = existingExam.created_by === req.user!.id;
      const isClassTeacher = scope?.classIds.includes(existingExam.class_id);
      
      if (!isCreator && !isClassTeacher) {
        return res.status(403).json({ error: 'You do not have permission to delete this exam' });
      }
    }

    const { error } = await supabaseAdmin
      .from('exams')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Exam deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete exam' });
  }
}

// Get exam types — auto-seed defaults if none exist
export async function getExamTypes(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;

    let { data, error } = await supabaseAdmin
      .from('exam_types')
      .select('*')
      .eq('school_id', schoolId);

    if (error) return res.status(400).json({ error: error.message });

    if (!data || data.length === 0) {
      const defaults = [
        { school_id: schoolId, name: 'Mid-Term', weightage: 30 },
        { school_id: schoolId, name: 'Final Exam', weightage: 50 },
        { school_id: schoolId, name: 'Unit Test', weightage: 10 },
        { school_id: schoolId, name: 'Mock Test', weightage: 20 },
      ];
      const { data: seeded, error: seedErr } = await supabaseAdmin
        .from('exam_types')
        .insert(defaults)
        .select();
      if (seedErr) return res.status(400).json({ error: seedErr.message });
      data = seeded;
    }

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch exam types' });
  }
}

// Get exams
export async function getExams(req: AuthenticatedRequest, res: Response) {
  try {
    const { class_id, subject_id, status, dashboard, classId, sectionId, examTypeId } = req.query;

    if (dashboard === 'true') {
      const scope = await getUserScope(req.user!);
      const examsCols = await getExamsColumns();

      // Fallback academic-year label (covers deployments missing academic_year_id)
      let currentYearName: string | null = null;
      {
        const { data: yr } = await supabaseAdmin
          .from('academic_years')
          .select('name')
          .eq('school_id', req.user!.school_id)
          .eq('is_current', true)
          .limit(1)
          .maybeSingle();
        currentYearName = (yr as any)?.name || null;
      }

      const academicJoin = examsCols.includes('academic_year_id') ? 'academic_year:academic_years(name),' : '';
      const invigilatorJoin = examsCols.includes('invigilator_id') ? 'invigilator:invigilator_id(first_name, last_name),' : '';

      const baseUpcomingSelect = `
        *,
        ${academicJoin}
        class:classes(name, grade),
        section:sections(name),
        ${invigilatorJoin}
        subject:subjects(name),
        exam_results(count)
      `;

      // 1. Get upcoming exams
      let upcomingQuery = supabaseAdmin
        .from('exams')
        .select(baseUpcomingSelect)
        .eq('school_id', req.user!.school_id)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(10);

      if (scope) {
        if (scope.classIds.length === 0) {
          if (req.user!.role === 'teacher') {
            upcomingQuery = upcomingQuery.eq('created_by', req.user!.id);
          } else {
            return res.json({ upcoming: [], results: [], toppers: [], stats: { completed: 0, pendingGrading: 0, avgPerformance: 0 } });
          }
        } else {
          if (req.user!.role === 'teacher') {
            upcomingQuery = upcomingQuery.or(`class_id.in.(${scope.classIds.join(',')}),created_by.eq.${req.user!.id}`);
          } else {
            upcomingQuery = upcomingQuery.in('class_id', scope.classIds);
            if (scope.sectionIds.length > 0) {
              upcomingQuery = upcomingQuery.or(`section_id.in.(${scope.sectionIds.join(',')}),section_id.is.null`);
            }
          }
        }
      } else {
        if (classId && classId !== 'all') upcomingQuery = upcomingQuery.eq('class_id', classId as string);
        if (sectionId && sectionId !== 'all') upcomingQuery = upcomingQuery.eq('section_id', sectionId as string);
        if (examTypeId && examTypeId !== 'all') upcomingQuery = upcomingQuery.eq('exam_type_id', examTypeId as string);
      }

      const { data: upcoming } = (await upcomingQuery) as { data: any[] };

      // 2. Get latest exams for the "past / results" tab — includes any past-dated
      //    exam (regardless of publish status) so completed records always show.
      const baseResultsSelect = `
        *,
        ${academicJoin}
        subject:subjects(name),
        class:classes(name),
        section:sections(name),
        exam_results(marks_obtained)
      `;
      let resultsQuery = supabaseAdmin
        .from('exams')
        .select(baseResultsSelect)
        .eq('school_id', req.user!.school_id)
        .order('date', { ascending: false })
        .limit(30);

      if (scope) {
        if (scope.classIds.length > 0) {
          if (req.user!.role === 'teacher') {
            resultsQuery = resultsQuery.or(`class_id.in.(${scope.classIds.join(',')}),created_by.eq.${req.user!.id}`);
          } else {
            resultsQuery = resultsQuery.in('class_id', scope.classIds);
            if (scope.sectionIds.length > 0) {
              resultsQuery = resultsQuery.or(`section_id.in.(${scope.sectionIds.join(',')}),section_id.is.null`);
            }
          }
        } else if (req.user!.role === 'teacher') {
          resultsQuery = resultsQuery.eq('created_by', req.user!.id);
        } else {
          resultsQuery = resultsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else {
        if (classId && classId !== 'all') resultsQuery = resultsQuery.eq('class_id', classId as string);
        if (sectionId && sectionId !== 'all') resultsQuery = resultsQuery.eq('section_id', sectionId as string);
        if (examTypeId && examTypeId !== 'all') resultsQuery = resultsQuery.eq('exam_type_id', examTypeId as string);
      }

      const { data: results } = (await resultsQuery) as { data: any[] };

      // NOTE: Topper computation removed completely — rankings/marks belong in
      // Results, not in the exam schedule view. The API still returns empty
      // topper arrays for backward compatibility with older clients.

      // 3. Stats
      const { count: completedCount } = await supabaseAdmin
        .from('exams')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', req.user!.school_id)
        .eq('status', 'completed');

      // Pending = past exams where results haven't been published
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { count: pendingCount } = await supabaseAdmin
        .from('exams')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', req.user!.school_id)
        .eq('status', 'scheduled')
        .lte('date', yesterday.toISOString().split('T')[0]);

      // Average performance across completed exams (from the results already fetched)
      let avgPerformance = 0;
      let allObt = 0;
      let allMax = 0;
      for (const r of results || []) {
        const validResults = ((r as any).exam_results || []).filter((er: any) => er.marks_obtained >= 0);
        allObt += validResults.reduce((sum: number, er: any) => sum + Number(er.marks_obtained), 0);
        allMax += validResults.length * Number(r.total_marks);
      }
      if (allMax > 0) avgPerformance = calculatePercentage(allObt, allMax);

      const formatTime = (t: string) => {
        if (!t) return '';
        const [h, m] = t.split(':');
        const d = new Date();
        d.setHours(parseInt(h, 10), parseInt(m, 10));
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      };

      const todayStr = new Date().toISOString().split('T')[0];
      // Past tab = completed exams OR any exam whose date has already passed
      const pastFiltered = (results || []).filter(
        (r: any) => r.subject && r.class && (r.status === 'completed' || (r.date && r.date < todayStr))
      );

      return res.json({
        upcoming: upcoming?.filter(e => (e as any).subject && (e as any).class).map(e => {
          const timeStr = e.start_time ? `${formatTime(e.start_time)}${e.end_time ? ` - ${formatTime(e.end_time)}` : ''}` : 'TBA';
          return {
            ...e,
            subject: (e as any).subject?.name || 'Unknown',
            class: (e as any).class?.name || 'Unknown',
            section: (e as any).section?.name || null,
            academicYear: (e as any).academic_year?.name || currentYearName,
            invigilator: (e as any).invigilator
              ? `${(e as any).invigilator.first_name || ''} ${(e as any).invigilator.last_name || ''}`.trim()
              : null,
            isInvigilator: examsCols.includes('invigilator_id') && e.invigilator_id === req.user!.id,
            studentsCount: (e as any).exam_results?.[0]?.count ?? null,
            date: new Date(e.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            time: timeStr,
            totalMarks: e.total_marks
          };
        }) || [],
        results: pastFiltered.slice(0, 10).map(r => {
          const validResults = ((r as any).exam_results || []).filter((er: any) => er.marks_obtained >= 0);
          const totalObtained = validResults.reduce((sum: number, er: any) => sum + Number(er.marks_obtained), 0);
          const avgScore = calculatePercentage(totalObtained, validResults.length * Number(r.total_marks));
          return {
            id: r.id,
            name: r.name,
            subject: (r as any).subject?.name || 'Unknown',
            class: (r as any).class?.name || 'Unknown',
            section: (r as any).section?.name || null,
            academicYear: (r as any).academic_year?.name || currentYearName,
            avgScore,
            totalStudents: ((r as any).exam_results || []).length,
            date: new Date(r.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          };
        }) || [],
        subjectToppers: [],
        overallToppers: [],
        stats: {
          completed: completedCount || 0,
          pendingGrading: pendingCount || 0,
          avgPerformance
        }
      });
    }

    let query = supabaseAdmin
      .from('exams')
      .select(`
        *,
        class:classes(name, grade),
        subject:subjects(name, code)
      `)
      .eq('school_id', req.user!.school_id)
      .order('date', { ascending: false });

    const scope = await getUserScope(req.user as any);
    if (req.user!.role !== 'admin' && scope) {
      if (scope.classIds.length > 0) {
        if (req.user!.role === 'teacher') {
          query = query.or(`class_id.in.(${scope.classIds.join(',')}),created_by.eq.${req.user!.id}`);
        } else {
          query = query.in('class_id', scope.classIds);
          if (scope.sectionIds.length > 0) {
            query = query.or(`section_id.in.(${scope.sectionIds.join(',')}),section_id.is.null`);
          }
        }
      } else if (req.user!.role === 'teacher') {
        query = query.eq('created_by', req.user!.id);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }

    if (class_id) query = query.eq('class_id', class_id as string);
    if (subject_id) query = query.eq('subject_id', subject_id as string);
    if (status) query = query.eq('status', status as string);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Manually fetch exam_types to avoid schema relationship cache error
    const { data: examTypes } = await supabaseAdmin
      .from('exam_types')
      .select('id, name, weightage')
      .eq('school_id', req.user!.school_id);

    const typeMap = new Map((examTypes || []).map(t => [t.id, t]));
    const mappedData = data?.map(d => ({
      ...d,
      exam_type: typeMap.get(d.exam_type_id) || null
    }));

    return res.json(mappedData);
  } catch (error: any) {
    console.error('Fetch exams error:', error);
    return res.status(500).json({ error: 'Failed to fetch exams' });
  }
}

// Submit exam results (bulk)
export async function submitResults(req: AuthenticatedRequest, res: Response) {
    try {
    const { examId, results } = req.body;
    // results: [{ studentId, marksObtained, isAbsent, remarks }]

    const { data: exam } = await supabaseAdmin
      .from('exams')
      .select('name, total_marks, passing_marks, status, date, class_id, section_id, created_by')
      .eq('id', examId)
      .single();

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Teachers may only enter marks for exams they create or that belong to
    // their assigned sections/classes.
    if (req.user!.role === 'teacher') {
      const scope = await getUserScope(req.user as any);
      const isCreator = exam.created_by === req.user!.id;
      const isClassTeacher = scope?.classIds?.includes(exam.class_id) || false;
      const isSectionTeacher = exam.section_id && scope?.sectionIds?.includes(exam.section_id);

      if (!isCreator && !isClassTeacher && !isSectionTeacher) {
        return res.status(403).json({ error: 'You do not have permission to enter marks for this exam' });
      }
    }

    // Block marks entry if exam date hasn't passed yet
    // Compare as date strings to avoid UTC vs IST timezone mismatch
    if (exam.date) {
      const examDateStr = exam.date.substring(0, 10); // 'YYYY-MM-DD'
      const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' in local time
      if (examDateStr >= todayStr) {
        return res.status(400).json({ error: `Marks entry is locked until after the exam date (${exam.date}). The exam has not happened yet.` });
      }
    }


    const records = results.map((r: any) => {
      const percentage = (r.marksObtained / exam.total_marks) * 100;
      let grade = 'F';
      if (percentage >= 90) grade = 'A+';
      else if (percentage >= 80) grade = 'A';
      else if (percentage >= 70) grade = 'B+';
      else if (percentage >= 60) grade = 'B';
      else if (percentage >= 50) grade = 'C';
      else if (percentage >= 40) grade = 'D';
      else if (percentage >= 33) grade = 'E';

      return {
        school_id: req.user!.school_id,
        exam_id: examId,
        student_id: r.studentId,
        grade,
        marks_obtained: r.isAbsent ? -1 : r.marksObtained
      };
    });

    // Only save students who had marks actually entered (skip those with 0 if they have no existing result)
    const { data, error } = await supabaseAdmin
      .from('exam_results')
      .upsert(records, { onConflict: 'exam_id,student_id', ignoreDuplicates: false })
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // Send notifications for absent students
    const absentStudents = results.filter((r: any) => r.isAbsent);
    await Promise.all(absentStudents.map(async (absent: any) => {
      const { data: parentLink } = await supabaseAdmin
        .from('parent_students')
        .select(`parent:parents(user:users(id, email, phone))`)
        .eq('student_id', absent.studentId)
        .limit(1).single();

      const { data: student } = await supabaseAdmin
        .from('students')
        .select('user:users(first_name, last_name)')
        .eq('id', absent.studentId).single();

      const pUser = (parentLink as any)?.parent?.user;
      const sUser = (student as any)?.user;
      
      if (pUser && sUser) {
        await notificationService.sendExamAbsenceAlert({
          schoolId: req.user!.school_id,
          parentPhone: pUser.phone || '',
          parentEmail: pUser.email || '',
          parentUserId: pUser.id,
          studentName: `${sUser.first_name} ${sUser.last_name || ''}`.trim(),
          examName: exam.name,
        });
      }
    }));

    // Do not update exam status to 'completed' here. This is now effectively "Save Draft".
    // Publishing is handled separately.

    return res.json({ message: `Results saved for ${records.length} students`, results: data });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to submit results' });
  }
}


// Get results for an exam
export async function getExamResults(req: AuthenticatedRequest, res: Response) {
  try {
    const { examId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('exam_results')
      .select(`
        *,
        student:students(
          id, roll_number, admission_number,
          user:users(first_name, last_name)
        )
      `)
      .eq('exam_id', examId)
      .order('marks_obtained', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    // Add rank — competition ranking: equal marks share a rank, next ranks skip
    const ranked = (data || []).map((r: any) => ({ ...r, rank: null }));
    // Sort present students (marks >= 0) descending; absent (-1) get no rank
    const present = ranked.filter(r => r.marks_obtained >= 0);
    present.sort((a, b) => b.marks_obtained - a.marks_obtained);
    let currentRank = 0;
    let prevMarks: number | null = null;
    present.forEach((r, idx) => {
      if (r.marks_obtained !== prevMarks) currentRank = idx + 1;
      r.rank = currentRank;
      prevMarks = r.marks_obtained;
    });

    return res.json(ranked);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch results' });
  }
}

// Get student report card
export async function getReportCard(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;
    const { exam_type_id } = req.query;

    let query = supabaseAdmin
      .from('exam_results')
      .select(`
        *,
        exam:exams(
          *,
          subject:subjects(name, code)
        )
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (exam_type_id) {
      query = (query as any).eq('exam.exam_type_id', exam_type_id);
    }

    // Students & parents only see PUBLISHED results (exam status = 'completed').
    // Staff (admin/teacher) can view draft marks before publishing.
    const isStaffViewer = ['admin', 'superadmin', 'teacher'].includes(req.user!.role);
    if (!isStaffViewer) {
      query = (query as any).eq('exam.status', 'completed');
    }

    const { data: results, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Get student info
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('*, user:users(first_name, last_name), section:sections(name, class:classes(name))')
      .eq('id', studentId)
      .single();

    if (!results || results.length === 0) {
      return res.json({ student, subjects: [], overall: { percentage: 0, grade: 'N/A' }, results: [] });
    }

    // Group by subject
    const subjectMap: Record<string, any[]> = {};
    results.forEach((r: any) => {
      const subjectName = r.exam?.subject?.name || 'Unknown';
      if (!subjectMap[subjectName]) subjectMap[subjectName] = [];
      subjectMap[subjectName].push({
        examType: r.exam?.exam_type?.name,
        marksObtained: r.marks_obtained === -1 ? 0 : r.marks_obtained,
        isAbsent: r.marks_obtained === -1,
        totalMarks: r.exam?.total_marks,
        grade: r.grade,
        percentage: r.marks_obtained === -1 ? 0 : Math.round((r.marks_obtained / r.exam?.total_marks) * 10000) / 100,
      });
    });

    const subjects = Object.entries(subjectMap).map(([name, exams]) => {
      const totalObtained = exams.reduce((sum, e) => sum + e.marksObtained, 0);
      const totalMax = exams.reduce((sum, e) => sum + e.totalMarks, 0);
      const avg = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
      return {
        subject: name,
        exams,
        totalObtained,
        totalMax,
        percentage: Math.round(avg * 100) / 100,
        grade: avg >= 90 ? 'A+' : avg >= 80 ? 'A' : avg >= 70 ? 'B+' : avg >= 60 ? 'B' : avg >= 50 ? 'C' : avg >= 40 ? 'D' : 'F',
      };
    });

    const overallTotal = subjects.reduce((sum, s) => sum + s.totalObtained, 0);
    const overallMax = subjects.reduce((sum, s) => sum + s.totalMax, 0);
    const overallPercentage = overallMax > 0 ? Math.round((overallTotal / overallMax) * 10000) / 100 : 0;

    return res.json({
      student,
      subjects,
      overall: {
        totalObtained: overallTotal,
        totalMax: overallMax,
        percentage: overallPercentage,
        grade: overallPercentage >= 90 ? 'A+' : overallPercentage >= 80 ? 'A' : overallPercentage >= 70 ? 'B+' : overallPercentage >= 60 ? 'B' : overallPercentage >= 50 ? 'C' : overallPercentage >= 40 ? 'D' : 'F',
      },
      results
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to generate report card' });
  }
}

// Publish results & notify parents
export async function publishResults(req: AuthenticatedRequest, res: Response) {
  try {
    const { examId, sectionId } = req.body;

    const { data: results } = await supabaseAdmin
      .from('exam_results')
      .select(`
        *,
        student:students(
          id, user_id, section_id,
          user:users(first_name, last_name)
        ),
        exam:exams(*, subject:subjects(name))
      `)
    let filteredResults = results || [];
    if (sectionId) {
      filteredResults = filteredResults.filter((r: any) => (r.student as any)?.section_id === sectionId);
    }

    if (filteredResults.length === 0) {
      return res.status(404).json({ error: 'No results found' });
    }

    // Teachers may only publish results for exams they create or that belong
    // to their assigned sections/classes.
    if (req.user!.role === 'teacher') {
      const { data: exam } = await supabaseAdmin
        .from('exams')
        .select('created_by, class_id, section_id')
        .eq('id', examId)
        .single();

      const scope = await getUserScope(req.user as any);
      const isCreator = exam?.created_by === req.user!.id;
      const isClassTeacher = scope?.classIds?.includes(exam?.class_id) || false;
      const isSectionTeacher = exam?.section_id && scope?.sectionIds?.includes(exam?.section_id);

      if (!isCreator && !isClassTeacher && !isSectionTeacher) {
        return res.status(403).json({ error: 'You do not have permission to publish results for this exam' });
      }

      // Existing guard: must target only your own sections
      if (req.body.sectionId && !scope?.sectionIds.includes(req.body.sectionId)) {
        return res.status(403).json({ error: 'You do not have permission to publish this section' });
      }
    }

    let notified = 0;
    await Promise.all(filteredResults.map(async (result: any) => {
      try {
        const { data: parentLink } = await supabaseAdmin
          .from('parent_students')
          .select('parent:parents(user:users(id, email, phone))')
          .eq('student_id', result.student_id)
          .limit(1)
          .single();

        const pUser = (parentLink as any)?.parent?.user;
        const studentUser = (result as any).student?.user;
        const studentUserId = (result as any).student?.user_id;
        const exam = result.exam as any;

        if (pUser || studentUser) {
          await notificationService.sendExamResult({
            schoolId: req.user!.school_id,
            parentEmail: pUser?.email,
            parentPhone: pUser?.phone || '',
            parentUserId: pUser?.id,
            studentEmail: studentUser?.email,
            studentUserId: studentUserId,
            studentName: `${studentUser?.first_name || ''} ${studentUser?.last_name || ''}`,
            examName: `${exam?.exam_type?.name || ''} - ${exam?.subject?.name || ''}`,
            results: [{
              subject: exam?.subject?.name || '',
              marks: result.marks_obtained === -1 ? 'ABSENT' : result.marks_obtained,
              total: exam?.total_marks || 0,
              grade: result.marks_obtained === -1 ? '-' : (result.grade || ''),
            }] as any[],
            overallPercentage: result.marks_obtained === -1 ? 0 : Math.round(((result.marks_obtained || 0) / (exam?.total_marks || 1)) * 10000) / 100,
          });
          if (pUser) notified++;
        }

        if (studentUserId) {
          await notificationService.createInAppNotification({
            schoolId: req.user!.school_id,
            userId: studentUserId,
            type: 'exam_result',
            title: `Exam Results Published: ${(result.exam as any)?.exam_type?.name || ''} - ${(result.exam as any)?.subject?.name || ''}`,
            message: `Your marks for ${(result.exam as any)?.subject?.name || ''} have been published. ${result.marks_obtained === -1 ? 'You were marked ABSENT.' : `Marks: ${result.marks_obtained}/${(result.exam as any)?.total_marks || 0} (${result.grade || ''})`}`,
            sourceType: 'exam',
            sourceId: (result.exam as any)?.id
          }).catch(() => {});
        }
      } catch (innerError: any) {
        console.error(`Failed to notify parent for student ${result.student_id}:`, innerError.message || innerError);
      }
    }));

    // Update exam status to completed in database
    await supabaseAdmin
      .from('exams')
      .update({ status: 'completed' })
      .eq('id', examId);

    return res.json({ message: `Results published. ${notified} parents notified.` });
  } catch (error: any) {
    console.error('publishResults Error:', error);
    return res.status(500).json({ error: 'Failed to publish results' });
  }
}

// Student performance analytics — scores vs class avg vs topper
export async function getStudentAnalytics(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;
    const schoolId = req.user!.school_id;

    // 1. Get student info to find their section/class
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('id, section_id, section:sections(id, name, class_id, class:classes(name))')
      .eq('id', studentId)
      .single();

    if (!student) return res.status(404).json({ error: 'Student not found' });

    const sectionId = student.section_id;

    // Students & parents only see PUBLISHED results (exam status = 'completed').
    // Staff (admin/teacher) can view draft analytics before publishing.
    const isStaffViewer = ['admin', 'superadmin', 'teacher'].includes(req.user!.role);

    // 2. Get student's own exam results with subject info
    let myResultsQuery = supabaseAdmin
      .from('exam_results')
      .select(`
        *,
        exam:exams(id, total_marks, date, status, subject:subjects(name, code))
      `)
      .eq('student_id', studentId)
      .eq('school_id', schoolId);
    if (!isStaffViewer) {
      myResultsQuery = myResultsQuery.eq('exam.status', 'completed');
    }
    const { data: myResults } = await myResultsQuery;

    if (!myResults || myResults.length === 0) {
      return res.json({ subjects: [], toppers: [], overall: null, empty: true });
    }

    // 3. Get all results for same section for class avg + topper calculation
    const examIds = myResults
      .map((r: any) => r.exam?.id)
      .filter(Boolean);

    let sectionResultsQuery = supabaseAdmin
      .from('exam_results')
      .select(`
        student_id, marks_obtained,
        student:students(user:users(first_name, last_name)),
        exam:exams(id, total_marks, status, subject:subjects(name))
      `)
      .in('exam_id', examIds)
      .eq('school_id', schoolId)
      .gte('marks_obtained', 0);
    if (!isStaffViewer) {
      sectionResultsQuery = sectionResultsQuery.eq('exam.status', 'completed');
    }
    const { data: sectionResults } = await sectionResultsQuery;

    // 4. Build per-subject analytics
    const subjectMap: Record<string, {
      myMarks: number; myTotal: number;
      classMarks: number[]; topperMarks: number; topperName: string;
    }> = {};

    // Fill in my results
    for (const r of myResults as any[]) {
      if (r.marks_obtained === -1 || !r.exam) continue;
      const subjectName = r.exam.subject?.name || 'Unknown';
      if (!subjectMap[subjectName]) {
        subjectMap[subjectName] = { myMarks: 0, myTotal: 0, classMarks: [], topperMarks: 0, topperName: '' };
      }
      subjectMap[subjectName].myMarks += r.marks_obtained;
      subjectMap[subjectName].myTotal += r.exam.total_marks;
    }

    // Fill class results for same exams
    for (const r of (sectionResults || []) as any[]) {
      if (!r.exam) continue;
      const subjectName = r.exam.subject?.name || 'Unknown';
      if (!subjectMap[subjectName]) continue;
      subjectMap[subjectName].classMarks.push(
        Math.round((r.marks_obtained / r.exam.total_marks) * 100)
      );
      const pct = Math.round((r.marks_obtained / r.exam.total_marks) * 100);
      if (pct > subjectMap[subjectName].topperMarks) {
        subjectMap[subjectName].topperMarks = pct;
        const u = (r.student as any)?.user;
        subjectMap[subjectName].topperName = u ? `${u.first_name} ${u.last_name}` : 'Student';
      }
    }

    const subjects = Object.entries(subjectMap).map(([name, data]) => {
      const myPct = data.myTotal > 0 ? Math.round((data.myMarks / data.myTotal) * 100) : 0;
      const classAvg = data.classMarks.length > 0
        ? Math.round(data.classMarks.reduce((a, b) => a + b, 0) / data.classMarks.length)
        : 0;
      return {
        subject: name,
        myPercentage: myPct,
        classAverage: classAvg,
        topperPercentage: data.topperMarks,
        topperName: data.topperName,
        grade: myPct >= 90 ? 'A+' : myPct >= 80 ? 'A' : myPct >= 70 ? 'B+' : myPct >= 60 ? 'B' : myPct >= 50 ? 'C' : myPct >= 40 ? 'D' : 'F',
      };
    });

    // 5. Section toppers overall (top 5 students by total marks)
    const studentTotals: Record<string, { name: string; total: number; max: number }> = {};
    for (const r of (sectionResults || []) as any[]) {
      if (!r.exam) continue;
      const sid = r.student_id;
      if (!studentTotals[sid]) {
        const u = (r.student as any)?.user;
        studentTotals[sid] = { name: u ? `${u.first_name} ${u.last_name}` : 'Student', total: 0, max: 0 };
      }
      studentTotals[sid].total += r.marks_obtained;
      studentTotals[sid].max += r.exam.total_marks;
    }

    const toppers = Object.entries(studentTotals)
      .map(([sid, d]) => ({
        studentId: sid,
        name: d.name,
        percentage: d.max > 0 ? Math.round((d.total / d.max) * 100) : 0,
        isCurrentStudent: sid === studentId,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5);

    // 6. Overall summary
    const totalObtained = subjects.reduce((s, x) => s + (x.myPercentage * x.myPercentage), 0);
    const overallPct = subjects.length > 0
      ? Math.round(subjects.reduce((s, x) => s + x.myPercentage, 0) / subjects.length)
      : 0;

    return res.json({
      subjects,
      toppers,
      overall: {
        percentage: overallPct,
        grade: overallPct >= 90 ? 'A+' : overallPct >= 80 ? 'A' : overallPct >= 70 ? 'B+' : overallPct >= 60 ? 'B' : overallPct >= 50 ? 'C' : overallPct >= 40 ? 'D' : 'F',
      },
      sectionName: (student.section as any)?.name,
      className: (student.section as any)?.class?.name,
    });
  } catch (error: any) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Failed to generate analytics' });
  }
}

export async function getStudentsForMarksEntry(req: AuthenticatedRequest, res: Response) {
  try {
    const { examId, sectionId } = req.query;
    const schoolId = req.user!.school_id;

    if (!examId || !sectionId) {
      return res.status(400).json({ error: 'examId and sectionId are required' });
    }

    if (req.user!.role === 'teacher') {
      const scope = await getUserScope(req.user as any);
      if (!scope?.sectionIds.includes(sectionId as string)) {
        return res.status(403).json({ error: 'You are not authorized to enter marks for this section.' });
      }
    }

    // 1. Get all students in the section
    const { data: students } = await supabaseAdmin
      .from('students')
      .select(`
        id, roll_number, admission_number,
        user:users(first_name, last_name)
      `)
      .eq('section_id', sectionId)
      .eq('school_id', schoolId)
      .order('roll_number', { ascending: true });

    // 2. Get existing marks for this exam/section
    const { data: marks, error: marksError } = await supabaseAdmin
      .from('exam_results')
      .select('student_id, marks_obtained')
      .eq('exam_id', examId);
    
    if (marksError) console.error("Error fetching marks:", marksError);

    const formattedStudents = students?.map(s => {
      const existingMark = marks?.find(m => m.student_id === s.id);
      return {
        id: s.id,
        rollNumber: s.roll_number,
        name: `${(s.user as any)?.first_name} ${(s.user as any)?.last_name || ''}`.trim(),
        marksObtained: existingMark ? existingMark.marks_obtained : null,
        isAbsent: existingMark ? existingMark.marks_obtained === -1 : false
      };
    }) || [];

    return res.json({ students: formattedStudents });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch students for marks entry' });
  }
}

export async function bulkSaveMarks(req: AuthenticatedRequest, res: Response) {
  try {
    const { examId, marks } = req.body;
    const schoolId = req.user!.school_id;

    if (!examId || !marks || !Array.isArray(marks)) {
      return res.status(400).json({ error: 'examId and marks array are required' });
    }

    // Upsert into exam_results
    const upsertPayload = marks.map((m: any) => ({
      exam_id: examId,
      student_id: m.studentId,
      marks_obtained: m.isAbsent ? -1 : (m.marksObtained || 0)
    }));

    const { error } = await supabaseAdmin
      .from('exam_results')
      .upsert(upsertPayload, { onConflict: 'exam_id,student_id' });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Marks saved successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save marks' });
  }
}

export async function publishMarks(req: AuthenticatedRequest, res: Response) {
  try {
    const { examId, sectionId } = req.body;
    const schoolId = req.user!.school_id;

    if (!examId || !sectionId) {
      return res.status(400).json({ error: 'examId and sectionId are required' });
    }

    // 1. Get exam info
    const { data: exam } = await supabaseAdmin
      .from('exams')
      .select('name, subject:subjects(name)')
      .eq('id', examId)
      .single();

    // 2. Notify section
    notificationService.notifySection({
      schoolId: schoolId,
      sectionId: sectionId,
      type: 'exam',
      title: `📊 Marks Published: ${exam?.name}`,
      message: `The marks for ${exam?.name} (${(exam?.subject as any)?.name}) have been published. Please check your dashboard.`,
      htmlContent: `
        <h3>📊 Marks Published</h3>
        <p>The results for the recent exam have been finalized and are now available.</p>
        <p><strong>Exam Name:</strong> ${exam?.name}</p>
        <p><strong>Subject:</strong> ${(exam?.subject as any)?.name}</p>
        <p>Log in to your dashboard to view the detailed performance report.</p>
      `,
      sourceId: examId,
    }).catch(err => console.error('Failed to send marks published notification:', err));

    return res.json({ message: 'Marks published successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to publish marks' });
  }
}

// Notify teachers/admins about exams pending marks entry
export async function notifyPendingMarks(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;

    // Find exams that have passed but are still 'scheduled' (marks not entered)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: pendingExams } = await supabaseAdmin
      .from('exams')
      .select(`
        id, name, date,
        subject:subjects(name),
        class:classes(name),
        section:sections(name)
      `)
      .eq('school_id', schoolId)
      .eq('status', 'scheduled')
      .lte('date', yesterday.toISOString().split('T')[0]);

    if (!pendingExams || pendingExams.length === 0) {
      return res.json({ message: 'No pending exams found', count: 0 });
    }

    // Get all admins for this school
    const { data: adminUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('school_id', schoolId)
      .in('role', ['admin', 'super_admin']);

    // Get all teachers for this school
    const { data: teacherUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('school_id', schoolId)
      .eq('role', 'teacher');

    const recipientIds = [
      ...(adminUsers || []).map(u => u.id),
      ...(teacherUsers || []).map(u => u.id),
    ];

    // Send one notification per pending exam
    for (const exam of pendingExams) {
      const examDate = new Date(exam.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const subjectName = (exam.subject as any)?.name || 'Subject';
      const className = (exam.class as any)?.name || 'Class';
      const sectionName = (exam.section as any)?.name;

      await notificationService.sendBulk({
        schoolId,
        userIds: recipientIds,
        type: 'exam',
        title: `⏰ Marks Pending: ${exam.name}`,
        message: `The ${subjectName} exam (${className}${sectionName ? '-' + sectionName : ''}) held on ${examDate} has no marks entered yet. Please add marks in Marks Management.`,
        sourceId: exam.id,
      }).catch(err => console.error('Failed to send pending marks notification:', err));
    }

    return res.json({ message: 'Notifications sent', count: pendingExams.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send notifications' });
  }
}

// Submit exam answer (student upload)
export async function submitExamAnswer(req: AuthenticatedRequest, res: Response) {
  try {
    const { examId, contentUrl } = req.body;

    if (req.user!.role !== 'student') {
      return res.status(403).json({ error: 'Only students can submit exam answers' });
    }

    const { data: studentRecord } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('user_id', req.user!.id)
      .single();

    if (!studentRecord) {
      return res.status(403).json({ error: 'No student profile linked to this account' });
    }

    const { data, error } = await supabaseAdmin
      .from('exam_results')
      .upsert({
        school_id: req.user!.school_id,
        exam_id: examId,
        student_id: studentRecord.id,
        content_url: contentUrl,
        submitted_at: new Date().toISOString(),
        marks_obtained: -1,
        grade: '-'
      }, { onConflict: 'exam_id,student_id' })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to submit exam answer' });
  }
}

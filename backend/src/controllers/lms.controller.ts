import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getUserScope } from '../utils/userScope';
import { notificationService } from '../services/notification.service';
import { uploadToS3, buildExamPaperKey } from '../config/s3';

// ── FILE UPLOAD (assignments / exams / homework attachments) ──

// Upload any file (base64 data URL) to S3 and return the public URL.
// Teachers use this to attach PDFs, docs, images, etc. to assignments/exams/homework.
export async function uploadAssignmentFile(req: AuthenticatedRequest, res: Response) {
  try {
    const { dataUrl, filename, type } = req.body;

    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }

    // Parse base64 data URL: "data:application/pdf;base64,...."
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid data URL format' });
    }

    const contentType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Limit to 10MB per file
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }

    const safeName = filename || `file-${Date.now()}`;
    const key = buildExamPaperKey(req.user!.school_id, type || 'attachments', safeName);
    const url = await uploadToS3(key, buffer, contentType);

    return res.status(201).json({ url, key, filename: safeName, contentType });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}

// Upload a student's submission file (PDF, doc, image, etc.) to S3.
// Students use this to attach their work when submitting assignments/homework.
export async function uploadSubmissionFile(req: AuthenticatedRequest, res: Response) {
  try {
    const { dataUrl, filename } = req.body;

    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }

    // Parse base64 data URL: "data:application/pdf;base64,...."
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid data URL format' });
    }

    const contentType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Limit to 10MB per file
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }

    const safeName = filename || `submission-${req.user!.id}-${Date.now()}`;
    const key = buildExamPaperKey(req.user!.school_id, 'submissions', safeName);
    const url = await uploadToS3(key, buffer, contentType);

    return res.status(201).json({ url, key, filename: safeName, contentType });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to upload submission file' });
  }
}

// ── DUE DATE HELPERS ────────────────────────────────────────────────────────

/** True when the assignment deadline has passed (due date is inclusive — end of that day). */
export function isPastDue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false; // No deadline set → always open
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return new Date() > due;
}

// ── LMS SUBMISSIONS ────────────────────────────────────────

// Students submit their work (optionally with an uploaded file URL) for an assignment.
// Rules:
//   - Only students can submit (teachers/admins grade instead).
//   - Students can only submit for themselves.
//   - Submissions AFTER the due date are allowed but flagged as `late`.
export async function submitAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const { assignmentId, contentUrl } = req.body;

    if (!assignmentId) {
      return res.status(400).json({ error: 'assignmentId is required' });
    }

    // 1. Only students submit — staff grade via /lms/grade instead
    if (req.user!.role !== 'student') {
      return res.status(403).json({ error: 'Only students can submit assignments' });
    }

    // 2. Resolve the student record for the logged-in user (never trust client-provided studentId)
    const { data: studentRecord } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('user_id', req.user!.id)
      .single();
    if (!studentRecord) {
      return res.status(403).json({ error: 'No student profile linked to this account' });
    }
    const actualStudentId = studentRecord.id;

    // 3. Load the assignment — verify it exists and compute late status
    const { data: assignment } = await supabaseAdmin
      .from('lms_assignments')
      .select('id, title, due_date, school_id, section_id')
      .eq('id', assignmentId)
      .single();
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const isLate = isPastDue(assignment.due_date);
    const targetStatus = isLate ? 'late' : 'submitted';

    // 4. Upsert the submission (unique per assignment + student)
    const { data: existing } = await supabaseAdmin
      .from('lms_submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', actualStudentId)
      .maybeSingle();

    let data;
    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from('lms_submissions')
        .update({
          content_url: contentUrl ?? null,
          status: targetStatus,
          submission_date: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      data = updated;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('lms_submissions')
        .insert({
          assignment_id: assignmentId,
          student_id: actualStudentId,
          content_url: contentUrl ?? null,
          status: targetStatus,
          submission_date: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      data = inserted;
    }

    // 5. Notify the teacher that a submission came in
    if (assignment.school_id) {
      try {
        const { data: assignmentFull } = await supabaseAdmin
          .from('lms_assignments')
          .select('teacher_id')
          .eq('id', assignmentId)
          .single();
        if (assignmentFull?.teacher_id) {
          await notificationService.createInAppNotification({
            schoolId: assignment.school_id,
            userId: assignmentFull.teacher_id,
            type: 'assignment',
            title: isLate ? '🕐 Late Submission' : '📥 New Submission',
            message: `A student submitted work for "${assignment.title}".${isLate ? ' (after the due date)' : ''}`,
            sourceType: 'assignment',
            sourceId: assignmentId,
          });
        }
      } catch {
        // Notification failure should not block the submission
      }
    }

    return res.status(201).json({ ...data, isLate });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to submit assignment' });
  }
}

export async function gradeSubmission(req: AuthenticatedRequest, res: Response) {
  try {
    const { submissionId, marks, feedback } = req.body;

    const { data, error } = await supabaseAdmin
      .from('lms_submissions')
      .update({
        marks_obtained: marks,
        feedback,
        status: 'graded'
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to grade submission' });
  }
}

export async function toggleAssignmentStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const { assignmentId, studentId, isCompleted } = req.body;
    let actualStudentId = studentId;
    if (req.user!.role === 'student') {
      const { data: studentRecord } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('user_id', req.user!.id)
        .single();
      if (studentRecord) {
        actualStudentId = studentRecord.id;
      }
    }

    // Check for existing submission
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('lms_submissions')
      .select('id, status')
      .eq('assignment_id', assignmentId)
      .eq('student_id', actualStudentId)
      .maybeSingle();

    if (fetchErr) return res.status(400).json({ error: fetchErr.message });

    // Get assignment details for notifications
    const { data: assignment } = await supabaseAdmin
      .from('lms_assignments')
      .select('title, school_id, due_date')
      .eq('id', assignmentId)
      .single();

    const isTeacherOrAdmin = req.user!.role === 'admin' || req.user!.role === 'teacher';

    // Students may submit after the due date — the submission is flagged `late`.
    const isLate = !isTeacherOrAdmin && isPastDue(assignment?.due_date);

    if (isCompleted) {
      const targetStatus = isTeacherOrAdmin ? 'graded' : isLate ? 'late' : 'submitted';
      let result;
      if (existing) {
        const { data, error } = await supabaseAdmin
          .from('lms_submissions')
          .update({ status: targetStatus })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('lms_submissions')
          .insert({
            assignment_id: assignmentId,
            student_id: actualStudentId,
            content_url: null,
            status: targetStatus
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      // 🔔 Notify student when teacher/admin marks as approved/graded
      if (isTeacherOrAdmin && assignment) {
        const { data: studentUser } = await supabaseAdmin
          .from('students')
          .select('user_id')
          .eq('id', actualStudentId)
          .single();
        if (studentUser?.user_id) {
          await notificationService.createInAppNotification({
            schoolId: assignment.school_id,
            userId: studentUser.user_id,
            type: 'assignment',
            title: `✅ Homework Approved`,
            message: `Your submission for "${assignment.title}" has been approved by your teacher.`,
            sourceType: 'assignment',
            sourceId: assignmentId,
          });
        }
      }

      return res.json(result);
    } else {
      if (existing) {
        const { error } = await supabaseAdmin
          .from('lms_submissions')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      }

      // 🔔 Notify student when teacher/admin denies
      if (isTeacherOrAdmin && assignment) {
        const { data: studentUser } = await supabaseAdmin
          .from('students')
          .select('user_id')
          .eq('id', actualStudentId)
          .single();
        if (studentUser?.user_id) {
          await notificationService.createInAppNotification({
            schoolId: assignment.school_id,
            userId: studentUser.user_id,
            type: 'assignment',
            title: `❌ Homework Returned`,
            message: `Your submission for "${assignment.title}" was returned. Please redo and resubmit.`,
            sourceType: 'assignment',
            sourceId: assignmentId,
          });
        }
      }

      return res.json({ status: 'assigned' });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to toggle assignment status' });
  }
}

// ── DOCUMENT VAULT ──────────────────────────────────────────


export async function uploadDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId, documentType, fileUrl } = req.body;

    const { data, error } = await supabaseAdmin
      .from('document_vault')
      .insert({
        school_id: req.user!.school_id,
        user_id: userId,
        document_type: documentType,
        file_url: fileUrl,
        status: 'verified'
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to upload document' });
  }
}

export async function getUserDocuments(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('document_vault')
      .select('*')
      .eq('user_id', userId)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
}
export async function getLMSData(req: AuthenticatedRequest, res: Response) {
  const school_id = req.user?.school_id;
  if (!school_id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: courses, error: coursesError } = await supabaseAdmin
      .from('lms_courses')
      .select('*, instructor:users(first_name, last_name)')
      .eq('school_id', school_id);

    if (coursesError) throw coursesError;

    const courseIds = courses?.map(c => c.id) || [];
    const { data: actualAssignments, error: actualAssignmentsError } = await supabaseAdmin
      .from('lms_assignments')
      .select('*, lms_courses(title)')
      .in('course_id', courseIds);

    if (actualAssignmentsError) throw actualAssignmentsError;

    const formattedCourses = courses?.map(c => ({
      id: c.id,
      title: c.title,
      instructor: c.instructor ? `${(c.instructor as any).first_name} ${(c.instructor as any).last_name || ''}`.trim() : 'Unknown',
      lessons: c.lessons,
      students: c.students,
      progress: c.progress
    })) || [];

    const formattedAssignments = actualAssignments?.map(a => ({
      id: a.id,
      title: a.title,
      course: (a.lms_courses as any)?.title || 'Unknown',
      dueDate: a.due_date,
      submissions: a.submissions,
      total: a.total
    })) || [];

    res.json({
      courses: formattedCourses,
      assignments: formattedAssignments,
      stats: {
        courses: formattedCourses.length,
        assignments: formattedAssignments.length,
        videoLessons: formattedCourses.reduce((acc, c) => acc + (c.lessons || 0), 0),
        completionRate: '78%' // Mocked for now
      }
    });
  } catch (error) {
    console.error('LMS Data Error:', error);
    res.status(500).json({ error: 'Failed to fetch LMS data' });
  }
}

export async function deleteLMSCourse(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('lms_courses')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete course' });
  }
}

// ── ASSIGNMENTS MANAGEMENT (With Multi-channel Notifications) ──



export async function createAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const { title, description, dueDate, sectionId, subjectId, courseId, maxMarks, instructions, attachments, referenceFiles, status, aiGenerated } = req.body;
    const schoolId = req.user!.school_id;
    const teacherId = req.user!.id;

    if (!title || !sectionId || !subjectId) {
      return res.status(400).json({ error: 'title, sectionId, and subjectId are required' });
    }

    if (req.user!.role === 'teacher') {
      const scope = await getUserScope(req.user as any);
      if (!scope?.sectionIds.includes(sectionId as string)) {
        return res.status(403).json({ error: 'You are not authorized to create assignments for this section.' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('lms_assignments')
      .insert({
        school_id: schoolId,
        teacher_id: teacherId,
        section_id: sectionId,
        subject_id: subjectId,
        course_id: courseId || null,
        title,
        description: description || '',
        instructions: instructions || '',
        max_marks: maxMarks !== undefined ? maxMarks : null,
        attachments: attachments || [],
        reference_files: referenceFiles || [],
        status: status || 'published',
        ai_generated: aiGenerated || false,
        due_date: dueDate || null
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Fetch details for notifications
    const { data: subject } = await supabaseAdmin.from('subjects').select('name').eq('id', subjectId).single();
    const { data: section } = await supabaseAdmin.from('sections').select('name, classes(name)').eq('id', sectionId).single();

    const subjectName = subject?.name || 'Subject';
    const className = section ? `${(section as any).classes?.name || ''} - ${section.name}` : 'Class';

    const formattedDueDate = dueDate ? new Date(dueDate).toLocaleDateString() : 'N/A';
    const isHomework = maxMarks === -1;
    const typeLabel = isHomework ? 'Homework' : 'Assignment';
    const notificationMessage = `New ${typeLabel.toLowerCase()} has been posted for ${className} in ${subjectName}: "${title}". Due date: ${formattedDueDate}.`;
    const notificationHtml = `
      <h3>New ${typeLabel} Posted</h3>
      <p><strong>Class:</strong> ${className}</p>
      <p><strong>Subject:</strong> ${subjectName}</p>
      <p><strong>Title:</strong> ${title}</p>
      <p><strong>Description:</strong> ${description || 'No description provided.'}</p>
      <p><strong>Due Date:</strong> ${formattedDueDate}</p>
    `;

    notificationService.notifySection({
      schoolId,
      sectionId,
      type: 'assignment',
      title: `New Assignment: ${title}`,
      message: notificationMessage,
      htmlContent: notificationHtml,
      sourceId: data.id,
    }).catch(err => console.error('Failed to trigger assignment notification:', err));

    // Teacher confirmation
    await notificationService.sendMultiChannel({
      schoolId,
      userId: teacherId,
      channels: ['email'],
      type: 'assignment',
      title: 'Assignment Published Successfully',
      message: `Your assignment "${title}" for ${className} in ${subjectName} has been published. Students and parents have been notified.`,
      sourceType: 'assignment',
      sourceId: data.id,
    }).catch(() => { });

    // Admin activity log + notification
    const { data: admins } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('school_id', schoolId)
      .eq('role', 'admin');

    await supabaseAdmin.from('audit_logs').insert({
      school_id: schoolId,
      user_id: teacherId,
      action: 'assignment_created',
      entity_type: 'lms_assignment',
      entity_id: data.id,
      new_data: { title, sectionId, subjectId, dueDate },
    });

    for (const admin of admins || []) {
      if (admin.id === teacherId) continue;
      await notificationService.createInAppNotification({
        schoolId,
        userId: admin.id,
        type: 'assignment',
        title: `New Assignment: ${title}`,
        message: `${className} — ${subjectName}. Due: ${formattedDueDate}`,
        sourceType: 'assignment',
        sourceId: data.id,
      });
    }

    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create assignment' });
  }
}

export async function getAssignments(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { sectionId, subjectId, studentId, type } = req.query;

    let query = supabaseAdmin
      .from('lms_assignments')
      .select('*, subjects(name), sections(name, classes(name)), users:teacher_id(first_name, last_name)')
      .eq('school_id', schoolId);

    const scope = await getUserScope(req.user!);
    if (req.user!.role !== 'admin' && scope) {
      if (scope.sectionIds.length === 0) {
        if (req.user!.role === 'teacher') {
          // teacher_id stores users.id (see createAssignment) — match on the logged-in user
          query = query.eq('teacher_id', req.user!.id);
        } else {
          return res.json([]);
        }
      } else {
        if (req.user!.role === 'teacher') {
          // teacher_id stores users.id (see createAssignment) — match on the logged-in user
          query = query.or(`section_id.in.(${scope.sectionIds.join(',')}),teacher_id.eq.${req.user!.id}`);
        } else {
          query = query.in('section_id', scope.sectionIds);
        }
      }
    } else {
      if (sectionId && sectionId !== 'all') query = query.eq('section_id', sectionId as string);
      if (subjectId && subjectId !== 'all') query = query.eq('subject_id', subjectId as string);
    }

    // Filter by type (homework vs assignment)
    if (type === 'homework') {
      query = query.eq('max_marks', -1);
    } else if (type === 'assignment') {
      query = query.neq('max_marks', -1);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    // Fetch submissions for the student to know status
    let studentSubmissions: any[] = [];

    let actualStudentId = studentId as string | undefined;
    if (req.user!.role === 'student' && !actualStudentId) {
      const { data: studentRecord } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('user_id', req.user!.id)
        .single();
      if (studentRecord) {
        actualStudentId = studentRecord.id;
      }
    }

    if (actualStudentId) {
      const assignmentIds = data?.map(a => a.id) || [];
      if (assignmentIds.length > 0) {
        const { data: subs } = await supabaseAdmin
          .from('lms_submissions')
          .select('assignment_id, status, feedback, marks_obtained, content_url, submission_date')
          .eq('student_id', actualStudentId)
          .in('assignment_id', assignmentIds);
        studentSubmissions = subs || [];
      }
    }

    const formatted = data?.map(a => {
      const submission = studentSubmissions.find(s => s.assignment_id === a.id);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        dueDate: a.due_date,
        sectionId: a.section_id,
        subjectId: a.subject_id,
        teacherId: a.teacher_id,
        subjectName: (a.subjects as any)?.name || 'General',
        className: (a.sections as any) ? `${((a.sections as any).classes as any)?.name || ''} - ${(a.sections as any).name}` : 'General',
        teacherName: a.users ? `${(a.users as any).first_name} ${(a.users as any).last_name || ''}`.trim() : 'Unknown',
        attachments: a.attachments || [],
        submissions: a.submissions,
        total: a.total,
        status: submission?.status || 'assigned',
        contentUrl: submission?.content_url || null,
        submittedAt: submission?.submission_date || null,
        feedback: submission?.feedback || null,
        marksObtained: submission?.marks_obtained || null,
        isCompleted: submission ? (submission.status === 'pending' || submission.status === 'completed' || submission.status === 'submitted' || submission.status === 'graded') : false
      };
    }) || [];

    return res.json(formatted);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch assignments' });
  }
}

export async function deleteAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const schoolId = req.user!.school_id;

    // Ownership: teachers can only delete their own assignments — admins manage all.
    if (req.user!.role === 'teacher') {
      const { data: existing } = await supabaseAdmin
        .from('lms_assignments')
        .select('teacher_id')
        .eq('id', id)
        .eq('school_id', schoolId)
        .single();
      if (!existing) return res.status(404).json({ error: 'Assignment not found' });
      if (existing.teacher_id !== req.user!.id) {
        return res.status(403).json({ error: 'You can only delete assignments you created.' });
      }
    }

    const { error } = await supabaseAdmin
      .from('lms_assignments')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete assignment' });
  }
}

export async function updateAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { title, description, dueDate, sectionId, subjectId, maxMarks } = req.body;
    const schoolId = req.user!.school_id;

    // Ownership: teachers can only edit their own assignments — admins manage all.
    if (req.user!.role === 'teacher') {
      const { data: existing } = await supabaseAdmin
        .from('lms_assignments')
        .select('teacher_id')
        .eq('id', id)
        .eq('school_id', schoolId)
        .single();
      if (!existing) return res.status(404).json({ error: 'Assignment not found' });
      if (existing.teacher_id !== req.user!.id) {
        return res.status(403).json({ error: 'You can only edit assignments you created.' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('lms_assignments')
      .update({
        title,
        description: description || '',
        due_date: dueDate || null,
        section_id: sectionId,
        subject_id: subjectId,
        max_marks: maxMarks || null
      })
      .eq('id', id)
      .eq('school_id', schoolId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update assignment' });
  }
}

export async function getAssignmentSubmissions(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const schoolId = req.user!.school_id;

    // 1. Get the assignment details to find its section
    const { data: assignment, error: assignErr } = await supabaseAdmin
      .from('lms_assignments')
      .select('section_id')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (assignErr || !assignment) return res.status(404).json({ error: 'Assignment not found' });

    // 2. Get all students in that section
    const { data: students, error: studentsErr } = await supabaseAdmin
      .from('students')
      .select('id, admission_number, roll_number, users(first_name, last_name, avatar_url)')
      .eq('section_id', assignment.section_id)
      .eq('school_id', schoolId);

    if (studentsErr) return res.status(400).json({ error: studentsErr.message });

    // 3. Get all submissions for this assignment
    const { data: submissions, error: subErr } = await supabaseAdmin
      .from('lms_submissions')
      .select('*')
      .eq('assignment_id', id);

    if (subErr) return res.status(400).json({ error: subErr.message });

    // 4. Map students to their submission status
    const result = (students || []).map(student => {
      const submission = submissions?.find(s => s.student_id === student.id);
      return {
        studentId: student.id,
        firstName: (student.users as any)?.first_name || '',
        lastName: (student.users as any)?.last_name || '',
        avatarUrl: (student.users as any)?.avatar_url,
        admissionNumber: student.admission_number,
        rollNumber: student.roll_number,
        submissionId: submission?.id || null,
        status: submission?.status || 'assigned',
        contentUrl: submission?.content_url || null,
        marksObtained: submission?.marks_obtained || null,
        feedback: submission?.feedback || null,
        submittedAt: submission?.created_at || null
      };
    });

    // Sort: pending first, then assigned, then completed
    result.sort((a, b) => {
      const rank = { pending: 0, assigned: 1, completed: 2, submitted: 0, graded: 2 } as any;
      return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch submissions' });
  }
}

// Bulk submit assignment results
export async function submitAssignmentResults(req: AuthenticatedRequest, res: Response) {
  try {
    const { assignmentId, results } = req.body;
    // results: [{ studentId, marksObtained, isAbsent, remarks }]

    const { data: assignment } = await supabaseAdmin
      .from('lms_assignments')
      .select('max_marks')
      .eq('id', assignmentId)
      .single();

    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const records = results.map((r: any) => ({
      assignment_id: assignmentId,
      student_id: r.studentId,
      marks_obtained: r.marksObtained !== undefined ? r.marksObtained : null,
      status: r.isAbsent ? 'assigned' : (assignment.max_marks === -1 ? r.status || 'completed' : 'graded'),
      feedback: r.remarks || r.feedback
    }));

    const { data: existingSubmissions } = await supabaseAdmin
      .from('lms_submissions')
      .select('id, student_id')
      .eq('assignment_id', assignmentId);

    const existingMap = new Map((existingSubmissions || []).map(s => [s.student_id, s.id]));

    for (const record of records) {
      const existingId = existingMap.get(record.student_id);
      if (existingId) {
        const { error } = await supabaseAdmin
          .from('lms_submissions')
          .update({
            marks_obtained: record.marks_obtained,
            status: record.status,
            feedback: record.feedback
          })
          .eq('id', existingId);
        if (error) return res.status(400).json({ error: error.message });
      } else {
        const { error } = await supabaseAdmin
          .from('lms_submissions')
          .insert(record);
        if (error) return res.status(400).json({ error: error.message });
      }
    }

    return res.json({ message: `Results saved for ${records.length} students`, results: records });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to submit assignment results' });
  }
}

// Publish assignment results
export async function publishAssignmentResults(req: AuthenticatedRequest, res: Response) {
  try {
    const { assignmentId } = req.body;

    const { data: results } = await supabaseAdmin
      .from('lms_submissions')
      .select(`
        *,
        student:students(
          id,
          user:users(first_name, last_name)
        ),
        assignment:lms_assignments(*, subject:subjects(name))
      `)
      .eq('assignment_id', assignmentId)
      .eq('status', 'graded');

    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'No graded results found' });
    }

    if (req.user!.role === 'teacher') {
      const { data: assignmentData } = await supabaseAdmin
        .from('lms_assignments')
        .select('teacher_id')
        .eq('id', assignmentId)
        .eq('school_id', req.user!.school_id)
        .single();

      if (!assignmentData) return res.status(404).json({ error: 'Assignment not found' });
      if (assignmentData.teacher_id !== req.user!.id) {
        return res.status(403).json({ error: 'You do not have permission to publish this assignment' });
      }
    }

    let notified = 0;
    for (const result of results) {
      try {
        const { data: parentLink } = await supabaseAdmin
          .from('parent_students')
          .select('parent:parents(user:users(id, email, phone))')
          .eq('student_id', result.student_id)
          .limit(1)
          .single();

        const pUser = (parentLink as any)?.parent?.user;
        if (pUser) {
          const parentUser = pUser;
          const studentUser = (result as any).student?.user;
          const assignment = result.assignment as any;

          await notificationService.sendExamResult({
            schoolId: req.user!.school_id,
            parentEmail: parentUser.email,
            parentPhone: parentUser.phone || '',
            parentUserId: parentUser.id,
            studentName: `${studentUser?.first_name || ''} ${studentUser?.last_name || ''}`,
            examName: `${assignment?.title || ''} - ${assignment?.subject?.name || ''}`,
            results: [{
              subject: assignment?.subject?.name || '',
              marks: result.marks_obtained || 0,
              total: assignment?.max_marks || 0,
              grade: '', // Or calculate based on logic
            }],
            overallPercentage: Math.round(((result.marks_obtained || 0) / (assignment?.max_marks || 1)) * 10000) / 100,
            assessmentType: 'Assignment'
          });
          notified++;
        }
      } catch (innerError: any) {
        console.error(`Failed to notify parent for student ${result.student_id}:`, innerError.message || innerError);
      }
    }

    // Update assignment status to completed in database
    await supabaseAdmin
      .from('lms_assignments')
      .update({ status: 'completed' })
      .eq('id', assignmentId);

    return res.json({ message: `Assignment Results published. ${notified} parents notified.` });
  } catch (error: any) {
    console.error('publishAssignmentResults Error:', error);
    return res.status(500).json({ error: 'Failed to publish assignment results' });
  }
}

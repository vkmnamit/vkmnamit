import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { generateRandomPassword, generateUsername } from '../util/user.util';
import { notificationService } from '../services/notification.service';

/**
 * Handles the initial data setup for a school
 */
export async function setupSchoolData(req: Request, res: Response) {
  const { schoolId, teachers, classes, students, parents } = req.body;

  try {
    const results: any = {
      teachers: [],
      students: [],
      parents: [],
      mappings: 0
    };

    // 1. Setup Classes and Sections First
    const classMap: Record<string, string> = {}; // Name to ID
    const sectionMap: Record<string, string> = {}; // Name to ID

    for (const cls of classes) {
      const { data: classRecord } = await supabaseAdmin.from('classes').insert({
        school_id: schoolId,
        name: cls.name,
        grade: cls.grade
      }).select().single();

      if (classRecord) {
        classMap[cls.name] = classRecord.id;
        for (const secName of cls.sections) {
          const { data: secRecord } = await supabaseAdmin.from('sections').insert({
            class_id: classRecord.id,
            name: secName
          }).select().single();
          if (secRecord) sectionMap[`${cls.name}-${secName}`] = secRecord.id;
        }
      }
    }

    // 2. Import Teachers
    for (const t of teachers) {
      const password = generateRandomPassword(12);
      const username = generateUsername('teacher', t.first_name, t.last_name);

      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: t.email,
        password: password,
        email_confirm: true,
        user_metadata: { role: 'teacher', schoolId }
      });

      if (!authErr && authUser) {
        const { data: user } = await supabaseAdmin.from('users').insert({
          id: authUser.user.id,
          auth_id: authUser.user.id,
          school_id: schoolId,
          email: t.email,
          role: 'teacher',
          first_name: t.first_name,
          last_name: t.last_name
        }).select().single();

        if (user) {
          await supabaseAdmin.from('teachers').insert({
            user_id: user.id,
            school_id: schoolId,
            employee_id: t.employee_id || `T-${Date.now()}-${Math.floor(Math.random()*100)}`,
            department: t.department
          });
          
          // Send Welcome Email
          await notificationService.sendWelcomeMessage({
            schoolId,
            userId: user.id,
            name: `${user.first_name} ${user.last_name || ''}`,
            role: 'Teacher',
            email: t.email,
            channels: ['email'],
            loginUrl: `${req.headers.origin || 'http://localhost:5173'}/login`
          });

          results.teachers.push({ email: t.email, password, username });
        }
      }
    }

    // 3. Import Students
    const studentMap: Record<string, string> = {}; // Admission Number to Student UUID

    for (const s of students) {
      const password = generateRandomPassword(10);
      const username = generateUsername('student', s.first_name, s.last_name);
      const sectionId = sectionMap[`${s.class}-${s.section}`];

      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: s.email,
        password: password,
        email_confirm: true,
        user_metadata: { role: 'student', schoolId }
      });

      if (!authErr && authUser) {
        const { data: user } = await supabaseAdmin.from('users').insert({
          id: authUser.user.id,
          auth_id: authUser.user.id,
          school_id: schoolId,
          email: s.email,
          role: 'student',
          first_name: s.first_name,
          last_name: s.last_name
        }).select().single();

        if (user) {
          const { data: studentRecord } = await supabaseAdmin.from('students').insert({
            user_id: user.id,
            school_id: schoolId,
            section_id: sectionId,
            admission_number: s.admission_number,
            roll_number: s.roll_number
          }).select().single();
          
          if (studentRecord) studentMap[s.admission_number] = studentRecord.id;

          // Send Welcome Email
          await notificationService.sendWelcomeMessage({
            schoolId,
            userId: user.id,
            name: `${user.first_name} ${user.last_name || ''}`,
            role: 'Student',
            email: s.email,
            channels: ['email'],
            loginUrl: `${req.headers.origin || 'http://localhost:5173'}/login`
          });

          results.students.push({ email: s.email, password, username });
        }
      }
    }

    // 4. Import Parents and Map to Students
    for (const p of parents) {
      const password = generateRandomPassword(10);
      const username = generateUsername('parent', p.first_name, p.last_name);

      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: p.email,
        password: password,
        email_confirm: true,
        user_metadata: { role: 'parent', schoolId }
      });

      if (!authErr && authUser) {
        const { data: user } = await supabaseAdmin.from('users').insert({
          id: authUser.user.id,
          auth_id: authUser.user.id,
          school_id: schoolId,
          email: p.email,
          role: 'parent',
          first_name: p.first_name,
          last_name: p.last_name
        }).select().single();

        if (user) {
          const { data: parentRecord } = await supabaseAdmin.from('parents').insert({
            user_id: user.id,
            school_id: schoolId,
            occupation: p.occupation
          }).select().single();

          if (parentRecord && p.childAdmissionNumbers) {
            for (const admNo of p.childAdmissionNumbers) {
              const studentId = studentMap[admNo];
              if (studentId) {
                await supabaseAdmin.from('parent_students').insert({
                  parent_id: parentRecord.id,
                  student_id: studentId,
                  relationship: p.relationship || 'father'
                });
                results.mappings++;
              }
            }
          }
          // Send Welcome Email
          await notificationService.sendWelcomeMessage({
            schoolId,
            userId: user.id,
            name: `${user.first_name} ${user.last_name || ''}`,
            role: 'Parent',
            email: p.email,
            channels: ['email'],
            loginUrl: `${req.headers.origin || 'http://localhost:5173'}/login`
          });

          results.parents.push({ email: p.email, password, username });
        }
      }
    }

    return res.json({
      message: 'Onboarding completed successfully',
      ...results
    });
  } catch (error: any) {
    console.error('Onboarding Error:', error);
    return res.status(500).json({ error: 'Failed to complete onboarding' });
  }
}

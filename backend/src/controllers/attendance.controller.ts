import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { notificationService } from '../services/notification.service';
import { getUserScope } from '../utils/userScope';

// ══ Holiday / Non-working-day helpers ═══════════════════════════════════════
// A date is a non-working day if it's a Sunday, OR if the school has marked it
// as a holiday in the attendance_holidays table. Holidays keyed by school without
// crashing if the table hasn't been created yet (graceful degrade to Sunday-only).

const DAY_SUNDAY = 0;

export function isSunday(dateStr: string): boolean {
  const d = new Date(`${dateStr}T00:00:00`);
  return !isNaN(d.getTime()) && d.getDay() === DAY_SUNDAY;
}

// Fetch all marked holidays for the school (empty array when table missing).
async function fetchSchoolHolidays(schoolId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('attendance_holidays')
      .select('date')
      .eq('school_id', schoolId);
    if (error) {
      // Table not created yet → degrade gracefully to Sundays only.
      return [];
    }
    return (data || []).map((h: any) => new Date(`${h.date}T00:00:00`).toISOString().slice(0, 10));
  } catch {
    return [];
  }
}

// Returns the set of non-working days in [startDate, endDate] (inclusive).
export async function getOffDays(schoolId: string, startDate: string, endDate: string): Promise<string[]> {
  const holidays = await fetchSchoolHolidays(schoolId);
  const offDays: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(cur.getTime()) || isNaN(end.getTime())) return offDays;
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    if (cur.getDay() === DAY_SUNDAY || holidays.includes(iso)) offDays.push(iso);
    cur.setDate(cur.getDate() + 1);
  }
  return offDays;
}

// Mark a date as a school holiday (admin/teacher only).
export async function markHoliday(req: AuthenticatedRequest, res: Response) {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const iso = new Date(`${date}T00:00:00`).toISOString().slice(0, 10);
    if (isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }

    const { data, error } = await supabaseAdmin
      .from('attendance_holidays')
      .upsert(
        { school_id: req.user!.school_id, date: iso, reason: reason || `Holiday on ${iso}`, created_by: req.user!.id },
        { onConflict: 'school_id,date' }
      )
      .select()
      .single();

    if (error) {
      // Table doesn't exist yet — tell the user to run the migration.
      if (String(error.message || '').includes('does not exist') || String(error.code) === '42P01') {
        return res.status(500).json({
          error: 'The attendance_holidays table does not exist yet. Please run migrations/add_attendance_holidays.sql in your Supabase SQL editor.',
        });
      }
      return res.status(400).json({ error: error.message });
    }

    await supabaseAdmin.from('audit_logs').insert({
      school_id: req.user!.school_id,
      user_id: req.user!.id,
      action: `holiday_marked: ${iso}${reason ? ` (${reason})` : ''}`,
      entity_type: 'attendance',
    });

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to mark holiday' });
  }
}

// List marked holidays (optionally a date range).
export async function getHolidays(req: AuthenticatedRequest, res: Response) {
  try {
    const { start_date, end_date } = req.query;
    let query = supabaseAdmin
      .from('attendance_holidays')
      .select('*')
      .eq('school_id', req.user!.school_id)
      .order('date', { ascending: false });

    if (start_date) query = query.gte('date', String(start_date));
    if (end_date) query = query.lte('date', String(end_date));

    const { data, error } = await query;
    if (error) {
      if (String(error.message || '').includes('does not exist') || String(error.code) === '42P01') {
        return res.json({ holidays: [], error: null, tableMissing: true });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.json({ holidays: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch holidays' });
  }
}

// Remove a marked holiday by id.
export async function deleteHoliday(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('attendance_holidays')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);
    if (error) {
      if (String(error.message || '').includes('does not exist') || String(error.code) === '42P01') {
        return res.status(500).json({ error: 'Holiday table not created yet — run the migration first.' });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete holiday' });
  }
}

// Mark attendance for a section
export async function markAttendance(req: AuthenticatedRequest, res: Response) {
  try {
    const { sectionId, date, records } = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (!date || !records || records.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

        // Off-day guard: Sundays and admin-marked holidays are not working days.
    // No one — not even admins — can mark attendance on holidays.
    const offDays = await getOffDays(req.user!.school_id, date, date);
    if (offDays.length > 0) {
      return res.status(403).json({
        error: `${date} is a non-working day (Sunday or holiday). You can use the "Mark Holiday" action instead.`,
      });
    }

    // 1. Class Teacher Enforcement & Lock System
    if (userRole === 'teacher') {
      // Get student IDs to check their sections
      const studentIds = records.map((r: any) => r.studentId);
      
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id, section_id, section:sections(class_teacher_id)')
        .in('id', studentIds);

      // Verify that the teacher is the class teacher for ALL these students' sections
      if (students) {
        for (const student of students) {
          const classTeacherId = (student.section as any)?.class_teacher_id;
          if (classTeacherId !== userId) {
            return res.status(403).json({ error: 'You are only allowed to mark attendance for your assigned class as a Class Teacher.' });
          }
        }
      }

      // Lock edits after 6 PM for teachers (Convert UTC to IST for check)
      const markTime = new Date();
      markTime.setMinutes(markTime.getMinutes() + 330); // Add 5.5 hours for IST
      const isAfterLockTime = markTime.getUTCHours() >= 18;
      if (isAfterLockTime) {
        return res.status(403).json({ error: 'Attendance Registry is locked after 18:00. Contact Admin for overrides.' });
      }
    }

    const { data: currentStudents } = await supabaseAdmin.from('students').select('id, section_id').in('id', records.map((r: any) => r.studentId));
    
    const attendanceRecords = records.map((r: any) => {
      const student = currentStudents?.find((s: any) => s.id === r.studentId);
      return {
        school_id: req.user!.school_id,
        student_id: r.studentId,
        section_id: sectionId || student?.section_id || null,
        date,
        status: r.status,
        marked_by: userId,
      };
    });

    // 2. Upsert attendance
    const { error } = await supabaseAdmin
      .from('attendance')
      .upsert(attendanceRecords, { onConflict: 'student_id,date' });

    if (error) return res.status(400).json({ error: error.message });

    // 3. Auto Attendance % Calculation & Risk Detection (SaaS Feature)
    for (const record of records) {
      const studentId = record.studentId;
      
      // Get all attendance for this student to calculate percentage
      const { data: history } = await supabaseAdmin
        .from('attendance')
        .select('status, date')
        .eq('student_id', studentId);
      
      if (history && history.length > 0) {
        // Exclude Sundays + school-marked holidays from the working-day count
        // so a holiday never lowers a student attendance percentage.
        const offDays = await getOffDays(req.user!.school_id, '2000-01-01', '2100-01-01');
        const working = history.filter((h: any) => !offDays.includes(String(h.date).slice(0, 10)));
        const total = working.length;
        const present = working.filter((h: any) => h.status === 'present').length;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 100;
        
        // Update student profile with new analytics
        await supabaseAdmin
          .from('students')
          .update({ 
            attendance_percentage: percentage,
            risk_level: percentage < 75 ? 'high' : (percentage < 85 ? 'medium' : 'low')
          })
          .eq('id', studentId);
      }
    }

    // 4. Automated Alerts for Absentees
    const absentStudents = records.filter((r: any) => r.status === 'absent');
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
        await notificationService.sendAttendanceAlert({
          schoolId: req.user!.school_id,
          parentPhone: pUser.phone || '',
          parentEmail: pUser.email || '',
          parentUserId: pUser.id,
          studentName: `${sUser.first_name} ${sUser.last_name || ''}`,
          date,
          status: 'absent',
        });
      }
    }));

    // 5. Audit Logging for Security
    await supabaseAdmin.from('audit_logs').insert({
      school_id: req.user!.school_id,
      user_id: userId,
      action: `attendance_sync: ${records.length} nodes updated.`,
      entity_type: 'attendance',
    });

    return res.json({ message: 'Attendance engine synchronized successfully' });
  } catch (error: any) {
    console.error('Attendance Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to synchronize attendance engine' });
  }
}

// Get attendance for a section on a date (or date range).
// Holiday / Sunday dates are included in the response via `holiday_dates`
// and any existing attendance records that fall on those dates are re-tagged
// as status 'holiday' so they never show up as 'absent'.
export async function getAttendance(req: AuthenticatedRequest, res: Response) {
  try {
    const { section_id, date, student_id, start_date, end_date } = req.query;
    const scope = await getUserScope(req.user!);

    let query = supabaseAdmin
      .from('attendance')
      .select(`
        *,
        marked_by_user:users!attendance_marked_by_fkey(first_name, last_name),
        student:students(id, roll_number, user:users(first_name, last_name, avatar_url))
      `)
      .eq('school_id', req.user!.school_id);

    if (scope) {
      if (scope.studentIds.length === 0) return res.json({ records: [], holiday_dates: [] });
      query = query.in('student_id', scope.studentIds);
    } else {
      if (section_id) query = query.eq('section_id', section_id as string);
      if (student_id) query = query.eq('student_id', student_id as string);
    }

    if (date) query = query.eq('date', date as string);
    if (start_date) query = query.gte('date', start_date as string);
    if (end_date) query = query.lte('date', end_date as string);

    const { data, error } = await query.order('date', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    // Determine the date range to check for off-days (Sundays + marked holidays)
    let rangeStart = date as string;
    let rangeEnd = date as string;
    if (start_date) rangeStart = start_date as string;
    if (end_date) rangeEnd = end_date as string;

    // When no date range is given (e.g. full student history), derive the
    // range from the fetched records so holidays in that span are still detected.
    if (!rangeStart || !rangeEnd) {
      const dates = (data || []).map((r: any) => String(r.date).slice(0, 10)).sort();
      if (dates.length > 0) {
        rangeStart = rangeStart || dates[0];
        rangeEnd = rangeEnd || dates[dates.length - 1];
      }
    }

    // Fetch holiday dates for the requested range so the frontend can
    // display "H" / "Holiday" instead of "-" or "A".
    let holidayDates: string[] = [];
    if (rangeStart && rangeEnd) {
      try {
        holidayDates = await getOffDays(req.user!.school_id, rangeStart, rangeEnd);
      } catch {
        // degrade gracefully — if holiday lookup fails, just return empty
      }
    }

    // Re-tag any records that fall on a holiday as 'holiday'
    const holidaySet = new Set(holidayDates);
    const records = (data || []).map((r: any) => {
      const d = String(r.date).slice(0, 10);
      if (holidaySet.has(d)) {
        return { ...r, status: 'holiday' };
      }
      return r;
    });

    return res.json({ records, holiday_dates: holidayDates });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch attendance' });
  }
}

// Get attendance stats for dashboard
export async function getAttendanceStats(req: AuthenticatedRequest, res: Response) {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period as string));

    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('status, date')
      .eq('school_id', req.user!.school_id)
      .gte('date', startDate.toISOString().split('T')[0]);

    if (!attendance) return res.json({ rate: 0, trends: [] });

    // Exclude Sundays + school-marked holidays from the working-day count.
    const offDays = await getOffDays(req.user!.school_id, startDate.toISOString().split('T')[0], '2100-01-01');
    const workingDays = attendance.filter((a: any) => !offDays.includes(String(a.date).slice(0, 10)));

    const total = workingDays.length;
    const present = workingDays.filter((a: any) => a.status === 'present').length;
    const rate = total > 0 ? Math.round((present / total) * 10000) / 100 : 0;

    // Daily trends
    const dailyMap: Record<string, { present: number; total: number }> = {};
    workingDays.forEach((a: any) => {
      if (!dailyMap[a.date]) dailyMap[a.date] = { present: 0, total: 0 };
      dailyMap[a.date].total++;
      if (a.status === 'present') dailyMap[a.date].present++;
    });

    const trends = Object.entries(dailyMap)
      .map(([date, stats]) => ({
        date,
        rate: Math.round((stats.present / stats.total) * 10000) / 100,
        present: stats.present,
        absent: stats.total - stats.present,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({ rate, total, present, absent: total - present, trends });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch attendance stats' });
  }
}

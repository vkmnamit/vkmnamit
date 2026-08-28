import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import { notificationService } from '../services/notification.service';
import { aiService } from '../services/ai.service';
import { aiEntityResolver } from '../services/ai-entity-resolver.service';
import { getUserScope } from '../utils/userScope';
import { getOffDays } from './attendance.controller';
// fee_generation.service imported dynamically in createStudent

function formatPhone(p?: any) {
  if (!p) return null;
  const clean = String(p).replace(/\D/g, '');
  if (clean.length === 10) return `+91${clean}`;
  return String(p).startsWith('+') ? String(p) : `+${clean}`;
}

// Flush accumulated rows to Supabase in bounded chunks. A single 5000+ row
// insert can exceed PostgREST's body/parameter limits (PGRST116 / 413) and
// crash the whole bulk request, so we always split into 500-row batches.
async function flushBulkInsertRows(rows: any[], table: 'fee_payments', chunkSize = 500): Promise<number> {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from(table).insert(chunk);
    if (error) {
      console.error(`[BULK-INSERT] ${table} chunk ${i}-${i + chunk.length - 1} failed:`, error.message);
    } else {
      inserted += chunk.length;
    }
  }
  return inserted;
}

async function resolveActiveAcademicYearId(schoolId: string, requestedYearId?: unknown): Promise<string | null> {
  if (typeof requestedYearId === 'string' && requestedYearId.trim()) {
    const { data, error } = await supabaseAdmin
      .from('academic_years')
      .select('id')
      .eq('id', requestedYearId.trim())
      .eq('school_id', schoolId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('The selected academic year does not belong to this school.');
    return data.id;
  }

  const { data, error } = await supabaseAdmin
    .from('academic_years')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .order('start_date', { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function assertEmailAvailable(schoolId: string, email: string): Promise<string | null> {
  if (!email || email.includes('@kautix.local')) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, role, email')
    .eq('school_id', schoolId)
    .ilike('email', email.trim())
    .maybeSingle();
  if (data) {
    return `Email "${email}" is already used by a ${data.role} account. Please use a different email.`;
  }
  return null;
}

async function enrichStudentProfile(student: any, studentId: string) {
  const sectionId = student.section_id;

  const { data: assignments } = await supabaseAdmin
    .from('lms_assignments')
    .select('id, title, description, due_date, status, subjects(name), sections(name, classes(name)), users:teacher_id(first_name, last_name)')
    .eq('section_id', sectionId)
    .order('due_date', { ascending: false })
    .limit(30);

  const dayMap: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const todayNum = dayMap[new Date().toLocaleDateString('en-US', { weekday: 'long' })] ?? 1;

  const { data: schedule } = await supabaseAdmin
    .from('timetable_slots')
    .select('period_number, start_time, end_time, room, subject:subjects(name), teacher:users(first_name, last_name)')
    .eq('section_id', sectionId)
    .eq('day_of_week', todayNum)
    .order('period_number', { ascending: true });

  const { data: inAppNotifications } = await supabaseAdmin
    .from('user_notifications')
    .select('*')
    .eq('user_id', student.user_id)
    .order('created_at', { ascending: false })
    .limit(15);

  const examResults = student.examResults || [];
  const subjectMap: Record<string, { total: number; count: number }> = {};
  examResults.forEach((r: any) => {
    const sName = r.exam?.subject?.name || 'Subject';
    const score = Math.round((Number(r.marks_obtained) / Number(r.exam?.total_marks || 1)) * 100);
    if (!subjectMap[sName]) subjectMap[sName] = { total: 0, count: 0 };
    subjectMap[sName].total += score;
    subjectMap[sName].count += 1;
  });

  const subjectPerformance = Object.entries(subjectMap).map(([subject, d]) => ({
    subject,
    avg_score: Math.round(d.total / d.count),
  }));

  const attendanceSummary = student.attendanceSummary || { total: 0, present: 0, percentage: 0 };
  const risk_analysis = {
    level: student.risk_level || 'low',
    reasons: [] as string[],
    recommended_action: 'Continue regular monitoring',
  };
  if (attendanceSummary.total > 0 && attendanceSummary.percentage < 75) {
    risk_analysis.reasons.push(`${attendanceSummary.percentage}% attendance (below 75%)`);
    risk_analysis.recommended_action = 'Schedule parent meeting';
  }

  return {
    assignments: assignments || [],
    today_schedule: schedule || [],
    notifications: inAppNotifications || [],
    academic: {
      subject_performance: subjectPerformance,
      intelligence_summary: subjectPerformance.length
        ? `Strongest in ${subjectPerformance.sort((a, b) => b.avg_score - a.avg_score)[0]?.subject || 'N/A'}.`
        : null,
    },
    risk_analysis,
  };
}

async function ensureTransportRouteAssignment(
  schoolId: string,
  studentId: string,
  routeName?: string,
  routeFeeAmount?: any,
  opts?: { pendingFeeRows?: any[]; academicYearId?: string | null }
) {
  const normalizedRouteName = String(routeName || '').trim();
  const normalizedFeeAmount = Number(routeFeeAmount || 0);

  if (!normalizedRouteName && normalizedFeeAmount <= 0) {
    return null;
  }

  const routeLabel = normalizedRouteName || `Auto Route ₹${normalizedFeeAmount || 0}`;
  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  let existingRoute: any = null;

  if (normalizedRouteName) {
    // Use limit(1)+maybeSingle so already-existing duplicate names don't throw
    const { data: matchedRoutes } = await supabaseAdmin
      .from('transport_routes')
      .select('id, name, fee_amount, monthly_fee, route_name')
      .eq('school_id', schoolId)
      .or(`name.ilike.${encodeURIComponent(routeLabel)},route_name.ilike.${encodeURIComponent(routeLabel)}`)
      .order('created_at', { ascending: false })
      .limit(1);

    existingRoute = matchedRoutes?.[0] || null;
  }

  if (!existingRoute && normalizedFeeAmount > 0) {
    const { data: matchedByAmount } = await supabaseAdmin
      .from('transport_routes')
      .select('id, name, fee_amount, monthly_fee, route_name')
      .eq('school_id', schoolId)
      .or(`monthly_fee.eq.${normalizedFeeAmount},fee_amount.eq.${normalizedFeeAmount}`)
      .order('created_at', { ascending: true })
      .limit(1);

    existingRoute = matchedByAmount?.[0] || null;
  }

  let routeId = existingRoute?.id || null;

  // Helper: query and reuse an existing route by name, or return null
  const findExistingRouteById = async () => {
    const { data: reselect } = await supabaseAdmin
      .from('transport_routes')
      .select('id')
      .eq('school_id', schoolId)
      .or(`name.ilike.${encodeURIComponent(routeLabel)},route_name.ilike.${encodeURIComponent(routeLabel)}`)
      .order('created_at', { ascending: false })
      .limit(1);
    return reselect?.[0]?.id || null;
  };

  if (!routeId) {
    const basePayload: any = {
      school_id: schoolId,
      name: routeLabel,
      route_name: routeLabel,
      description: 'Auto-created from bulk import',
      fee_amount: normalizedFeeAmount || 0,
      pickup_points: null,
      is_active: true,
    };

    try {
      const { data, error } = await supabaseAdmin
        .from('transport_routes')
        .insert({ ...basePayload, monthly_fee: normalizedFeeAmount || 0 })
        .select('id')
        .single();
      if (error) {
        // If the column doesn't exist yet, fall back to base-only payload
        if (error.message?.includes('monthly_fee') || error.message?.includes('column')) {
          const { data: fallbackData } = await supabaseAdmin
            .from('transport_routes')
            .insert(basePayload)
            .select('id')
            .single();
          routeId = fallbackData?.id || null;
        } else {
          // A likely duplicate-key/race condition — re-query and reuse existing route
          routeId = await findExistingRouteById();
        }
      } else {
        routeId = data?.id || null;
      }
    } catch (err) {
      // Race condition or unique violation — re-query and reuse existing route
      console.warn('Transport route create had a conflict during bulk import, reusing existing route:', err);
      routeId = await findExistingRouteById();
    }
  } else if (normalizedFeeAmount > 0) {
    const existingAmount = Number(existingRoute?.monthly_fee ?? existingRoute?.fee_amount ?? 0);
    if (existingAmount !== normalizedFeeAmount) {
      await supabaseAdmin
        .from('transport_routes')
        .update({
          fee_amount: normalizedFeeAmount,
          monthly_fee: normalizedFeeAmount,
        })
        .eq('id', routeId)
        .eq('school_id', schoolId);
    }
  }

  if (routeId) {
    await supabaseAdmin
      .from('students')
      .update({ transport_route_id: routeId })
      .eq('id', studentId)
      .eq('school_id', schoolId);

    if (normalizedFeeAmount > 0) {
      const dueDate = new Date();
      dueDate.setDate(10);
      const title = `${routeLabel} - Monthly Transport Fee - ${monthLabel}`;
      const { data: existingFee } = await supabaseAdmin
        .from('fee_payments')
        .select('id')
        .eq('student_id', studentId)
        .eq('transport_route_id', routeId)
        .eq('title', title)
        .maybeSingle();

      if (!existingFee) {
        const feeRow = {
          school_id: schoolId,
          student_id: studentId,
          transport_route_id: routeId,
          academic_year_id: opts?.academicYearId || null,
          amount: normalizedFeeAmount,
          paid_amount: 0,
          status: 'pending',
          payment_method: 'unpaid',
          due_date: dueDate.toISOString().split('T')[0],
          late_fee: 0,
          title,
          remarks: `Transport fee for ${monthLabel}`,
        };
        if (opts?.pendingFeeRows) {
          // Defer the insert so a large bulk import can flush transport fees
          // in bounded 500-row chunks instead of one giant request.
          opts.pendingFeeRows.push(feeRow);
        } else {
          await supabaseAdmin.from('fee_payments').insert(feeRow);
        }
      }
    }
  }

  return routeId;
}

async function ensureParentForStudent(opts: {
  schoolId: string;
  uniqueSuffix: string;
  fatherName?: string;
  motherName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  studentEmail?: string;
  lastName?: string;
  parentPassword: string;
  academicYearId?: string;
}): Promise<{ parentId: string | null; parentEmail: string; parentAuthEmail: string; parentUserId: string | null; parentLoginId?: string | null }> {
  const {
    schoolId, uniqueSuffix, fatherName, motherName, guardianPhone, guardianEmail,
    studentEmail, lastName, parentPassword, academicYearId
  } = opts;

  const shouldCreate = fatherName || motherName || guardianPhone || guardianEmail;

  const parentLoginId = `PAR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const parentAuthEmail = `${parentLoginId.toLowerCase().replace(/-/g, '')}@kautix.local`;
  const displayEmail = guardianEmail || parentAuthEmail;

  if (!shouldCreate) {
    return { parentId: null, parentEmail: displayEmail, parentAuthEmail, parentUserId: null, parentLoginId: null };
  }

  const formattedPhone = formatPhone(guardianPhone);
  let existingUserId: string | null = null;

  if (formattedPhone) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('school_id', schoolId)
      .eq('role', 'parent')
      .eq('phone', formattedPhone)
      .maybeSingle();
    if (data) existingUserId = data.id;
  }
  if (!existingUserId && guardianEmail) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('school_id', schoolId)
      .eq('role', 'parent')
      .or(`email.eq.${guardianEmail},email.eq.${parentAuthEmail}`)
      .maybeSingle();
    if (data) existingUserId = data.id;
  }

  if (existingUserId) {
    const { data: profile } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('user_id', existingUserId)
      .maybeSingle();
    return { parentId: profile?.id || null, parentEmail: displayEmail, parentAuthEmail, parentUserId: existingUserId, parentLoginId: null };
  }

  const { data: parentUser, error: pUserError } = await supabaseAdmin
    .from('users')
    .insert({
      school_id: schoolId,
      email: displayEmail,
      username: parentLoginId,
      phone: formattedPhone,
      role: 'parent',
      first_name: fatherName || motherName || 'Parent',
      last_name: lastName || '',
      academic_year_id: academicYearId || null,
    })
    .select()
    .single();

  if (pUserError || !parentUser) {
    return { parentId: null, parentEmail: displayEmail, parentAuthEmail, parentUserId: null, parentLoginId: null };
  }

  const { data: authParent, error: authPError } = await supabaseAdmin.auth.admin.createUser({
    email: parentAuthEmail,
    password: parentPassword,
    email_confirm: true,
    user_metadata: {
      role: 'parent',
      school_id: schoolId,
      contact_email: guardianEmail || null,
    },
  });

  if (authPError) {
    await supabaseAdmin.from('users').delete().eq('id', parentUser.id);
    return { parentId: null, parentEmail: displayEmail, parentAuthEmail, parentUserId: null, parentLoginId: null };
  }

  if (authParent) {
    await supabaseAdmin.from('users').update({ auth_id: authParent.user.id }).eq('id', parentUser.id);
  }

  const { data: newParentProfile, error: profileErr } = await supabaseAdmin
    .from('parents')
    .insert({ user_id: parentUser.id, school_id: schoolId })
    .select()
    .single();

  if (profileErr) {
    if (authParent) await supabaseAdmin.auth.admin.deleteUser(authParent.user.id);
    await supabaseAdmin.from('users').delete().eq('id', parentUser.id);
    return { parentId: null, parentEmail: displayEmail, parentAuthEmail, parentUserId: null, parentLoginId: null };
  }

  return {
    parentId: newParentProfile?.id || null,
    parentEmail: displayEmail,
    parentAuthEmail,
    parentUserId: parentUser.id,
    parentLoginId,
  };
}

// Get all students (with filters)
export async function getStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      class_id,
      section_id,
      search,
      page = '1',
      limit = '20',
      status = 'active',
      risk_level, // Actionable filter
      attendance_low, // < 75%
      has_dues, // fee defaulters
      academic_year_id,
      sort_by = 'roll_number',
      sort_order = 'asc'
    } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const fetchStudentsChunk = async (currentOffset: number, chunkLimit: number) => {
      let q = supabaseAdmin
        .from('students')
        .select(`
          *,
          user:users!inner(id, email, first_name, last_name, phone, avatar_url, is_active),
          section:sections(id, name, class:classes(id, name, grade))
        `, { count: 'exact' })
        .eq('school_id', req.user!.school_id);

      if (req.user!.role === 'parent') {
        const { data: parent } = await supabaseAdmin
          .from('parents')
          .select('id')
          .eq('user_id', req.user!.id)
          .maybeSingle();
        if (!parent) return null;
        const { data: links } = await supabaseAdmin
          .from('parent_students')
          .select('student_id')
          .eq('parent_id', parent.id);
        const childIds = links?.map(l => l.student_id) || [];
        if (childIds.length === 0) return null;
        q = q.in('id', childIds);
      } else if (req.user!.role === 'student') {
        q = q.eq('user_id', req.user!.id);
      } else if (req.user!.role === 'teacher') {
        const { data: teacher } = await supabaseAdmin
          .from('teachers')
          .select('id')
          .eq('user_id', req.user!.id)
          .maybeSingle();
        const teacherId = teacher?.id;
        const { data: classSections } = await supabaseAdmin
          .from('sections')
          .select('id')
          .eq('class_teacher_id', req.user!.id);
        const { data: timetableSections } = await supabaseAdmin
          .from('timetable_slots')
          .select('section_id')
          .eq('teacher_id', teacherId || req.user!.id);
        const allowedSectionIds = new Set([
          ...(classSections?.map(s => s.id) || []),
          ...(timetableSections?.map(t => t.section_id) || [])
        ]);
        if (allowedSectionIds.size === 0) return null;
        q = q.in('section_id', Array.from(allowedSectionIds));
      }

      if (status === 'active') q = q.filter('user.is_active', 'eq', true);
      if (status === 'inactive') q = q.filter('user.is_active', 'eq', false);
      if (risk_level) q = q.eq('risk_level', risk_level);
      if (attendance_low === 'true') q = q.lt('attendance_percentage', 75);
      if (academic_year_id) q = q.eq('academic_year_id', academic_year_id as string);

      if (search && String(search).trim()) {
        const term = String(search).trim().replace(/"/g, '""');
        const { data: matchingUsers } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('school_id', req.user!.school_id)
          .or(`first_name.ilike."%${term}%",last_name.ilike."%${term}%",email.ilike."%${term}%"`);
        const userIds = (matchingUsers || []).map((user: any) => user.id);
        const matches = [`admission_number.ilike."%${term}%"`];
        if (userIds.length) matches.push(`user_id.in.(${userIds.join(',')})`);
        if (/^\d+$/.test(term)) matches.push(`roll_number.eq.${Number(term)}`);
        q = q.or(matches.join(','));
      }

      if (section_id) {
        q = q.eq('section_id', section_id as string);
      } else if (class_id) {
        const { data: classSections } = await supabaseAdmin.from('sections').select('id').eq('class_id', class_id as string);
        const sectionIds = classSections?.map(s => s.id) || [];
        if (sectionIds.length === 0) return null;
        q = q.in('section_id', sectionIds);
      }
      const sortColumn = ['roll_number', 'admission_date', 'created_at', 'admission_number'].includes(sort_by as string)
        ? sort_by as string
        : 'roll_number';
      return await q
        .order(sortColumn, { ascending: sort_order !== 'desc', nullsFirst: false })
        .range(currentOffset, currentOffset + chunkLimit - 1);
    };

    const limitNum = parseInt(limit as string);
    if (limitNum > 1000) {
      let allData: any[] = [];
      let currentOffset = offset;
      let totalCount = 0;

      while (true) {
        const chunkRes = await fetchStudentsChunk(currentOffset, 1000);
        if (!chunkRes) return res.json({ students: [], total: 0, page: 1, totalPages: 0 });
        const { data, error, count } = chunkRes;
        if (error) return res.status(400).json({ error: error.message });
        if (!totalCount) totalCount = count || 0;

        if (data && data.length > 0) {
          allData.push(...data);
          currentOffset += data.length;
        }

        if (!data || data.length < 1000 || allData.length >= limitNum) {
          break;
        }
      }

      return res.json({
        students: allData.slice(0, limitNum),
        total: totalCount,
        page: parseInt(page as string),
        totalPages: Math.ceil((totalCount || 0) / limitNum),
      });
    }

    const resChunk = await fetchStudentsChunk(offset, limitNum);
    if (!resChunk) return res.json({ students: [], total: 0, page: 1, totalPages: 0 });
    const { data, error, count } = resChunk;

    if (error) return res.status(400).json({ error: error.message });

    return res.json({
      students: data,
      total: count,
      page: parseInt(page as string),
      totalPages: Math.ceil((count || 0) / limitNum),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch students' });
  }
}

// Historical enrollment roster for a given academic year.
// A promoted student's live row is MOVED to the new academic year (Class 10),
// so by default the previous year's class (Class 9) appears empty. Promotions are
// still recorded in `student_promotions` (from_section_id + from_academic_year_id).
// This endpoint rebuilds the CLASS roster FOR A SPECIFIC ACADEMIC YEAR by combining:
//   - students who are STILL enrolled in that year/class (repeat / not moved)
//   - students who were in that class that year but have since been promoted away
// Each historical student carries the class/section they were in THAT year, so the
// admin can pick "2026-27 → Class 9" and still see everyone who studied there.
export async function getHistoricalStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { academic_year_id, class_id } = req.query;
    if (!academic_year_id) {
      return res.status(400).json({ error: 'academic_year_id is required' });
    }
    const yearId = String(academic_year_id);
    const classId = class_id ? String(class_id) : null;

    // ── 1. Students STILL enrolled in this year/class (repeat / pending) ──
    let q = supabaseAdmin
      .from('students')
      .select(`
        *,
        user:users!inner(id, email, first_name, last_name, phone, avatar_url, is_active),
        section:sections(id, name, class:classes(id, name, grade))
      `)
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('status', 'active');

    if (classId) {
      const { data: secs } = await supabaseAdmin.from('sections').select('id').eq('class_id', classId);
      const sectionIds = secs?.map((s: any) => s.id) || [];
      if (sectionIds.length === 0) q = q.eq('id', '00000000-0000-0000-0000-000000000000');
      else q = q.in('section_id', sectionIds);
    }
    const { data: currentRows, error: curErr } = await q;
    if (curErr) return res.status(400).json({ error: curErr.message });
    (currentRows || []).forEach((s: any) => { s.is_historical = false; });

    // ── 2) Promotions that ORIGINATED in this academic year ──
    const { data: promos, error: promErr } = await supabaseAdmin
      .from('student_promotions')
      .select('student_id, from_section_id')
      .eq('school_id', schoolId)
      .eq('from_academic_year_id', yearId);
    if (promErr) return res.status(400).json({ error: promErr.message });

    if (!promos || promos.length === 0) {
      return res.json({ historical: true, academic_year_id: yearId, students: currentRows || [] });
    }

    const fromSectionIds = Array.from(new Set(promos.map((p: any) => p.from_section_id).filter(Boolean)));
    let sectionMap = new Map<string, any>();
    if (fromSectionIds.length > 0) {
      const { data: sections } = await supabaseAdmin
        .from('sections').select('id, name, class:classes(id, name, grade)')
        .in('id', fromSectionIds);
      (sections || []).forEach((s: any) => sectionMap.set(s.id, s));
    }

    // Filter out promotions that point to a different class than the requested one
    const promoStudentIds = classId
      ? promos
          .map((p: any) => ({
            id: p.student_id,
            sec: sectionMap.get(p.from_section_id),
          }))
          .filter((x: any) => x.sec && x.sec.class?.id === classId)
          .map((x: any) => x.id)
      : promos.map((p: any) => p.student_id);

    const uniqueIds = Array.from(new Set(promoStudentIds));
    const historical: any[] = [];
    if (uniqueIds.length > 0) {
      const { data: rows, error: roErr } = await supabaseAdmin
        .from('students')
        .select(`
          *,
          user:users!inner(id, email, first_name, last_name, phone, avatar_url, is_active)
        `)
        .eq('school_id', schoolId)
        .in('id', uniqueIds);
      if (roErr) return res.status(400).json({ error: roErr.message });

      const rowMap = new Map<string, any>((rows || []).map((r: any) => [r.id, r]));
      const seen = new Set<string>();
      for (const p of promos) {
        const row = rowMap.get(p.student_id);
        const sec = p.from_section_id ? sectionMap.get(p.from_section_id) : null;
        if (!row || seen.has(p.student_id)) continue;
        seen.add(p.student_id);
        historical.push({
          ...row,
          academic_year_id: yearId,          // so year filters match this history row
          section: sec || null,               // the class/section they were in THAT year
          is_historical: true,
        });
      }
    }

    return res.json({ historical: true, academic_year_id: yearId, students: [...(currentRows || []), ...historical] });
  } catch (error: any) {
    console.error('getHistoricalStudents error:', error);
    return res.status(500).json({ error: 'Failed to fetch historical students' });
  }
}

// Get single student with full profile
export async function getStudentById(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    const { data: student, error } = await supabaseAdmin
      .from('students')
      .select(`
        *,
        user:users(*),
        section:sections(*, class:classes(*)),
        parents:parent_students(relationship, parent:parents(*, user:users(*)))
      `)
      .eq('id', id)
      .single();

    if (error || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get attendance summary
    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('status, date, remarks, marked_by:users(first_name, last_name)')
      .eq('student_id', id)
      .order('date', { ascending: false });

    const attendanceHistory = attendance?.map(a => ({
      date: new Date(a.date).toLocaleDateString(),
      status: a.status,
      markedBy: a.marked_by ? `${(a.marked_by as any).first_name} ${(a.marked_by as any).last_name}` : 'System',
      remarks: a.remarks || ''
    })) || [];

    // Exclude Sundays + school-marked holidays from the working-day count.
    const offDays = await getOffDays(req.user!.school_id, '2000-01-01', '2100-01-01');
    const workingRows = (attendance || []).filter((a: any) => !offDays.includes(String(a.date).slice(0, 10)));

    const attendanceSummary = {
      total: workingRows.length,
      present: workingRows.filter((a: any) => a.status === 'present').length || 0,
      absent: workingRows.filter((a: any) => a.status === 'absent').length || 0,
      late: workingRows.filter((a: any) => a.status === 'late').length || 0,
      percentage: 0,
    };
    attendanceSummary.percentage = attendanceSummary.total > 0
      ? Math.round((attendanceSummary.present / attendanceSummary.total) * 10000) / 100
      : 0;

    // Get fee summary
    const { data: fees } = await supabaseAdmin
      .from('fee_payments')
      .select('id, amount, paid_amount, status, created_at, remarks')
      .eq('student_id', id)
      .order('created_at', { ascending: false });

    const feeSummary = {
      totalDue: fees?.reduce((sum: number, f: any) => sum + Number(f.amount), 0) || 0,
      totalPaid: fees?.reduce((sum: number, f: any) => sum + Number(f.paid_amount || 0), 0) || 0,
      pending: fees?.filter((f: any) => f.status === 'pending' || f.status === 'overdue').length || 0,
    };

    const feeHistory = fees?.map(f => ({
      id: f.id,
      title: f.remarks || 'Academic Fee',
      amount: f.amount,
      status: f.status,
      date: new Date(f.created_at).toLocaleDateString()
    })) || [];

    // Get recent exam results
    const { data: examResults } = await supabaseAdmin
      .from('exam_results')
      .select('*, exam:exams(*, subject:subjects(name), exam_type:exam_types(name))')
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    const basePayload = {
      ...student,
      attendanceSummary,
      attendanceHistory,
      feeSummary,
      feeHistory,
      examResults: examResults || [],
    };

    const enriched = await enrichStudentProfile({ ...basePayload, examResults: examResults || [] }, id);

    return res.json({
      ...basePayload,
      ...enriched,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch student' });
  }
}

// Create student (with auto-credential generation and parent auto-mapping)
export async function createStudent(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      email, firstName, lastName, phone, sectionId, dateOfBirth, gender,
      bloodGroup, address, city, state, pincode, fatherName, motherName,
      guardianPhone, guardianEmail, emergencyContact, previousSchool,
      rollNumber, medicalConditions, allergies, generateFees, academicYearId, selectedKits,
      sendNotification, transportRouteName, transportFeeAmount, generateFeesConfirm, feeStartMonth
    } = req.body;
    const resolvedAcademicYearId = await resolveActiveAcademicYearId(req.user!.school_id, academicYearId);
    if (!resolvedAcademicYearId) {
      return res.status(400).json({ error: 'Set an active academic year before admitting students.' });
    }

    // 0. Duplicate Enrollment Check
    // Check if a student with the exact same name, parents, and section already exists
    let duplicateQuery = supabaseAdmin
      .from('students')
      .select('id, father_name, mother_name, section:sections(name, classes(name)), user:users!inner(first_name, last_name)')
      .eq('school_id', req.user!.school_id)
      .eq('section_id', sectionId)
      .ilike('user.first_name', firstName);

    const { data: possibleDuplicates } = await duplicateQuery;
    
    if (possibleDuplicates && possibleDuplicates.length > 0) {
      const isDuplicate = possibleDuplicates.some(dup => {
        const u = dup.user as any; // Handle potential array typing from Supabase
        // Note: Supabase might return user as an object or array of objects, handle both
        const userObj = Array.isArray(u) ? u[0] : u;
        const matchLast = (userObj?.last_name || '').toLowerCase() === (lastName || '').toLowerCase();
        const matchFather = (dup.father_name || '').toLowerCase() === (fatherName || '').toLowerCase();
        const matchMother = (dup.mother_name || '').toLowerCase() === (motherName || '').toLowerCase();
        return matchLast && matchFather && matchMother;
      });

      if (isDuplicate) {
        const dupRecord = possibleDuplicates[0];
        const clsName = (dupRecord.section as any)?.classes?.name || '';
        const secName = (dupRecord.section as any)?.name || '';
        return res.status(400).json({ 
          error: `Duplicate Enrollment: '${firstName} ${lastName || ''}' (Father: ${fatherName || 'N/A'}) is already enrolled in Class ${clsName} - Section ${secName}.` 
        });
      }
    }

    // 1. Generate Credentials
    // Helper: if DOB is present use DDMMYYYY as password, else generate a random strong one
    const generateRandomPassword = () => {
      const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789@#!';
      return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };
    const dobToPassword = (dob: string) => {
      if (!dob) return null;
      const parts = dob.split('-');
      if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
      return dob.replace(/\D/g, '') || null;
    };
    const dobPassword = dobToPassword(dateOfBirth);
    const studentPassword = dobPassword || generateRandomPassword();
    const isTempPassword = !dobPassword; // true if no DOB was given
    const parentPassword = studentPassword;
    const hashedPassword = await bcrypt.hash(studentPassword, 10);
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const formattedStudentPhone = formatPhone(phone);
    const formattedGuardianPhone = formatPhone(guardianPhone);
    // Auto-generate admission number using random unique string to prevent unique constraint violations
    const currentYear = new Date().getFullYear();
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const finalAdmissionNumber = `ADM-${currentYear}-${randomSuffix}`;
    const loginId = finalAdmissionNumber; // This is what they will use to login
    const authEmail = `${loginId.toLowerCase().replace(/-/g, '')}@kautix.local`;

    const realStudentEmail = email?.trim() || null;
    const realGuardianEmail = guardianEmail?.trim() || null;

    let parentId: string | null = null;
    let parentUserId: string | null = null;
    let parentEmail = realGuardianEmail || `parent_${uniqueSuffix}@kautix.local`;

    let parentResult: any = null;
    if (guardianPhone || guardianEmail || fatherName || motherName) {
      parentResult = await ensureParentForStudent({
        schoolId: req.user!.school_id,
        uniqueSuffix,
        fatherName,
        motherName,
        guardianPhone: formattedGuardianPhone || guardianPhone,
        guardianEmail,
        studentEmail: realStudentEmail || authEmail,
        lastName,
        parentPassword,
        academicYearId: resolvedAcademicYearId,
      });
      parentId = parentResult.parentId;
      parentUserId = parentResult.parentUserId;
      parentEmail = parentResult.parentEmail;
    }

    // 3. Create Student User
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        school_id: req.user!.school_id,
        email: realStudentEmail || authEmail,
        username: loginId,
        phone: formattedStudentPhone,
        role: 'student',
        first_name: firstName,
        last_name: lastName,
        academic_year_id: resolvedAcademicYearId,
        temp_password: isTempPassword ? studentPassword : null, // stored only when auto-generated (no DOB)
      })
      .select()
      .maybeSingle();

    if (userError) return res.status(400).json({ error: 'Failed to create student record. Ensure you have run the SQL to drop the unique email constraint. Error: ' + userError.message });

    // Create REAL Supabase Auth User for Student
    const { data: authStudent, error: authSTError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: studentPassword,
      email_confirm: true,
      user_metadata: { role: 'student', school_id: req.user!.school_id }
    });

    if (!authSTError && authStudent) {
      await supabaseAdmin.from('users').update({ auth_id: authStudent.user.id }).eq('id', user.id);
    } else if (authSTError) {
      await supabaseAdmin.from('users').delete().eq('id', user.id);
      const msg = authSTError.message?.includes('already') || authSTError.message?.includes('registered')
        ? 'Registration failed: this email is already registered in the system.'
        : `Registration failed: ${authSTError.message}`;
      return res.status(400).json({ error: msg });
    }

    // 4. Create Student Profile
    // fee_start_month controls when recurring fees begin. Format 'YYYY-MM'.
    // If the admin chose to skip the current month (e.g. "Start charging from
    // September"), we store that here so auto-generation and admission pushes
    // only bill from that month onward.
    const effectiveFeeStartMonth = feeStartMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { data: student, error } = await supabaseAdmin
      .from('students')
      .insert({
        user_id: user.id,
        school_id: req.user!.school_id,
        section_id: sectionId,
        academic_year_id: resolvedAcademicYearId,
        admission_number: finalAdmissionNumber,
        roll_number: rollNumber,
        date_of_birth: dateOfBirth,
        gender,
        blood_group: bloodGroup,
        address,
        city,
        state,
        pincode,
        father_name: fatherName,
        mother_name: motherName,
        guardian_phone: formattedGuardianPhone || guardianPhone,
        guardian_email: guardianEmail,
        emergency_contact: emergencyContact,
        fee_start_month: effectiveFeeStartMonth,
        is_active: true,
      })
      .select()
      .maybeSingle();

    if (error) {
      if (authStudent) await supabaseAdmin.auth.admin.deleteUser(authStudent.user.id);
      await supabaseAdmin.from('users').delete().eq('id', user.id);
      return res.status(400).json({ error: error.message });
    }

    // 5. Link Parent and Student
    if (parentId && student) {
      await supabaseAdmin.from('parent_students').insert({
        parent_id: parentId,
        student_id: student.id,
        relationship: fatherName ? 'father' : 'guardian'
      });
    }

    if (student) {
      await ensureTransportRouteAssignment(req.user!.school_id, student.id, transportRouteName, transportFeeAmount, {
        academicYearId: resolvedAcademicYearId,
      });
    }

    // 5.5 Check Class Inventory Requirements and Generate Auto-Fees
    if (student) {
      try {
        const { data: sectionData } = await supabaseAdmin
          .from('sections')
          .select('class_id')
          .eq('id', sectionId)
          .single();

        if (sectionData?.class_id) {
          const { data: requirements } = await supabaseAdmin
            .from('class_inventory_requirements')
            .select('*, school_inventory(*)')
            .eq('class_id', sectionData.class_id);

          if (requirements && requirements.length > 0) {
            const distributions: any[] = [];
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 10);

            for (const requirement of requirements) {
              const item = requirement.school_inventory as any;
              if (!item) continue;

              const price = item.selling_price || item.unit_price || 0;

              if (price > 0) {
                // Create inventory fee through centralized system
                const { data: fee } = await supabaseAdmin.from('fee_payments' as any).insert({
                  school_id: req.user!.school_id,
                  student_id: student.id,
                  amount: price * requirement.quantity,
                  paid_amount: 0,
                  status: 'pending',
                  title: `Inventory Issue: ${item.name}`,
                  remarks: `Issued ${requirement.quantity}x ${item.name} (Auto-assigned at admission)`,
                  due_date: dueDate.toISOString(),
                  fee_structure_id: null, // One-time fee
                  academic_year_id: resolvedAcademicYearId,
                  payment_method: 'unpaid',
                  late_fee: 0,
                }).select('id').single();

                if (fee) {
                  distributions.push({
                    school_id: req.user!.school_id,
                    student_id: student.id,
                    item_id: requirement.item_id,
                    academic_year_id: resolvedAcademicYearId,
                    quantity: requirement.quantity,
                    status: 'pending',
                    remarks: 'Auto-assigned at admission',
                    fee_payment_id: fee.id
                  });
                }
              }
            }

            if (distributions.length > 0) {
              await supabaseAdmin.from('student_inventory_distribution' as any).insert(distributions);
            }
          }
        }
      } catch (invErr) {
        console.error('Failed to auto-assign inventory requirements:', invErr);
      }
    }

    // 5.6 Assign Selected Kits from Registration
    if (student && selectedKits && Array.isArray(selectedKits) && selectedKits.length > 0) {
      try {
        const { data: kitItems } = await supabaseAdmin
          .from('inventory_kit_items')
          .select('*, school_inventory(*)')
          .in('kit_id', selectedKits);

        if (kitItems && kitItems.length > 0) {
          const distributions: any[] = [];
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 10);

          for (const ki of kitItems) {
            const item = ki.school_inventory as any;
            if (!item) continue;

            const price = item.selling_price || item.unit_price || 0;

            if (price > 0) {
              // Create kit fee through centralized system
              const { data: fee } = await supabaseAdmin.from('fee_payments' as any).insert({
                school_id: req.user!.school_id,
                student_id: student.id,
                amount: price * ki.quantity,
                paid_amount: 0,
                status: 'pending',
                title: `Kit Issue: ${item.name}`,
                remarks: `Issued ${ki.quantity}x ${item.name} via Kit at admission`,
                due_date: dueDate.toISOString(),
                fee_structure_id: null, // One-time fee
                academic_year_id: resolvedAcademicYearId,
                payment_method: 'unpaid',
                late_fee: 0,
              }).select('id').single();

              if (fee) {
                distributions.push({
                  school_id: req.user!.school_id,
                  student_id: student.id,
                  item_id: ki.item_id,
                  academic_year_id: resolvedAcademicYearId,
                  quantity: ki.quantity,
                  status: 'pending',
                  remarks: 'Assigned via kit at admission',
                  fee_payment_id: fee.id
                });
              }
            }
          }

          if (distributions.length > 0) {
            await supabaseAdmin.from('student_inventory_distribution' as any).insert(distributions);
          }
        }
      } catch (kitErr) {
        console.error('Failed to auto-assign inventory kits:', kitErr);
      }
    }

    // 6. Send Comprehensive Credentials via WhatsApp + Email

    // Build rich detail message
    const className = student?.section?.class?.name || 'Assigned';
    const sectionName2 = student?.section?.name || '';
    const detailMsg = `🎓 KAUTIX ACADEMY — New Student Enrolled

👤 Student: ${firstName} ${lastName}
📚 Class: ${className}-${sectionName2} | Roll: ${rollNumber || 'Auto'}
🩸 Blood Group: ${bloodGroup || 'N/A'}
📅 DOB: ${dateOfBirth || 'N/A'}
🏠 Address: ${address || 'N/A'}

👨 Father: ${fatherName || 'N/A'}
👩 Mother: ${motherName || 'N/A'}
📞 Guardian: ${formattedGuardianPhone || guardianPhone || 'N/A'}

🔐 Student Login:
   Login ID: ${loginId}
   Pass: ${studentPassword}

🔐 Parent Login:
   Login ID: ${parentResult?.parentLoginId || 'Existing parent account'}
   Pass: ${parentResult?.parentLoginId ? parentPassword : 'Use existing password'}

🌐 Portal: https://kautix.in/login

— Kautix Academy`;

    const detailHtml = `
<div style="font-family:'Inter',Arial,sans-serif;max-width:650px;margin:0 auto;color:#1e293b">
  <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:40px;border-radius:20px 20px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:32px;font-weight:900">KAUTIX ACADEMY</h1>
    <p style="color:#bfdbfe;margin-top:8px;letter-spacing:3px;font-size:11px;font-weight:700">NEW STUDENT ENROLLMENT CONFIRMATION</p>
  </div>
  <div style="padding:40px;border:1px solid #e2e8f0;border-top:none;background:white">
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px">Welcome to the Kautix Family!</h2>
    <p>Dear <strong>${fatherName || 'Parent'}</strong>,</p>
    <p>Your ward <strong>${firstName} ${lastName}</strong> has been successfully enrolled. Below are all details:</p>
    
    <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
      <tr style="background:#f8fafc"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Student Name</td><td style="padding:12px;border:1px solid #e2e8f0">${firstName} ${lastName}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Admission #</td><td style="padding:12px;border:1px solid #e2e8f0">${finalAdmissionNumber}</td></tr>
      <tr style="background:#f8fafc"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Class & Section</td><td style="padding:12px;border:1px solid #e2e8f0">${className}-${sectionName2}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Roll Number</td><td style="padding:12px;border:1px solid #e2e8f0">${rollNumber || 'Auto-assigned'}</td></tr>
      <tr style="background:#f8fafc"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Blood Group</td><td style="padding:12px;border:1px solid #e2e8f0;color:#dc2626;font-weight:700">${bloodGroup || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Date of Birth</td><td style="padding:12px;border:1px solid #e2e8f0">${dateOfBirth || 'Not specified'}</td></tr>
      <tr style="background:#f8fafc"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Father</td><td style="padding:12px;border:1px solid #e2e8f0">${fatherName || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Mother</td><td style="padding:12px;border:1px solid #e2e8f0">${motherName || 'N/A'}</td></tr>
      <tr style="background:#f8fafc"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Student Phone</td><td style="padding:12px;border:1px solid #e2e8f0">${formattedStudentPhone || phone || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Guardian Phone</td><td style="padding:12px;border:1px solid #e2e8f0">${formattedGuardianPhone || guardianPhone || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Address</td><td style="padding:12px;border:1px solid #e2e8f0">${address || 'N/A'}</td></tr>
    </table>

    <div style="background:#eff6ff;padding:24px;border-radius:16px;margin:24px 0;border:1px solid #bfdbfe">
      <h3 style="margin:0 0 16px 0;color:#1e40af;font-size:16px">🔐 Login Credentials</h3>
      <div style="margin-bottom:12px"><strong>Student Login:</strong><br>Email: <code style="background:#dbeafe;padding:4px 8px;border-radius:4px">${realStudentEmail || authEmail}</code><br>Password: <code style="background:#dbeafe;padding:4px 8px;border-radius:4px">${studentPassword}</code></div>
      <div><strong>Parent Login:</strong><br>Email: <code style="background:#dbeafe;padding:4px 8px;border-radius:4px">${parentEmail}</code><br>Password: <code style="background:#dbeafe;padding:4px 8px;border-radius:4px">${parentPassword}</code></div>
    </div>

    <a href="https://kautix.in/login" style="display:block;background:#0f172a;color:white;padding:18px;border-radius:14px;text-decoration:none;text-align:center;font-weight:800;font-size:14px;letter-spacing:1px">ACCESS PORTAL →</a>
    <p style="color:#94a3b8;font-size:11px;margin-top:32px;text-align:center">© 2026 Kautix Academy. This is an automated enrollment confirmation.</p>
  </div>
</div>`;

    if (sendNotification) {
      if (parentEmail || formattedGuardianPhone || guardianPhone) {
        await notificationService.sendMultiChannel({
          schoolId: req.user!.school_id,
          userId: parentUserId || undefined,
          channels: ['email', 'whatsapp'],
          type: 'enrollment_confirmation',
          title: `${firstName} ${lastName} — Enrollment Confirmed | Kautix Academy`,
          message: detailMsg,
          phone: formattedGuardianPhone || guardianPhone || undefined,
          emailAddress: parentEmail,
          htmlContent: detailHtml,
        });
      }

      await notificationService.sendMultiChannel({
        schoolId: req.user!.school_id,
        userId: user.id,
        channels: ['email', 'whatsapp'],
        type: 'enrollment_confirmation',
        title: `Welcome ${firstName}! Your Kautix Student Account is Ready`,
        message: detailMsg,
        phone: formattedStudentPhone || undefined,
        emailAddress: realStudentEmail || undefined,
        htmlContent: detailHtml,
      });
    }

    // Create student wallet
    await supabaseAdmin.from('student_wallets').insert({ student_id: student.id });

    // Admission Wizard Fee Generation
    // ─────────────────────────────────────────────────────────
    // RULE:
    //   - Fee start = current month → generate fees NOW at admission
    //   - Fee start = future month  → do NOT generate now; cron will
    //     auto-bill when that month arrives
    // ─────────────────────────────────────────────────────────
    let feeGenerationResult: any = null;
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonthStart = effectiveFeeStartMonth === currentMonth;

    if (generateFees && Array.isArray(generateFees) && generateFees.length > 0 && student && isCurrentMonthStart) {
      console.log('[FEE] Start month is current month — generating fees at admission:', { studentId: student.id, month: currentMonth });

      try {
        const { generateFeesForMonth } = require('../services/fee_generation.service');
        const feeResult = await generateFeesForMonth({
          schoolId: req.user!.school_id,
          month: currentMonth,
          structureIds: generateFees,
          studentIds: [student.id],
          force: false,
        });
        console.log('[FEE] Admission fee result:', JSON.stringify(feeResult));
        feeGenerationResult = feeResult;

        if (parentUserId && sendNotification && feeResult.generated > 0) {
          await notificationService.createInAppNotification({
            schoolId: req.user!.school_id,
            userId: parentUserId,
            type: 'fee_reminder',
            title: `Fee generated for ${firstName} ${lastName}`,
            message: `${feeResult.generated} fee(s) have been assigned for this month. Please check the fee portal.`,
            metadata: { studentId: student.id },
          });
        }
      } catch (feeErr: any) {
        console.error('[FEE] Error generating fees at admission:', feeErr.message);
        feeGenerationResult = { generated: 0, skipped: 0, errors: [feeErr.message] };
      }
    } else if (generateFees?.length > 0 && !isCurrentMonthStart) {
      console.log('[FEE] Start month is future — skipping admission fee generation. Cron will bill from', effectiveFeeStartMonth);
      feeGenerationResult = { generated: 0, skipped: generateFees.length, details: [`Fee start is ${effectiveFeeStartMonth} — cron will generate fees from that month`] };
    } else {
      console.log('[FEE] No fee structures selected — skipping fee generation');
    }
    await supabaseAdmin.from('student_portfolios').insert({ student_id: student!.id });
    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      school_id: req.user!.school_id,
      user_id: req.user!.id,
      action: 'student_created_with_automapping',
      entity_type: 'student',
      entity_id: student!.id,
      new_data: { firstName, lastName, admissionNumber: finalAdmissionNumber, parentLinked: !!parentId },
    });

    return res.status(201).json({ ...student!, credentials_generated: true, parent_mapped: !!parentId, temp_password: isTempPassword ? studentPassword : null, login_id: loginId, fees_generated: feeGenerationResult?.generated ?? 0, fees_skipped: feeGenerationResult?.skipped ?? 0, fee_details: feeGenerationResult?.details ?? [] });
  } catch (error: any) {
    console.error('Create student error:', error);
    return res.status(500).json({ error: 'Failed to create student' });
  }
}

// Helper function for date parsing
function parseDateString(dateStr: any): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  // Is it already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try DD-MM-YYYY or DD/MM/YYYY or MM/DD/YYYY
  const dmMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmMatch) {
    let part1 = parseInt(dmMatch[1], 10);
    let part2 = parseInt(dmMatch[2], 10);
    const year = dmMatch[3];

    // Assume DD-MM-YYYY by default, but if part2 is > 12, it must be MM-DD-YYYY
    let day = part1;
    let month = part2;
    if (month > 12 && day <= 12) {
      day = part2;
      month = part1;
    }

    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  // Fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

// Bulk create students
export async function bulkCreateStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const { students, generateFees, sendNotification } = req.body;
    if (!Array.isArray(students)) {
      return res.status(400).json({ error: 'Expected an array of students' });
    }

    // Prevent a single request from attempting 5000+ student enrollments at once,
    // which would flood Supabase/Auth and risk timeouts. Clients should upload in
    // smaller batches; this also keeps transport-fee inserts bounded.
    const MAX_BULK_STUDENTS = 5000;
    if (students.length > MAX_BULK_STUDENTS) {
      return res.status(413).json({
        error: `A maximum of ${MAX_BULK_STUDENTS} students can be imported per request. Please upload in chunks.`,
      });
    }

    // Shared queue so transport-fee rows created during the import are flushed in
    // bounded 500-row batches (see flushBulkInsertRows) instead of one giant insert.
    const pendingTransportFeeRows: any[] = [];
    // Batch queue for student transport_route_id updates (flushed in bulk at the end)
    const pendingRouteUpdates: { studentId: string; routeId: string }[] = [];
    // Track which (student_id, route_id, title) fee rows already exist to avoid
    // per-student fee_payments existence checks during the loop.
    const existingFeeKeys = new Set<string>();
    const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    // ── Pre-fetch everything once to avoid per-student DB round-trips ──
    const schoolId = req.user!.school_id;

    // Pre-fetch sections and enrollments to track capacity
    const { data: allSections } = await supabaseAdmin
      .from('sections')
      .select('id, capacity, class_id(school_id)')
      .eq('class_id.school_id', schoolId);

    const { data: allSchoolStudents } = await supabaseAdmin
      .from('students')
      .select('section_id')
      .eq('school_id', schoolId);

    const sectionTracker: Record<string, { capacity: number, current: number }> = {};
    if (allSections) {
      allSections.forEach((s: any) => {
        sectionTracker[s.id] = { capacity: s.capacity || 0, current: 0 };
      });
    }
    if (allSchoolStudents) {
      allSchoolStudents.forEach((s: any) => {
        if (s.section_id && sectionTracker[s.section_id]) {
          sectionTracker[s.section_id].current++;
        }
      });
    }

    // Pre-fetch all sections with class names for fast resolution
    const { data: allSectionsDetailed } = await supabaseAdmin
      .from('sections')
      .select('id, name, class_id, class:classes(id, name)')
      .eq('class_id.school_id', schoolId);

    // Build a lookup map: "classname|sectionname" -> section_id (case-insensitive)
    // Also store normalized variants (strip "class" prefix, spaces, etc.)
    const sectionLookup = new Map<string, string>();
    const sectionFuzzyList: { id: string; clsName: string; secName: string }[] = [];
    (allSectionsDetailed || []).forEach((sec: any) => {
      const clsName = String(sec.class?.name || '').trim().toLowerCase();
      const secName = String(sec.name || '').trim().toLowerCase();
      if (clsName && secName) {
        sectionLookup.set(`${clsName}|${secName}`, sec.id);
        // Also store normalized variants (strip "class" prefix, spaces, etc.)
        const normCls = clsName.replace(/^class\s*/i, '').replace(/\s+/g, '').toLowerCase();
        const normSec = secName.replace(/\s+/g, '').toLowerCase();
        sectionLookup.set(`${normCls}|${normSec}`, sec.id);
        sectionFuzzyList.push({ id: sec.id, clsName, secName });
      }
      // Also allow lookup by section ID directly
      sectionLookup.set(sec.id, sec.id);
    });

    // Pre-fetch active academic year once
    const { data: activeYear } = await supabaseAdmin
      .from('academic_years')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .order('start_date', { ascending: false })
      .maybeSingle();
    const activeAcademicYearId = activeYear?.id || null;

    // Pre-fetch all transport routes for this school once
    const { data: allRoutes } = await supabaseAdmin
      .from('transport_routes')
      .select('id, name, route_name, fee_amount, monthly_fee')
      .eq('school_id', schoolId);
    const routeLookup = new Map<string, any>();
    (allRoutes || []).forEach((r: any) => {
      const name = String(r.name || r.route_name || '').trim().toLowerCase();
      if (name) routeLookup.set(name, r);
      const amount = Number(r.monthly_fee ?? r.fee_amount ?? 0);
      if (amount > 0) routeLookup.set(`amt:${amount}`, r);
    });

    // Pre-fetch all existing users for duplicate check (name/phone/email-based)
    // PostgREST defaults to a max of 1000 rows per request. Schools with >1000
    // students would silently miss the rest, causing transport uploads to report
    // "student not found." We fetch in pages of 1000 to guarantee ALL rows load.
    const PAGE_SIZE = 1000;
    let allUsers: any[] = [];
    {
      let page = 0;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name, phone, email')
          .eq('school_id', schoolId)
          .eq('role', 'student')
          .range(from, to);
        if (!data || data.length === 0) break;
        allUsers = allUsers.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const userByName = new Map<string, string[]>();
    const userByPhone = new Map<string, string>();
    const userByEmail = new Map<string, string>();
    (allUsers || []).forEach((u: any) => {
      const key = `${String(u.first_name || '').trim().toLowerCase()}|${String(u.last_name || '').trim().toLowerCase()}`;
      if (!userByName.has(key)) userByName.set(key, []);
      userByName.get(key)!.push(u.id);
      if (u.phone) {
        const cleanPhone = String(u.phone).replace(/\D/g, '');
        if (cleanPhone.length >= 10) userByPhone.set(cleanPhone.slice(-10), u.id);
      }
      if (u.email) {
        const cleanEmail = String(u.email).trim().toLowerCase();
        if (cleanEmail && !cleanEmail.includes('@kautix.local')) userByEmail.set(cleanEmail, u.id);
      }
    });

    // Pre-fetch all existing students for duplicate check
    // Include ALL fields needed for Check 7 (whole-school name matching) so we
    // never need to do per-student live DB queries during the loop.
    let allExistingStudents: any[] = [];
    {
      let page = 0;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabaseAdmin
          .from('students')
          .select('id, user_id, father_name, mother_name, section_id, admission_number, guardian_phone, guardian_email, transport_route_id')
          .eq('school_id', schoolId)
          .range(from, to);
        if (!data || data.length === 0) break;
        allExistingStudents = allExistingStudents.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const studentByUserSection = new Map<string, any>();
    const studentByAdmission = new Map<string, any>();
    const studentByGuardianPhone = new Map<string, any>();
    const studentByGuardianEmail = new Map<string, any>();
    // Map: user_id -> student (for whole-school name matching without live DB queries)
    const studentByUserId = new Map<string, any>();
    (allExistingStudents || []).forEach((st: any) => {
      const key = `${st.user_id}|${st.section_id}`;
      if (!studentByUserSection.has(key)) studentByUserSection.set(key, st);
      if (!studentByUserId.has(st.user_id)) studentByUserId.set(st.user_id, st);
      if (st.admission_number) {
        const normAdm = String(st.admission_number).trim().toLowerCase();
        if (!studentByAdmission.has(normAdm)) studentByAdmission.set(normAdm, st);
      }
      if (st.guardian_phone) {
        const cleanPhone = String(st.guardian_phone).replace(/\D/g, '');
        if (cleanPhone.length >= 10) {
          const last10 = cleanPhone.slice(-10);
          if (!studentByGuardianPhone.has(last10)) studentByGuardianPhone.set(last10, st);
        }
      }
      if (st.guardian_email) {
        const cleanEmail = String(st.guardian_email).trim().toLowerCase();
        if (cleanEmail && !cleanEmail.includes('@kautix.local')) {
          if (!studentByGuardianEmail.has(cleanEmail)) studentByGuardianEmail.set(cleanEmail, st);
        }
      }
    });

    const results: any[] = [];
    const chunkSize = 50; // Process 50 students concurrently per chunk for speed
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (studentData: any) => {
        const {
          email, firstName, lastName, phone, sectionId, className, sectionName, dateOfBirth, gender,
          bloodGroup, address, city, state, pincode, fatherName, motherName,
          guardianPhone, guardianEmail, emergencyContact, previousSchool,
          admissionNumber, rollNumber, medicalConditions, allergies, academicYear,
          transportRouteName, transportFeeAmount,
        } = studentData;

        try {
          // ── FAST PATH: resolve section from pre-fetched lookup map ──
          const normalizedClassName = className == null ? undefined : String(className).trim();
          const normalizedSectionName = sectionName == null ? undefined : String(sectionName).trim();
          if (!sectionId && (!normalizedClassName || !normalizedSectionName)) {
            throw new Error('Class and Section are required for every student row, unless an existing Section ID is provided.');
          }

          let resolvedSectionId: string | null = null;
          if (sectionId && sectionLookup.has(sectionId)) {
            resolvedSectionId = sectionId;
          } else if (normalizedClassName && normalizedSectionName) {
            const lookupKey = `${normalizedClassName.toLowerCase()}|${normalizedSectionName.toLowerCase()}`;
            resolvedSectionId = sectionLookup.get(lookupKey) || null;

            // If exact match failed, try normalized (strip "class" prefix, spaces)
            if (!resolvedSectionId) {
              const normCls = normalizedClassName.toLowerCase().replace(/^class\s*/i, '').replace(/\s+/g, '');
              const normSec = normalizedSectionName.toLowerCase().replace(/\s+/g, '');
              resolvedSectionId = sectionLookup.get(`${normCls}|${normSec}`) || null;
            }

            // If still not found, try fuzzy matching against all sections
            if (!resolvedSectionId) {
              const inputCls = normalizedClassName.toLowerCase().replace(/^class\s*/i, '').replace(/\s+/g, '');
              const inputSec = normalizedSectionName.toLowerCase().replace(/\s+/g, '');
              for (const sec of sectionFuzzyList) {
                const dbCls = sec.clsName.replace(/^class\s*/i, '').replace(/\s+/g, '');
                const dbSec = sec.secName.replace(/\s+/g, '');
                if (dbCls === inputCls && dbSec === inputSec) {
                  resolvedSectionId = sec.id;
                  break;
                }
              }
            }
          }

          // If fast-path failed, fall back to the AI resolver (handles fuzzy/partial matches)
          if (!resolvedSectionId) {
            const sectionResolution = await aiEntityResolver.resolveSection({
              schoolId,
              sectionId,
              className: normalizedClassName,
              sectionName: normalizedSectionName,
            });
            if (sectionResolution.status === 'not_found') {
              const requestedSection = normalizedClassName && normalizedSectionName
                ? `Class ${normalizedClassName}, Section ${normalizedSectionName}`
                : 'the provided Section ID';
              throw new Error(`Existing ${requestedSection} was not found in this school. No student or section was created.`);
            }
            if (sectionResolution.status === 'ambiguous') {
              throw new Error(`Class ${normalizedClassName}, Section ${normalizedSectionName} matches more than one section. Use the exact existing section name.`);
            }
            resolvedSectionId = sectionResolution.id;
          }
          if (!resolvedSectionId) {
            const requestedSection = normalizedClassName && normalizedSectionName
              ? `Class ${normalizedClassName}, Section ${normalizedSectionName}`
              : 'the provided Section ID';
            throw new Error(`Existing ${requestedSection} was not found in this school. No student or section was created.`);
          }

          // Enforce capacity limit (Temporarily disabled as per user request)
          if (sectionTracker[resolvedSectionId]) {
            const tracker = sectionTracker[resolvedSectionId];
            tracker.current++; // Keep tracking, but don't block
          }

          // ── FAST PATH: use pre-fetched active academic year ──
          let resolvedAcademicYearId: string | null = activeAcademicYearId;
          if (academicYear) {
            const { data: existingYear } = await supabaseAdmin
              .from('academic_years')
              .select('id')
              .eq('name', String(academicYear).trim())
              .eq('school_id', schoolId)
              .maybeSingle();
            if (!existingYear) throw new Error(`Academic year ${academicYear} does not exist in this school.`);
            resolvedAcademicYearId = existingYear.id;
          }
          if (!resolvedAcademicYearId) {
            throw new Error('Set an active academic year before importing students.');
          }

          // ── FAST PATH: duplicate check using pre-fetched maps ──
          // Check by multiple identifiers to prevent duplicate student profiles:
          // 1. Name + Section + Father name
          // 2. Student phone
          // 3. Student email
          // 4. Guardian phone
          // 5. Guardian email
          // 6. Admission number
          // 7. **Name + Section ONLY** (lenient fallback for transport-fee-only uploads)
          let dupStudent: any = null;
          let dupReason = '';

          // Check 1: Name + Section + Father name
          if (!dupStudent && firstName && lastName) {
            const nameKey = `${String(firstName).trim().toLowerCase()}|${String(lastName).trim().toLowerCase()}`;
            const matchingUserIds = userByName.get(nameKey) || [];

            for (const uid of matchingUserIds) {
              const existing = studentByUserSection.get(`${uid}|${resolvedSectionId}`);
              if (existing) {
                if (fatherName) {
                  const existingFather = String(existing.father_name || '').trim().toLowerCase();
                  const newFather = String(fatherName).trim().toLowerCase();
                  if (existingFather && (existingFather.includes(newFather) || newFather.includes(existingFather))) {
                    dupStudent = existing;
                    dupReason = 'same name, section, and father';
                    break;
                  }
                } else {
                  dupStudent = existing;
                  dupReason = 'same name and section';
                  break;
                }
              }
            }
          }

          // Check 2: Student phone
          if (!dupStudent && phone) {
            const cleanPhone = String(phone).replace(/\D/g, '');
            if (cleanPhone.length >= 10) {
              const uid = userByPhone.get(cleanPhone.slice(-10));
              if (uid) {
                const existing = studentByUserSection.get(`${uid}|${resolvedSectionId}`);
                if (existing) {
                  dupStudent = existing;
                  dupReason = 'same student phone number';
                }
              }
            }
          }

          // Check 3: Student email
          if (!dupStudent && email) {
            const cleanEmail = String(email).trim().toLowerCase();
            if (cleanEmail && !cleanEmail.includes('@kautix.local')) {
              const uid = userByEmail.get(cleanEmail);
              if (uid) {
                const existing = studentByUserSection.get(`${uid}|${resolvedSectionId}`);
                if (existing) {
                  dupStudent = existing;
                  dupReason = 'same student email';
                }
              }
            }
          }

          // Check 4: Guardian phone
          if (!dupStudent && guardianPhone) {
            const cleanPhone = String(guardianPhone).replace(/\D/g, '');
            if (cleanPhone.length >= 10) {
              const existing = studentByGuardianPhone.get(cleanPhone.slice(-10));
              if (existing) {
                dupStudent = existing;
                dupReason = 'same guardian phone number';
              }
            }
          }

          // Check 5: Guardian email
          if (!dupStudent && guardianEmail) {
            const cleanEmail = String(guardianEmail).trim().toLowerCase();
            if (cleanEmail && !cleanEmail.includes('@kautix.local')) {
              const existing = studentByGuardianEmail.get(cleanEmail);
              if (existing) {
                dupStudent = existing;
                dupReason = 'same guardian email';
              }
            }
          }

          // Check 6: Admission number
          if (!dupStudent && admissionNumber) {
            const normAdm = String(admissionNumber).trim().toLowerCase();
            const existing = studentByAdmission.get(normAdm);
            if (existing) {
              dupStudent = existing;
              dupReason = 'same admission number';
            }
          }

          // ── Check 7 (TRANSPORT-FEE-SPECIFIC FIX): ──
          // If this row is a transport-route/fee-only upload (has transportRouteName
          // or transportFeeAmount) and no other duplicate check matched, fall back
          // to a LENIENT name match. We scan ALL students (not just the currently
          // resolved section) so that:
          //   - A student listed in a DIFFERENT class in the sheet still gets matched
          //   - Rows that only have name + transport route/fee (no father/phone/email)
          //     don't accidentally create a brand-new duplicate student profile.
          // Only do this when transport data is present — a pure student-enrollment
          // upload (no transport data) must keep its strict duplicate detection.
          const hasTransportData = !!(transportRouteName || (transportFeeAmount && Number(transportFeeAmount) > 0));
          if (!dupStudent && firstName && hasTransportData) {
            // Normalize the input name: trim, collapse multiple spaces, lowercase
            const normInputFirst = String(firstName).trim().replace(/\s+/g, ' ').toLowerCase();
            const normInputLast = String(lastName || '').trim().replace(/\s+/g, ' ').toLowerCase();
            const normInputFull = `${normInputFirst}${normInputLast ? ' ' + normInputLast : ''}`.trim();

            // Build candidate user IDs from multiple matching strategies:
            // 1. Exact first|last match
            // 2. Full-name match (first + last combined)
            // 3. First-name-only match (when sheet has no last name)
            // 4. Partial match (input first name is contained in DB first name, or vice versa)
            const candidateUserIds = new Set<string>();

            // Strategy 1: Exact first|last
            if (normInputLast) {
              const exactKey = `${normInputFirst}|${normInputLast}`;
              (userByName.get(exactKey) || []).forEach((uid: string) => candidateUserIds.add(uid));
            }

            // Strategy 2: Full-name match — scan all users and compare combined full name
            // Strategy 3 & 4: First-name-only and partial matches
            for (const [key, uids] of userByName.entries()) {
              const [dbFirst, dbLast] = key.split('|');
              const dbFull = `${dbFirst}${dbLast ? ' ' + dbLast : ''}`.trim();

              // Full-name match (ignoring spaces/case)
              if (normInputFull && dbFull && normInputFull === dbFull) {
                uids.forEach((uid: string) => candidateUserIds.add(uid));
                continue;
              }

              // First-name-only match (sheet has no last name, DB has same first name)
              if (!normInputLast && dbFirst === normInputFirst) {
                uids.forEach((uid: string) => candidateUserIds.add(uid));
                continue;
              }

              // Partial match: input first name is contained in DB first name
              // (e.g., sheet "ARYA" matches DB "ARYA KUMARI" or "ARYA SINGH")
              if (normInputFirst && dbFirst && dbFirst.startsWith(normInputFirst)) {
                uids.forEach((uid: string) => candidateUserIds.add(uid));
                continue;
              }

              // Partial match: DB first name is contained in input first name
              if (normInputFirst && dbFirst && normInputFirst.startsWith(dbFirst)) {
                uids.forEach((uid: string) => candidateUserIds.add(uid));
                continue;
              }

              // Partial match on full name: input full name is contained in DB full name
              if (normInputFull && dbFull && dbFull.includes(normInputFull)) {
                uids.forEach((uid: string) => candidateUserIds.add(uid));
                continue;
              }

              // Partial match: DB full name is contained in input full name
              if (normInputFull && dbFull && normInputFull.includes(dbFull)) {
                uids.forEach((uid: string) => candidateUserIds.add(uid));
                continue;
              }
            }

            // First try students in the SAME resolved section
            for (const uid of candidateUserIds) {
              const existing = studentByUserSection.get(`${uid}|${resolvedSectionId}`);
              if (existing) {
                dupStudent = existing;
                dupReason = 'same name and section (transport update)';
                break;
              }
            }

            // If not found in this section, look across the whole school using the
            // pre-fetched studentByUserId map. This catches students whose
            // class/section in the sheet differs from what's in the DB (common
            // when the sheet is an old transport register). No live DB queries.
            if (!dupStudent) {
              for (const uid of candidateUserIds) {
                const existingStudent = studentByUserId.get(uid);
                if (existingStudent) {
                  dupStudent = existingStudent;
                  dupReason = 'same student name (whole-school transport match)';
                  break;
                }
              }
            }
          }

          if (dupStudent) {
            const fatherInfo = dupStudent.father_name ? ` (Father: ${dupStudent.father_name})` : '';
            const className = normalizedClassName || '';
            const secName = normalizedSectionName || '';
            
            if (!hasTransportData) {
              // ── NORMAL IMPORT: Skip duplicates entirely ──
              results.push({
                ...studentData,
                success: false,
                status: 'skipped',
                error: `Duplicate Enrollment: Already enrolled in ${className} ${secName}${fatherInfo} — ${dupReason}.`,
              });
              return;
            }

            try {
              // ── TRANSPORT-ONLY UPLOAD: Update route ──
              const normRouteName = String(transportRouteName || '').trim().toLowerCase();
              const feeAmt = Number(transportFeeAmount || 0);
              let routeId: string | null = null;

              // Find route from pre-fetched routeLookup map
              if (normRouteName) {
                const matched = routeLookup.get(normRouteName);
                if (matched) routeId = matched.id;
              }
              if (!routeId && feeAmt > 0) {
                const matched = routeLookup.get(`amt:${feeAmt}`);
                if (matched) routeId = matched.id;
              }

              // ── CREATE ROUTE IF NOT FOUND ──
              if (!routeId && (normRouteName || feeAmt > 0)) {
                const routeLabel = normRouteName || `Auto Route ₹${feeAmt}`;
                const { data: liveRoute } = await supabaseAdmin
                  .from('transport_routes')
                  .select('id')
                  .eq('school_id', schoolId)
                  .or(`name.ilike.${encodeURIComponent(routeLabel)},route_name.ilike.${encodeURIComponent(routeLabel)}`)
                  .limit(1);
                if (liveRoute && liveRoute.length > 0) {
                  routeId = liveRoute[0].id;
                  routeLookup.set(normRouteName, liveRoute[0]);
                  if (feeAmt > 0) routeLookup.set(`amt:${feeAmt}`, liveRoute[0]);
                } else {
                  const basePayload: any = {
                    school_id: schoolId,
                    name: routeLabel,
                    route_name: routeLabel,
                    description: 'Auto-created from transport bulk import',
                    fee_amount: feeAmt || 0,
                    pickup_points: null,
                    is_active: true,
                  };
                  const { data: createdRoute, error: createErr } = await supabaseAdmin
                    .from('transport_routes')
                    .insert({ ...basePayload, monthly_fee: feeAmt || 0 })
                    .select('id')
                    .single();
                  if (createErr) {
                    if (createErr.message?.includes('monthly_fee') || createErr.message?.includes('column')) {
                      const { data: fallbackRoute } = await supabaseAdmin
                        .from('transport_routes')
                        .insert(basePayload)
                        .select('id')
                        .single();
                      routeId = fallbackRoute?.id || null;
                    } else {
                      const { data: reRoute } = await supabaseAdmin
                        .from('transport_routes')
                        .select('id')
                        .eq('school_id', schoolId)
                        .or(`name.ilike.${encodeURIComponent(routeLabel)},route_name.ilike.${encodeURIComponent(routeLabel)}`)
                        .limit(1);
                      routeId = reRoute?.[0]?.id || null;
                    }
                  } else {
                    routeId = createdRoute?.id || null;
                  }
                  if (routeId) {
                    const routeObj = { id: routeId, name: routeLabel, route_name: routeLabel, fee_amount: feeAmt || 0, monthly_fee: feeAmt || 0 };
                    routeLookup.set(normRouteName, routeObj);
                    if (feeAmt > 0) routeLookup.set(`amt:${feeAmt}`, routeObj);
                  }
                }
              }

              if (routeId) {
                pendingRouteUpdates.push({ studentId: dupStudent.id, routeId });

                if (feeAmt > 0) {
                  const title = `${String(transportRouteName || `Auto Route ₹${feeAmt}`).trim()} - Monthly Transport Fee - ${monthLabel}`;
                  const feeKey = `${dupStudent.id}|${routeId}|${title}`;
                  if (!existingFeeKeys.has(feeKey)) {
                    existingFeeKeys.add(feeKey);
                    const dueDate = new Date();
                    dueDate.setDate(10);
                    pendingTransportFeeRows.push({
                      school_id: schoolId,
                      student_id: dupStudent.id,
                      transport_route_id: routeId,
                      academic_year_id: resolvedAcademicYearId || activeAcademicYearId,
                      amount: feeAmt,
                      paid_amount: 0,
                      status: 'pending',
                      payment_method: 'unpaid',
                      due_date: dueDate.toISOString().split('T')[0],
                      late_fee: 0,
                      title,
                      remarks: `Transport fee for ${monthLabel}`,
                    });
                  }
                }
              }

              results.push({
                ...studentData,
                success: true,
                status: 'updated',
                admissionNumber: dupStudent.id,
                message: `Already enrolled in ${className} ${secName}${fatherInfo} — ${dupReason}, transport route updated`,
              });
            } catch (routeErr: any) {
              results.push({
                ...studentData,
                success: false,
                status: 'skipped',
                error: `Already enrolled in ${className} ${secName}${fatherInfo} (${dupReason}). Transport update failed: ${routeErr?.message || 'unknown error'}`,
              });
            }
            return;
          }

          // ── TRANSPORT-ONLY MODE: If this row has transport data but the student
          //    was NOT found in the system, DO NOT create a new student. The
          //    transport upload is update-only — it should never create new
          //    student profiles. Just skip the row.
          if (hasTransportData) {
            results.push({
              ...studentData,
              success: false,
              status: 'skipped',
              error: `Student "${firstName || ''} ${lastName || ''}" not found in the system. No student was created — transport upload only updates existing students.`,
            });
            return;
          }

          // Generate password: from DOB if available, otherwise random strong password
          const generateRandomPwd = () => {
            const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789@#!';
            return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
          };
          const dobToPwd = (dob: string) => {
            if (!dob) return null;
            const parts = dob.split('-');
            if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
            return dob.replace(/\D/g, '') || null;
          };
          const dobPassword = dobToPwd(dateOfBirth);
          const studentPassword = dobPassword || generateRandomPwd();
          const isTempPassword = !dobPassword;
          const parentPassword = studentPassword;

          let finalAdmissionNumber = admissionNumber ? String(admissionNumber).trim() : `STD${new Date().getFullYear()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          let loginId = finalAdmissionNumber;
          let authEmail = `${loginId.toLowerCase().replace(/-/g, '')}@kautix.local`;
          const realStudentEmail = email?.trim() || null;

          // Helper to format phone — use module-level formatPhone
          const formattedPhone = formatPhone(phone);
          const formattedGuardianPhone = formatPhone(guardianPhone);
          const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}_${Math.random().toString(36).slice(2, 6)}`;

          const parentResult = await ensureParentForStudent({
            schoolId: req.user!.school_id,
            uniqueSuffix,
            fatherName,
            motherName,
            guardianPhone: formattedGuardianPhone || undefined,
            guardianEmail,
            studentEmail: realStudentEmail || authEmail,
            lastName,
            parentPassword,
            academicYearId: resolvedAcademicYearId,
          });
          const parentId = parentResult.parentId;
          const parentEmail = parentResult.parentEmail;

          let user: any = null;
          let userError: any = null;
          let attempts = 0;

          while (attempts < 3) {
            const res = await supabaseAdmin
              .from('users')
              .insert({
                school_id: req.user!.school_id,
                email: realStudentEmail || authEmail,
                username: loginId,
                phone: formattedPhone,
                role: 'student',
                first_name: firstName || 'Unknown',
                last_name: lastName || '',
                academic_year_id: resolvedAcademicYearId,
                temp_password: isTempPassword ? studentPassword : null,
              })
              .select()
              .maybeSingle();

            if (res.error) {
              // Check if error is due to unique constraint on username
              if (res.error.code === '23505' && res.error.message.includes('users_username_key')) {
                loginId = `${finalAdmissionNumber}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                authEmail = `${loginId.toLowerCase().replace(/-/g, '')}@kautix.local`;
                attempts++;
                continue;
              }
              userError = res.error;
              break;
            }
            user = res.data;
            break; // success
          }

          if (userError) throw userError;
          if (!user) throw new Error('Failed to create student user record due to persistent username collision.');

          // Create REAL Supabase Auth User for Student
          const { data: authStudent, error: authSTError } = await supabaseAdmin.auth.admin.createUser({
            email: authEmail,
            password: studentPassword,
            email_confirm: true,
            user_metadata: { role: 'student', school_id: req.user!.school_id }
          });

          if (!authSTError && authStudent) {
            await supabaseAdmin.from('users').update({ auth_id: authStudent.user.id }).eq('id', user.id);
          }

          const parsedDOB = parseDateString(dateOfBirth);

          // Bulk imports default the fee start month to the current month so
          // auto-generation bills them from now onward. There is no separate
          // "fee start month" column in bulk — it uses the current month by
          // default, as the user requested.
          const effectiveFeeStartMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
          const { data: student, error } = await supabaseAdmin
            .from('students')
            .insert({
              user_id: user.id,
              school_id: req.user!.school_id,
              section_id: resolvedSectionId,
              admission_number: finalAdmissionNumber,
              roll_number: rollNumber,
              date_of_birth: parsedDOB,
              gender, blood_group: bloodGroup, address, city, state, pincode,
              father_name: fatherName, mother_name: motherName,
              guardian_phone: guardianPhone, guardian_email: guardianEmail,
              emergency_contact: emergencyContact,
              academic_year_id: resolvedAcademicYearId,
              fee_start_month: effectiveFeeStartMonth,
            })
            .select()
            .maybeSingle();

          if (error) throw error;

          // ── Update in-memory duplicate-check maps so subsequent rows in the
          //    same batch can detect this newly-created student and avoid
          //    creating a duplicate profile. ──
          if (student) {
            const nameKey = `${String(firstName || '').trim().toLowerCase()}|${String(lastName || '').trim().toLowerCase()}`;
            if (!userByName.has(nameKey)) userByName.set(nameKey, []);
            userByName.get(nameKey)!.push(user.id);
            if (formattedPhone) {
              const cleanPhone = String(formattedPhone).replace(/\D/g, '');
              if (cleanPhone.length >= 10) userByPhone.set(cleanPhone.slice(-10), user.id);
            }
            if (realStudentEmail && !realStudentEmail.includes('@kautix.local')) {
              userByEmail.set(realStudentEmail.trim().toLowerCase(), user.id);
            }
            studentByUserSection.set(`${user.id}|${resolvedSectionId}`, student);
            if (finalAdmissionNumber) {
              studentByAdmission.set(String(finalAdmissionNumber).trim().toLowerCase(), student);
            }
            if (guardianPhone) {
              const cleanPhone = String(guardianPhone).replace(/\D/g, '');
              if (cleanPhone.length >= 10) studentByGuardianPhone.set(cleanPhone.slice(-10), student);
            }
            if (guardianEmail) {
              const cleanEmail = String(guardianEmail).trim().toLowerCase();
              if (cleanEmail && !cleanEmail.includes('@kautix.local')) {
                studentByGuardianEmail.set(cleanEmail, student);
              }
            }
          }

          if (parentId && student) {
            await supabaseAdmin.from('parent_students').insert({
              parent_id: parentId,
              student_id: student.id,
              relationship: fatherName ? 'father' : 'guardian'
            });
          }

          if (student) {
            // ── BATCHED transport route assignment (no per-student DB queries) ──
            const normRouteName = String(transportRouteName || '').trim().toLowerCase();
            const feeAmt = Number(transportFeeAmount || 0);
            let routeId: string | null = null;

            if (normRouteName) {
              const matched = routeLookup.get(normRouteName);
              if (matched) routeId = matched.id;
            }
            if (!routeId && feeAmt > 0) {
              const matched = routeLookup.get(`amt:${feeAmt}`);
              if (matched) routeId = matched.id;
            }

            // ── CREATE ROUTE IF NOT FOUND (new student path) ──
            if (!routeId && (normRouteName || feeAmt > 0)) {
              const routeLabel = normRouteName || `Auto Route ₹${feeAmt}`;
              // Try a live DB query first (in case the route was created after pre-fetch)
              const { data: liveRoute } = await supabaseAdmin
                .from('transport_routes')
                .select('id')
                .eq('school_id', schoolId)
                .or(`name.ilike.${encodeURIComponent(routeLabel)},route_name.ilike.${encodeURIComponent(routeLabel)}`)
                .limit(1);
              if (liveRoute && liveRoute.length > 0) {
                routeId = liveRoute[0].id;
                routeLookup.set(normRouteName, liveRoute[0]);
                if (feeAmt > 0) routeLookup.set(`amt:${feeAmt}`, liveRoute[0]);
              } else {
                const basePayload: any = {
                  school_id: schoolId,
                  name: routeLabel,
                  route_name: routeLabel,
                  description: 'Auto-created from bulk import',
                  fee_amount: feeAmt || 0,
                  pickup_points: null,
                  is_active: true,
                };
                const { data: createdRoute, error: createErr } = await supabaseAdmin
                  .from('transport_routes')
                  .insert({ ...basePayload, monthly_fee: feeAmt || 0 })
                  .select('id')
                  .single();
                if (createErr) {
                  if (createErr.message?.includes('monthly_fee') || createErr.message?.includes('column')) {
                    const { data: fallbackRoute } = await supabaseAdmin
                      .from('transport_routes')
                      .insert(basePayload)
                      .select('id')
                      .single();
                    routeId = fallbackRoute?.id || null;
                  } else {
                    const { data: reRoute } = await supabaseAdmin
                      .from('transport_routes')
                      .select('id')
                      .eq('school_id', schoolId)
                      .or(`name.ilike.${encodeURIComponent(routeLabel)},route_name.ilike.${encodeURIComponent(routeLabel)}`)
                      .limit(1);
                    routeId = reRoute?.[0]?.id || null;
                  }
                } else {
                  routeId = createdRoute?.id || null;
                }
                if (routeId) {
                  const routeObj = { id: routeId, name: routeLabel, route_name: routeLabel, fee_amount: feeAmt || 0, monthly_fee: feeAmt || 0 };
                  routeLookup.set(normRouteName, routeObj);
                  if (feeAmt > 0) routeLookup.set(`amt:${feeAmt}`, routeObj);
                }
              }
            }

            if (routeId) {
              pendingRouteUpdates.push({ studentId: student.id, routeId });
              if (feeAmt > 0) {
                const title = `${String(transportRouteName || `Auto Route ₹${feeAmt}`).trim()} - Monthly Transport Fee - ${monthLabel}`;
                const feeKey = `${student.id}|${routeId}|${title}`;
                if (!existingFeeKeys.has(feeKey)) {
                  existingFeeKeys.add(feeKey);
                  const dueDate = new Date();
                  dueDate.setDate(10);
                  pendingTransportFeeRows.push({
                    school_id: schoolId,
                    student_id: student.id,
                    transport_route_id: routeId,
                    academic_year_id: resolvedAcademicYearId || activeAcademicYearId,
                    amount: feeAmt,
                    paid_amount: 0,
                    status: 'pending',
                    payment_method: 'unpaid',
                    due_date: dueDate.toISOString().split('T')[0],
                    late_fee: 0,
                    title,
                    remarks: `Transport fee for ${monthLabel}`,
                  });
                }
              }
            }
          }

          // Auto-generate fee structures if generateFees is requested
          // Bulk import defaults the billing month to the CURRENT month
          // (the same as fee_start_month stored on the student), so new
          // imports are charged starting this month.
          if (generateFees && student && resolvedSectionId) {
            try {
              const { data: sect } = await supabaseAdmin
                .from('sections')
                .select('class_id')
                .eq('id', resolvedSectionId)
                .single();

              if (sect?.class_id) {
                let structureQuery = supabaseAdmin
                  .from('fee_structures')
                  .select('*')
                  .eq('class_id', sect.class_id);
                if (resolvedAcademicYearId) {
                  structureQuery = structureQuery.or(`academic_year_id.eq.${resolvedAcademicYearId},academic_year_id.is.null`);
                }
                const { data: structures } = await structureQuery;

                if (structures && structures.length > 0) {
                  const now = new Date();
                  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

                  const totalAmount = structures.reduce((sum: number, s: any) => sum + Number(s.amount), 0);
                  const dueDayNum = Math.min(...structures.map((s: any) => s.due_day || 10));
                  const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDayNum, 28));
                  if (dueDate < now) dueDate.setMonth(dueDate.getMonth() + 1);

                  const breakdown = structures.map((s: any) => `${s.name}: ₹${s.amount}`).join(', ');
                  const remarks = `Breakdown: ${breakdown}`;

                  await supabaseAdmin.from('fee_payments').insert({
                    school_id: req.user!.school_id,
                    student_id: student.id,
                    academic_year_id: resolvedAcademicYearId,
                    amount: totalAmount,
                    paid_amount: 0,
                    status: 'pending',
                    payment_method: 'unpaid',
                    due_date: dueDate.toISOString().split('T')[0],
                    late_fee: 0,
                    title: `Monthly Fee - ${monthLabel}`,
                    remarks: remarks
                  });
                }
              }
            } catch (feeErr) {
              console.error('Failed to auto-generate fees for student in bulk import:', feeErr);
            }
          }

          // Notifications removed as per user request to optimize speed and avoid unwanted alerts

          results.push({ success: true, admissionNumber: finalAdmissionNumber, student, temp_password: isTempPassword ? studentPassword : null, login_id: loginId });

          // Update capacity tracker
          if (sectionTracker[resolvedSectionId]) {
            sectionTracker[resolvedSectionId].current++;
          }
        } catch (err: any) {
          results.push({ success: false, error: err.message, raw: studentData });
        }
      }));
    }

    // Flush all deferred transport fees in bounded 500-row chunks so a large
    // import never issues one oversized insert.
    const transportFeesInserted = await flushBulkInsertRows(pendingTransportFeeRows, 'fee_payments');

    // Flush all batched student transport_route_id updates in bulk
    // (grouped by routeId to minimize DB round-trips)
    let routeUpdatesApplied = 0;
    if (pendingRouteUpdates.length > 0) {
      const byRoute = new Map<string, string[]>();
      for (const upd of pendingRouteUpdates) {
        if (!byRoute.has(upd.routeId)) byRoute.set(upd.routeId, []);
        byRoute.get(upd.routeId)!.push(upd.studentId);
      }
      for (const [routeId, studentIds] of byRoute.entries()) {
        // Update in chunks of 500 to avoid oversized requests
        for (let i = 0; i < studentIds.length; i += 500) {
          const chunk = studentIds.slice(i, i + 500);
          const { error } = await supabaseAdmin
            .from('students')
            .update({ transport_route_id: routeId })
            .in('id', chunk)
            .eq('school_id', schoolId);
          if (!error) routeUpdatesApplied += chunk.length;
        }
      }
    }

    return res.status(201).json({
      message: 'Bulk import complete',
      results,
      transportFeesInserted,
      routeUpdatesApplied,
    });
  } catch (error: any) {
    console.error('Bulk create student error:', error);
    return res.status(500).json({ error: 'Failed to bulk create students' });
  }
}

// Update student profile
export async function updateStudent(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      firstName, lastName, email, phone, admissionNumber, rollNumber, sectionId,
      dateOfBirth, gender, bloodGroup, religion, caste, nationality, motherTongue,
      fatherName, motherName, guardianName, guardianPhone, guardianEmail,
      emergencyContact, address, city, state, pincode,
      medicalConditions, allergies, previousSchool, riskLevel,
    } = req.body as any;

    const mappedStudentUpdates: Record<string, unknown> = {};
    if (admissionNumber !== undefined && admissionNumber !== '') mappedStudentUpdates.admission_number = admissionNumber;
    if (rollNumber !== undefined && rollNumber !== '') mappedStudentUpdates.roll_number = rollNumber;
    if (sectionId !== undefined && sectionId !== '') mappedStudentUpdates.section_id = sectionId;
    if (dateOfBirth !== undefined && dateOfBirth !== '') mappedStudentUpdates.date_of_birth = dateOfBirth;
    if (gender !== undefined && gender !== '') mappedStudentUpdates.gender = gender;
    if (bloodGroup !== undefined && bloodGroup !== '') mappedStudentUpdates.blood_group = bloodGroup;
    if (religion !== undefined && religion !== '') mappedStudentUpdates.religion = religion;
    if (caste !== undefined && caste !== '') mappedStudentUpdates.caste = caste;
    if (nationality !== undefined && nationality !== '') mappedStudentUpdates.nationality = nationality;
    if (motherTongue !== undefined && motherTongue !== '') mappedStudentUpdates.mother_tongue = motherTongue;
    if (fatherName !== undefined && fatherName !== '') mappedStudentUpdates.father_name = fatherName;
    if (motherName !== undefined && motherName !== '') mappedStudentUpdates.mother_name = motherName;
    if (guardianName !== undefined && guardianName !== '') mappedStudentUpdates.guardian_name = guardianName;
    if (guardianPhone !== undefined && guardianPhone !== '') mappedStudentUpdates.guardian_phone = guardianPhone;
    if (guardianEmail !== undefined && guardianEmail !== '') mappedStudentUpdates.guardian_email = guardianEmail;
    if (emergencyContact !== undefined && emergencyContact !== '') mappedStudentUpdates.emergency_contact = emergencyContact;
    if (address !== undefined && address !== '') mappedStudentUpdates.address = address;
    if (city !== undefined && city !== '') mappedStudentUpdates.city = city;
    if (state !== undefined && state !== '') mappedStudentUpdates.state = state;
    if (pincode !== undefined && pincode !== '') mappedStudentUpdates.pincode = pincode;
    if (medicalConditions !== undefined && medicalConditions !== '') mappedStudentUpdates.medical_conditions = medicalConditions;
    if (allergies !== undefined && allergies !== '') mappedStudentUpdates.allergies = allergies;
    if (previousSchool !== undefined && previousSchool !== '') mappedStudentUpdates.previous_school = previousSchool;
    if (riskLevel !== undefined && riskLevel !== '') mappedStudentUpdates.risk_level = riskLevel;

    // 1. Get student to find user_id
    const { data: student, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('user_id')
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .maybeSingle();

    if (fetchErr || !student) return res.status(404).json({ error: 'Student not found' });

    // 2. Update User table if name/email/phone provided
    const userUpdates: Record<string, unknown> = {};
    if (firstName !== undefined && firstName !== '') userUpdates.first_name = firstName;
    if (lastName !== undefined && lastName !== '') userUpdates.last_name = lastName;
    if (email !== undefined && email !== '') userUpdates.email = email;
    if (phone !== undefined && phone !== '') userUpdates.phone = phone;
    if (Object.keys(userUpdates).length) {
      const { error: userError } = await supabaseAdmin
        .from('users')
        .update(userUpdates)
        .eq('id', student.user_id)
        .eq('school_id', req.user!.school_id);

      if (userError) return res.status(400).json({ error: userError.message });
    }

    // 3. Update Students table
    if (Object.keys(mappedStudentUpdates).length === 0) {
      // No student table updates, but user table may have been updated above
      return res.json({ id, message: 'Student profile updated' });
    }

    const { data, error } = await supabaseAdmin
      .from('students')
      .update(mappedStudentUpdates)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update student' });
  }
}

// Delete student
export async function deleteStudent(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const schoolId = req.user!.school_id;

    // First fetch the student to get the user_id
    const { data: student, error: fetchError } = await supabaseAdmin
      .from('students')
      .select('user_id')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();

    if (fetchError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // 1. Delete from auth.users (to ensure login is completely revoked)
    const { data: userRecord } = await supabaseAdmin.from('users').select('auth_id').eq('id', student.user_id).single();
    if (userRecord?.auth_id) {
      await supabaseAdmin.auth.admin.deleteUser(userRecord.auth_id);
    }

    // 2. Delete the student record first (to avoid foreign key constraint errors)
    await supabaseAdmin.from('students').delete().eq('id', id);

    // 3. Delete the parent_students relationships (if any)
    await supabaseAdmin.from('parent_students').delete().eq('student_id', id);

    // 4. Finally, hard delete the user record
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', student.user_id)
      .eq('school_id', schoolId);

    if (deleteError) {
      console.error("Failed to delete user record:", deleteError);
      // We don't return error here because the student record is already successfully deleted
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      school_id: schoolId,
      user_id: req.user!.id,
      action: 'student_deleted',
      entity_type: 'student',
      new_data: { studentId: id },
    });

    return res.json({ success: true, message: 'Student successfully deleted' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete student' });
  }
}

// Promote students
export async function promoteStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentIds, targetSectionId, targetAcademicYearId } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'No student IDs provided' });
    }

    if (!targetSectionId) {
      return res.status(400).json({ error: 'Target section is required' });
    }

    // Get current student data to check for duplicates and track promotions
    const { data: existingStudents, error: fetchError } = await supabaseAdmin
      .from('students')
      .select('id, section_id, academic_year_id, user_id')
      .in('id', studentIds);

    if (fetchError) {
      return res.status(400).json({ error: fetchError.message });
    }

    // Count how many are already in the target section/year
    const alreadyPromoted = existingStudents.filter(s =>
      s.section_id === targetSectionId && s.academic_year_id === targetAcademicYearId
    );

    // Filter out already promoted students
    const toPromote = existingStudents.filter(s =>
      !(s.section_id === targetSectionId && s.academic_year_id === targetAcademicYearId)
    );

    let promoted = 0;
    let skipped = 0;
    let feesGenerated = 0;

    // Promote students who aren't already in the target section/year
    if (toPromote.length > 0) {
      // Update student records
      const { error: updateError } = await supabaseAdmin
        .from('students')
        .update({
          section_id: targetSectionId,
          academic_year_id: targetAcademicYearId
        })
        .in('id', toPromote.map(s => s.id));

      if (updateError) {
        console.error('Promotion update error:', updateError);
        return res.status(400).json({ error: updateError.message });
      }

      promoted = toPromote.length;

      // Generate fees for the new class/section
      try {
        // Get the target section's class_id
        const { data: targetSectionData } = await supabaseAdmin
          .from('sections')
          .select('class_id')
          .eq('id', targetSectionId)
          .single();

        if (targetSectionData?.class_id) {
          // Get fee structures for the new class
          const { data: feeStructures } = await supabaseAdmin
            .from('fee_structures')
            .select('*')
            .eq('class_id', targetSectionData.class_id)
            .eq('is_active', true);

          if (feeStructures && feeStructures.length > 0) {
            const now = new Date();
            const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
            const totalAmount = feeStructures.reduce((sum: number, s: any) => sum + Number(s.amount), 0);
            const dueDayNum = Math.min(...feeStructures.map((s: any) => s.due_day || 10));
            const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDayNum, 28));
            if (dueDate < now) dueDate.setMonth(dueDate.getMonth() + 1);

            const breakdown = feeStructures.map((s: any) => s.name).join(', ');
            const remarks = `Promotion to ${targetSectionData.class_id}: ${breakdown}`;

            // Create fee records for each promoted student
            const feeRecords = toPromote.map(student => ({
              school_id: req.user!.school_id,
              student_id: student.id,
              fee_structure_id: feeStructures[0]?.id || null,
              academic_year_id: targetAcademicYearId,
              amount: totalAmount,
              paid_amount: 0,
              status: 'pending',
              payment_method: 'unpaid',
              due_date: dueDate.toISOString().split('T')[0],
              late_fee: 0,
              title: `Promotion Fees - ${monthLabel}`,
              remarks: remarks
            }));
            const batchSize = 500;
            for (let i = 0; i < feeRecords.length; i += batchSize) {
              const batch = feeRecords.slice(i, i + batchSize);
              const { error: feeError } = await supabaseAdmin
                .from('fee_payments')
                .insert(batch);

              if (!feeError) {
                feesGenerated += batch.length;
              } else {
                console.error(`Fee generation batch ${i / batchSize + 1} error:`, feeError);
              }
            }
          }
        }
      } catch (feeErr) {
        console.error('Fee generation error during promotion:', feeErr);
        // Don't fail the promotion if fee generation fails
      }
    }

    skipped = alreadyPromoted.length;

    // Audit log
    if (promoted > 0) {
      await supabaseAdmin.from('audit_logs').insert({
        school_id: req.user!.school_id,
        user_id: req.user!.id,
        action: 'students_promoted',
        entity_type: 'student',
        new_data: {
          studentIds: toPromote.map(s => s.id),
          targetSectionId,
          targetAcademicYearId,
          promoted,
          skipped,
          feesGenerated
        },
      });
    }

    return res.json({
      promoted,
      skipped,
      feesGenerated,
      message: `${promoted} students promoted, ${skipped} skipped, ${feesGenerated} fee records created`
    });
  } catch (error: any) {
    console.error('Promotion error:', error);
    return res.status(500).json({ error: 'Failed to promote students' });
  }
}

// Get students for a specific teacher
export async function getTeacherStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const scope = await getUserScope(req.user!);
    const allSectionIds = scope?.sectionIds || [];

    if (allSectionIds.length === 0) {
      return res.json([]);
    }

    // 3. Fetch students in these sections
    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select(`
        *,
        user:users(id, email, first_name, last_name, phone, avatar_url),
        section:sections(id, name, class:classes(id, name, grade))
      `)
      .in('section_id', allSectionIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    return res.json(students);
  } catch (error: any) {
    console.error('Failed to fetch teacher students:', error);
    return res.status(500).json({ error: 'Failed to fetch students' });
  }
}


//get aaigenerated performance summary for student dashboard
export async function getAIPerformanceSummary(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const studentId = req.params.id || req.query.studentId;

    // Resolve Student profile (Support admin viewing specific student via query param)
    let studentQuery = supabaseAdmin
      .from('students')
      .select('section:sections(*, class:classes(*))');

    if (studentId && (req.user!.role === 'admin' || req.user!.role === 'teacher')) {
      studentQuery = studentQuery.eq('id', studentId);
    } else {
      studentQuery = studentQuery.eq('user_id', userId);
    }

    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student || !student.section || !(student.section as any).class) {
      return res.status(404).json({
        error: 'Student profile or class mapping not found',
        suggestion: 'If you are an admin/teacher, pass ?studentId=UUID. If you are a student, ensure your user record is mapped to a student profile.'
      });
    }

    // Call AI service to get performance summary based on class and section
    const aiSummary = await aiService.getPerformanceSummary({
      schoolId: req.user!.school_id,
      className: (student.section as any).class.name,
      sectionName: (student.section as any).name,
    });

    return res.json({ aiSummary });
  } catch (error: any) {
    console.error('AI performance summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch AI performance summary' });
  }
}

// Get student dashboard summary
export async function getStudentDashboard(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const studentId = req.params.id || req.query.studentId;

    // 1. Resolve Student profile (Support admin viewing specific student via query param)
    let studentQuery = supabaseAdmin
      .from('students')
      .select('*, user:users(id, first_name, last_name, email, phone, avatar_url), section:sections(*, class:classes(*))');

    if (studentId && (req.user!.role === 'admin' || req.user!.role === 'teacher')) {
      studentQuery = studentQuery.eq('id', studentId);
    } else {
      studentQuery = studentQuery.eq('user_id', userId);
    }

    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student) {
      return res.status(404).json({
        error: 'Student profile not found',
        suggestion: 'If you are an admin/teacher, pass ?studentId=UUID. If you are a student, ensure your user record is mapped to a student profile.'
      });
    }

    // 2. Get attendance stats
    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('status')
      .eq('student_id', student.id);

    const totalAttendance = attendance?.length || 0;
    const presentCount = attendance?.filter((a: any) => a.status === 'present').length || 0;
    const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

    // 3. Get pending fees
    const { data: fees } = await supabaseAdmin
      .from('fee_payments')
      .select('*')
      .eq('student_id', student.id)
      .eq('status', 'pending');

    const amountDue = fees?.reduce((sum, f) => sum + ((Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0)) - Number(f.paid_amount || 0)), 0) || 0;
    const pendingFeeId = fees?.[0]?.id;

    // 4. Get real academic performance from exam_results
    const { data: examResults } = await supabaseAdmin
      .from('exam_results')
      .select('*, exam:exams!inner(*, subject:subjects(name))')
      .eq('student_id', student.id)
      .gte('marks_obtained', 0)
      .order('created_at', { ascending: false });

    // Subject Perfomance (SaaS Layer 1)
    const subjectMapForPerf: Record<string, { total: number, count: number, lastScore: number }> = {};
    examResults?.forEach(r => {
      const sName = r.exam?.subject?.name || 'General';
      const totalMarks = Number(r.exam?.total_marks || 0);
      const score = totalMarks > 0 ? Math.round((Number(r.marks_obtained || 0) / totalMarks) * 100) : 0;
      if (!subjectMapForPerf[sName]) subjectMapForPerf[sName] = { total: 0, count: 0, lastScore: score };
      subjectMapForPerf[sName].total += score;
      subjectMapForPerf[sName].count += 1;
    });

    const subjectPerformance = Object.entries(subjectMapForPerf).map(([sub, data]) => ({
      subject: sub,
      avg_score: Math.round(data.total / data.count),
      trend: data.count > 1 ? 'stable' : 'new', // Logic can be improved with historical trend calc
      last_exam_score: data.lastScore
    }));

    const performanceData = examResults?.slice(0, 5).map(r => ({
      subject: r.exam?.subject?.name || 'General',
      score: Number(r.exam?.total_marks || 0) > 0
        ? Math.round((Number(r.marks_obtained || 0) / Number(r.exam.total_marks)) * 100)
        : 0
    })) || [];

    const recentScores = examResults?.slice(0, 3).map(r => ({
      subject: r.exam?.subject?.name || 'General',
      test: r.exam?.name || 'Exam',
      score: Number(r.marks_obtained || 0),
      maxScore: Number(r.exam?.total_marks || 0),
      grade: r.grade || 'A'
    })) || [];

    // 5. Get upcoming assignments from LMS (SaaS Layer 4)
    const { data: assignments } = await supabaseAdmin
      .from('lms_assignments')
      .select('*, course:lms_courses(title)')
      .eq('section_id', student.section_id)
      .gte('due_date', new Date().toISOString().split('T')[0])
      .order('due_date', { ascending: true })
      .limit(20);

    // Filter out assignments already submitted/graded by this student
    let pendingAssignments = assignments || [];
    if (pendingAssignments.length > 0) {
      const assignmentIds = pendingAssignments.map((a: any) => a.id);
      const { data: completedSubs } = await supabaseAdmin
        .from('lms_submissions')
        .select('assignment_id, status')
        .eq('student_id', student.id)
        .in('assignment_id', assignmentIds)
        .in('status', ['submitted', 'graded']);

      const completedSet = new Set((completedSubs || []).map((s: any) => s.assignment_id));
      pendingAssignments = pendingAssignments.filter((a: any) => !completedSet.has(a.id));
    }
    pendingAssignments = pendingAssignments.slice(0, 5);

    const { data: inAppAlerts } = await supabaseAdmin
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'unread')
      .order('created_at', { ascending: false })
      .limit(10);

    // 5.1 Get Behavior Logs (SaaS Layer 2) - Mocked for now as table doesn't exist, but ready for UI
    const behavior_logs = [
      { date: new Date().toISOString().split('T')[0], type: 'discipline', note: 'Late submission for Math assignment' }
    ];

    // 5.2 Get Today's Schedule (SaaS Layer 3)
    const dayMap: Record<string, number> = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 0 };
    const todayNum = dayMap[new Date().toLocaleDateString('en-US', { weekday: 'long' })] || 1;

    const { data: schedule } = await supabaseAdmin
      .from('timetable_slots')
      .select('*, subject:subjects(name), teacher:users(first_name, last_name)')
      .eq('section_id', student.section_id)
      .eq('day_of_week', todayNum)
      .order('period_number', { ascending: true });

    const today_schedule = schedule?.map(s => {
      const t: any = s;
      return {
        ...t,
        subject: t.subject?.name || 'General',
        teacher: t.teacher ? `${t.teacher.first_name || ''} ${t.teacher.last_name || ''}`.trim() : 'TBA',
        time: `${t.start_time} - ${t.end_time}`
      };
    }) || [];

    const upcomingAssignments = pendingAssignments.map((a: any) => ({
      id: a.id,
      title: a.title,
      course: a.course?.title || 'General',
      due_date: a.due_date,
      dueDate: new Date(a.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }));

    // 6. Get upcoming events
    const { data: events } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('school_id', student.school_id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .limit(3);

    const mappedEvents = events?.map(e => ({
      name: e.title,
      date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      type: e.type || 'Event'
    })) || [];

    // 7. Get announcements from notification_logs (Filter for unique messages to avoid duplicates from multi-recipient sends)
    const { data: announcements } = await supabaseAdmin
      .from('notification_logs')
      .select('metadata, created_at, message')
      .eq('school_id', student.school_id)
      .eq('type', 'announcement')
      .order('created_at', { ascending: false })
      .limit(20); // Fetch more to allow for filtering

    const seenMessages = new Set();
    const mappedAnnouncements: any[] = [];

    announcements?.forEach(a => {
      if (!seenMessages.has(a.message)) {
        seenMessages.add(a.message);
        mappedAnnouncements.push({
          title: a.metadata?.title || 'Announcement',
          message: a.message,
          time: new Date(a.created_at).toLocaleString()
        });
      }
    });

    // Limit to final 5 unique announcements
    const finalAnnouncements = mappedAnnouncements.slice(0, 5);

    // Risk Analysis (SaaS Layer 6)
    const risk_analysis = {
      level: student.risk_level || 'low',
      reasons: [],
      recommended_action: 'Continue regular monitoring'
    };

    if (totalAttendance > 0 && attendanceRate < 75) {
      (risk_analysis.reasons as string[]).push(`${attendanceRate}% attendance (Critical)`);
      risk_analysis.recommended_action = 'Immediate parent meeting required';
    }
    if (amountDue > 5000) {
      (risk_analysis.reasons as string[]).push('Outstanding fee dues > ₹5000');
    }

    return res.json({
      studentId: student.id,
      sectionId: student.section_id,
      classId: student.section?.class_id || student.section?.class?.id,
      student: {
        id: student.id,
        admission_number: student.admission_number,
        roll_number: student.roll_number,
        father_name: student.father_name,
        mother_name: student.mother_name,
        section: student.section,
        user: student.user,
      },
      assignments: upcomingAssignments,
      stats: {
        attendanceRate: totalAttendance > 0 ? `${attendanceRate}%` : 'N/A',
        attendanceCount: `${presentCount}/${totalAttendance} days`,
        performance: `${performanceData.length > 0 ? Math.round(performanceData.reduce((acc, p) => acc + p.score, 0) / performanceData.length) : 0}%`,
        performanceStatus: totalAttendance === 0 ? 'Not Started' : (attendanceRate < 75 ? 'At Risk' : 'Excellent'),
        feeBalance: `₹${amountDue}`,
        feeDueDate: fees?.[0]?.due_date || 'No due',
        pendingAssignments: upcomingAssignments.length,
      },
      academic: {
        subjectPerformance,
        performanceData,
        recentScores,
        upcomingAssignments,
        today_schedule,
        behavior_logs
      },
      risk_analysis,
      fees: {
        amountDue,
        pendingFeeId,
      },
      events: mappedEvents,
      nextExam: examResults?.[0]?.exam?.name || 'No upcoming exam',
      announcements: finalAnnouncements,
      alerts: inAppAlerts || [],
    });
  } catch (error: any) {
    console.error('Student dashboard error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

// ── Student Results & Reviews ──────────────────────────────────────────────

export async function getStudentResults(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const paramId = req.params.id;

    // Resolve the student record
    let student: any = null;
    if (paramId && (role === 'admin' || role === 'teacher')) {
      const { data } = await supabaseAdmin
        .from('students')
        .select('id, user_id, section_id, school_id, section:sections(*, class:classes(*))')
        .eq('id', paramId)
        .single();
      student = data;
    } else if (role === 'parent') {
      const { data: parent } = await supabaseAdmin
        .from('parents')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (parent) {
        const { data: links } = await supabaseAdmin
          .from('student_parent_links')
          .select('student_id')
          .eq('parent_id', parent.id);
        const firstChildId = links?.[0]?.student_id;
        if (firstChildId) {
          const { data } = await supabaseAdmin
            .from('students')
            .select('id, user_id, section_id, school_id, section:sections(*, class:classes(*))')
            .eq('id', firstChildId)
            .single();
          student = data;
        }
      }
    } else {
      // Student role
      const { data } = await supabaseAdmin
        .from('students')
        .select('id, user_id, section_id, school_id, section:sections(*, class:classes(*))')
        .eq('user_id', userId)
        .single();
      student = data;
    }

    if (!student) return res.status(404).json({ error: 'Student not found' });

    // 1. Graded Assignment / Homework Submissions
    const { data: submissions } = await supabaseAdmin
      .from('lms_submissions')
      .select(`
        id, marks_obtained, feedback, status, submission_date,
        assignment:lms_assignments!inner(
          id, title, description, due_date, max_marks,
          subject:subjects(name),
          teacher:users!lms_assignments_teacher_id_fkey(first_name, last_name)
        )
      `)
      .eq('student_id', student.id)
      .in('status', ['graded', 'submitted']);

    const lmsResults = (submissions || []).map((s: any) => ({
      id: s.id,
      type: 'assignment',
      title: s.assignment.title,
      subject: s.assignment.subject?.name || 'General',
      teacher: s.assignment.teacher ? `${s.assignment.teacher.first_name} ${s.assignment.teacher.last_name || ''}`.trim() : 'Teacher',
      dueDate: s.assignment.due_date,
      submissionDate: s.submission_date,
      maxMarks: s.assignment.max_marks,
      marksObtained: s.marks_obtained,
      percentage: s.assignment.max_marks > 0 && s.marks_obtained !== null
        ? Math.round((s.marks_obtained / s.assignment.max_marks) * 100)
        : null,
      feedback: s.feedback,
      status: s.status,
    }));

    // 2. Exam Results
    const { data: examResults } = await supabaseAdmin
      .from('exam_results')
      .select(`
        id, marks_obtained, grade, created_at,
        exam:exams!inner(
          id, name, status, total_marks, date,
          subject:subjects(name),
          teacher:users!exams_created_by_fkey(first_name, last_name)
        )
      `)
      .eq('student_id', student.id);

    const examData = (examResults || [])
      .filter((r: any) => r.exam.status === 'completed' || r.marks_obtained !== null)
      .map((r: any) => ({
        id: r.id,
        type: 'exam',
        title: r.exam.name,
        subject: r.exam.subject?.name || 'Unknown',
        teacher: r.exam.teacher ? `${r.exam.teacher.first_name} ${r.exam.teacher.last_name || ''}`.trim() : 'Teacher',
        date: r.exam.date,
        maxMarks: r.exam.total_marks,
        marksObtained: r.marks_obtained !== null && r.marks_obtained !== -1 ? r.marks_obtained : null,
        isAbsent: r.marks_obtained === -1,
        percentage: r.exam.total_marks > 0 && r.marks_obtained !== null && r.marks_obtained !== -1
          ? Math.round((r.marks_obtained / r.exam.total_marks) * 100)
          : null,
        grade: r.grade,
        feedback: r.remarks,
      }));

    // Summary stats
    const allScored = [...lmsResults.filter(r => r.percentage !== null), ...examData.filter(r => r.percentage !== null)];
    const avgPercentage = allScored.length > 0
      ? Math.round(allScored.reduce((s: number, r: any) => s + r.percentage!, 0) / allScored.length)
      : null;

    return res.json({
      student: {
        id: student.id,
        class: (student.section as any)?.class?.name,
        section: (student.section as any)?.name,
      },
      lmsResults,
      examResults: examData,
      summary: {
        totalLMS: lmsResults.length,
        totalExams: examData.length,
        avgPercentage,
      },
    });
  } catch (err: any) {
    console.error('Student results error:', err);
    return res.status(500).json({ error: 'Failed to load student results' });
  }
}

// ── Exam-wise Report Cards ─────────────────────────────────────────────────
// Groups a student's results into exam reports (by exam type / exam name),
// with per-exam subject breakdown, totals, grade, class position, attendance
// and teacher remarks — the data behind the student "My Results" page.

const examGradeFor = (pct: number): string =>
  pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 40 ? 'D' : 'F';

export async function getStudentExamReports(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const paramId = req.params.id;

    // ── Resolve the student record (same policy as getStudentResults) ──
    let student: any = null;
    if (paramId && (role === 'admin' || role === 'teacher')) {
      const { data } = await supabaseAdmin
        .from('students')
        .select('id, user_id, section_id, school_id, roll_number, admission_number, section:sections(*, class:classes(*)), user:users(first_name, last_name)')
        .eq('id', paramId)
        .single();
      student = data;
    } else if (role === 'parent') {
      const { data: parent } = await supabaseAdmin
        .from('parents')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (parent) {
        const { data: links } = await supabaseAdmin
          .from('student_parent_links')
          .select('student_id')
          .eq('parent_id', parent.id);
        const childIds = (links || []).map((l: any) => l.student_id);
        // If a specific child param is given, ensure it belongs to this parent.
        const targetId = paramId && childIds.includes(paramId) ? paramId : childIds[0];
        if (targetId) {
          const { data } = await supabaseAdmin
            .from('students')
            .select('id, user_id, section_id, school_id, roll_number, admission_number, section:sections(*, class:classes(*)), user:users(first_name, last_name)')
            .eq('id', targetId)
            .single();
          student = data;
        }
      }
    } else {
      const { data } = await supabaseAdmin
        .from('students')
        .select('id, user_id, section_id, school_id, roll_number, admission_number, section:sections(*, class:classes(*)), user:users(first_name, last_name)')
        .eq('user_id', userId)
        .single();
      student = data;
    }

    if (!student) return res.status(404).json({ error: 'Student not found' });
    // ── 1. All graded exam results for this student ──
    const { data: results, error: resultsError } = await supabaseAdmin
      .from('exam_results')
      .select(`
        id, marks_obtained, grade, remarks, created_at,
        exam:exams!inner(
          id, name, status, total_marks, date, exam_type_id,
          subject:subjects(name)
        )
      `)
      .eq('student_id', student.id)
      .order('created_at', { ascending: true });

    if (resultsError) {
      console.error('Exam reports query error:', resultsError.message);
      return res.status(500).json({ error: 'Failed to load exam reports' });
    }

    // Exam type names (no FK embed available — resolve via lookup map)
    const { data: examTypes } = await supabaseAdmin
      .from('exam_types')
      .select('id, name');
    const typeNameMap = new Map<string, string>((examTypes || []).map((t: any) => [t.id, t.name]));

    const graded = (results || []).filter((r: any) =>
      r.exam && (r.exam.status === 'completed' || r.marks_obtained !== null)
    );

    // ── 2. Attendance (overall) ──
    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('status, date')
      .eq('student_id', student.id);
    const offDays = await getOffDays(req.user!.school_id, '2000-01-01', '2100-01-01');
    const workingRows = (attendance || []).filter((a: any) => !offDays.includes(String(a.date).slice(0, 10)));
    const totalDays = workingRows.length;
    const presentDays = workingRows.filter((a: any) => a.status === 'present').length || 0;
    const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 1000) / 10 : null;

    // ── 3. Class size (for "position X of Y") ──
    let classSize: number | null = null;
    if (student.section_id) {
      const { count } = await supabaseAdmin
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('section_id', student.section_id);
      classSize = count ?? null;
    }

    // ── 4. Group results into exam reports (by exam type, fallback: exam name) ──
    const groupKey = (r: any) => {
      if ((r.exam as any).exam_type_id) return `t:${(r.exam as any).exam_type_id}`;
      return `n:${String(r.exam?.name || 'Exam').trim().toLowerCase()}`;
    };

    const groups = new Map<string, any[]>();
    graded.forEach((r: any) => {
      const key = groupKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });

    const exams: any[] = [];
    for (const [, rows] of groups) {
      // One subject row per exam-group: keep the most recent result per subject
      const bySubject = new Map<string, any>();
      rows.forEach((r: any) => {
        const subj = r.exam?.subject?.name || 'General';
        const existing = bySubject.get(subj);
        if (!existing || new Date(r.created_at) >= new Date(existing.created_at)) bySubject.set(subj, r);
      });

      const subjects = [...bySubject.values()].map((r: any) => {
        const subj = r.exam?.subject?.name || 'General';
        const maxMarks = Number(r.exam?.total_marks || 0);
        const isAbsent = r.marks_obtained === -1;
        const marks = isAbsent || r.marks_obtained === null ? 0 : Number(r.marks_obtained);
        const pct = maxMarks > 0 && !isAbsent && r.marks_obtained !== null
          ? Math.round((marks / maxMarks) * 1000) / 10
          : null;
        return {
          subject: subj,
          marksObtained: isAbsent ? null : marks,
          maxMarks,
          percentage: pct,
          grade: isAbsent ? null : (r.grade || (pct !== null ? examGradeFor(pct) : null)),
          isAbsent,
        };
      }).sort((a: any, b: any) => a.subject.localeCompare(b.subject));

      const totalObtained = subjects.reduce((s: number, x: any) => s + (x.marksObtained || 0), 0);
      const totalMax = subjects.reduce((s: number, x: any) => s + Number(x.maxMarks || 0), 0);
      const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;
      const date = rows.map((r: any) => r.exam?.date).filter(Boolean).sort().pop() || null;

      // Teacher remarks: latest non-empty remark in this exam group
      const remarksRow = rows
        .filter((r: any) => r.remarks && String(r.remarks).trim())
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      const examIds = [...new Set(rows.map((r: any) => r.exam.id))];

      exams.push({
        examId: examIds[0],
        examIds,
        examName: ((rows[0].exam as any).exam_type_id
          ? typeNameMap.get((rows[0].exam as any).exam_type_id) || rows[0].exam?.name
          : rows[0].exam?.name) || 'Exam',
        date,
        subjects,
        totalObtained,
        totalMax,
        percentage,
        grade: examGradeFor(percentage),
        remarks: remarksRow?.remarks || null,
        classPosition: null as number | null,
        classSize,
      });
    }

    exams.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    // ── 5. Class position per exam (rank by total among same-section peers) ──
    for (const exam of exams) {
      if (!student.section_id || exam.examIds.length === 0) continue;
      const { data: peerResults } = await supabaseAdmin
        .from('exam_results')
        .select('student_id, marks_obtained, student:students!inner(id, section_id)')
        .in('exam_id', exam.examIds);

      const totals = new Map<string, number>();
      (peerResults || []).forEach((p: any) => {
        if ((p.student as any)?.section_id !== student.section_id) return;
        const m = p.marks_obtained === -1 || p.marks_obtained === null ? 0 : Number(p.marks_obtained);
        totals.set(p.student_id, (totals.get(p.student_id) || 0) + m);
      });
      if (totals.size > 0) {
        const myTotal = totals.get(student.id);
        if (myTotal !== undefined) {
          // Competition ranking: 1 + number of peers strictly ahead (ties share rank)
          exam.classPosition = 1 + [...totals.values()].filter((t: number) => t > myTotal).length;
        }
      }
    }

    // ── 6. Overall performance ──
    const allScored = exams.filter((e: any) => e.totalMax > 0);
    const overallPercentage = allScored.length > 0
      ? Math.round((allScored.reduce((s: number, e: any) => s + e.totalObtained, 0) /
          allScored.reduce((s: number, e: any) => s + e.totalMax, 0)) * 10000) / 100
      : null;
    const bestExam = allScored.length > 0
      ? allScored.reduce((best: any, e: any) => (e.percentage > best.percentage ? e : best), allScored[0])
      : null;

    return res.json({
      student: {
        id: student.id,
        name: `${(student as any).user?.first_name || ''} ${(student as any).user?.last_name || ''}`.trim() || null,
        class: (student.section as any)?.class?.name || null,
        section: (student.section as any)?.name || null,
        rollNumber: student.roll_number ?? null,
        admissionNumber: student.admission_number ?? null,
      },
      attendance: {
        rate: attendanceRate,
        present: presentDays,
        total: totalDays,
      },
      exams: exams.map(({ examIds, ...e }: any) => e),
      overall: {
        totalExams: exams.length,
        totalObtained: allScored.reduce((s: number, e: any) => s + e.totalObtained, 0),
        totalMax: allScored.reduce((s: number, e: any) => s + e.totalMax, 0),
        avgPercentage: overallPercentage,
        grade: overallPercentage !== null ? examGradeFor(overallPercentage) : null,
        bestExam: bestExam ? { name: bestExam.examName, percentage: bestExam.percentage } : null,
      },
    });
  } catch (err: any) {
    console.error('Student exam reports error:', err);
    return res.status(500).json({ error: 'Failed to load exam reports' });
  }
}


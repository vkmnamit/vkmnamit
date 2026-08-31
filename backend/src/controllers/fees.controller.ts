import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { paymentService } from '../services/payment.service';
import { notificationService } from '../services/notification.service';
import { isPaymentForMonthLabel, feeTitleForMonth } from '../services/fees_automation.service';
import { generateFeesForMonth, monthLabelFromMonth } from '../services/fee_generation.service';
import { fetchAllRows, chunkArray } from '../utils/supabasePagination';
import { generateReceiptNumber } from '../util/transactionNumbers';

// Insert fee_payments in 500-row chunks. A single 5000+ row insert can
// exceed Supabase's parameter/body limits (PGRST116/413) and crash the
// job at runtime. Chunking keeps every path safe for large schools.
async function insertFeePaymentsChunked(rows: any[], chunkSize = 500): Promise<any[]> {
  const allInserted: any[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabaseAdmin.from('fee_payments').insert(chunk).select('id, student_id');
    if (error) {
      console.error(`[FEE-INSERT] Chunk ${i}-${i + chunk.length - 1} failed:`, error.message);
    } else {
      allInserted.push(...(data || []));
    }
  }
  return allInserted;
}

// ════════════════════════════════════════════════════════════════════════════
// SHARED DUPLICATE-DETECTION & BATCH NOTIFICATION HELPERS
// Every generation path (auto-cron, admin button, create-with-push, bulk-assign)
// uses these EXACT same helpers so:
//   1. Auto + admin NEVER double-bill the same student/structure/month.
//   2. Partial generation works: if auto created fees for 100 of 5000 students,
//      admin clicking Generate only creates the missing 4900.
//   3. Notifications are BATCHED (parent lookup once per school, with IN clause)
//      so 5000+ student schools don't trigger 5000 sequential DB queries.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Batch-fetch the student→fee_structure→month dedup map for a school.
 * Same shared logic used by autoGenerateMonthlyFees in fees_automation.service.ts.
 * Returns Map<studentId, Set<feeStructureId>> of payments already billed for the month.
 */
async function buildAlreadyBilledMap(
  schoolId: string,
  monthLabel: string,
  allStructures: any[],
  limit = 100000
): Promise<Map<string, Set<string>>> {
  // `.range()`-paged fetch — a school with >1000 already-billed month fees must not
  // be truncated to the first 1000 rows, or those students would be double-billed.
  const existingPayments = await fetchAllRows<any>(
    supabaseAdmin
      .from('fee_payments')
      .select('id, student_id, title, remarks, fee_structure_id')
      .eq('school_id', schoolId)
      .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`),
    // Page size; the `limit` param is kept for signature compatibility only.
    1000
  );

  const alreadyBilled = new Map<string, Set<string>>();
  for (const p of existingPayments || []) {
    if (!isPaymentForMonthLabel(p, monthLabel)) continue;
    if (!alreadyBilled.has(p.student_id)) alreadyBilled.set(p.student_id, new Set());
    if (p.fee_structure_id) alreadyBilled.get(p.student_id)!.add(p.fee_structure_id);
    // Legacy merged "Monthly Fee - <Month>" covers ALL monthly structures
    if ((p.title || '').toLowerCase().includes(`monthly fee - ${monthLabel.toLowerCase()}`)) {
      for (const st of allStructures) alreadyBilled.get(p.student_id)!.add(st.id);
    }
  }
  return alreadyBilled;
}

/**
 * Batch-fetch exemptions into Map<studentId, Set<feeStructureId>>.
 */
async function buildExemptionMap(schoolId: string): Promise<Map<string, Set<string>>> {
  // Paged fetch — exemption rows can exceed 1000 for large schools.
  const exemptions = await fetchAllRows<any>(
    supabaseAdmin
      .from('fee_exemptions')
      .select('student_id, fee_structure_id')
      .eq('school_id', schoolId)
  );

  const map = new Map<string, Set<string>>();
  exemptions?.forEach(e => {
    if (!map.has(e.student_id)) map.set(e.student_id, new Set());
    map.get(e.student_id)?.add(e.fee_structure_id);
  });
  return map;
}

/**
 * Batch-fetch parent user IDs for many students.
 * Chunks the `.in()` clause (500 ids at a time) so schools with 5000+ students
 * don't overflow the URL/header size limit on a single request.
 * Returns Map<studentId, parentUserId>. Used to send notifications in bulk.
 * This replaces the old N+1 per-student parent_students query pattern.
 */
async function batchFetchParentUserIds(studentIds: string[]): Promise<Map<string, string>> {
  if (!studentIds.length) return new Map();
  const map = new Map<string, string>();

  for (const chunk of chunkArray(studentIds, 500)) {
    const { data: parentLinks } = await supabaseAdmin
      .from('parent_students')
      .select('student_id, parent:parents(user:users(id))')
      .in('student_id', chunk);

    for (const link of parentLinks || []) {
      if (!map.has(link.student_id)) {
        map.set(link.student_id, (link as any)?.parent?.user?.id || '');
      }
    }
  }
  return map;
}

/**
 * Batch-create in-app notifications for many parent→student links.
 * Uses a single insert into `user_notifications` (same table as
 * notificationService.createInAppNotification) instead of per-student awaits.
 * This is the key scaling fix for 5000+ student schools — instead of
 * 5000 sequential parent_students queries + 5000 notification inserts,
 * we do 1 parent lookup + 1 chunked insert.
 */
async function batchCreateInAppNotifications(
  schoolId: string,
  parentUserIdsByStudentId: Map<string, string>,
  studentFeeRows: { student_id: string; fee_id: string; title: string; amount: number; due_date: string }[]
) {
  const notifRows: any[] = [];
  for (const row of studentFeeRows) {
    const parentUserId = parentUserIdsByStudentId.get(row.student_id);
    if (!parentUserId) continue;
    notifRows.push({
      school_id: schoolId,
      user_id: parentUserId,
      type: 'fee_reminder',
      title: `New Fee: ${row.title}`,
      message: `A fee of ₹${Number(row.amount).toLocaleString()} (${row.title}) is due by ${new Date(row.due_date).toLocaleDateString('en-IN')}.`,
      status: 'unread',
      source_type: 'notification',
      source_id: row.fee_id,
      metadata: {},
    });
  }

  // Insert in chunks (1000 per chunk) to avoid body/param limits
  if (notifRows.length === 0) return;
  for (let i = 0; i < notifRows.length; i += 1000) {
    const chunk = notifRows.slice(i, i + 1000);
    try {
      await supabaseAdmin.from('user_notifications').insert(chunk);
    } catch (err) {
      console.error(`[FEE-NOTIF] Failed to insert notification chunk ${i}-${i + chunk.length - 1}:`, err);
    }
  }
}

// Get fee structures
export async function getFeeStructures(req: AuthenticatedRequest, res: Response) {
  try {
    const academicYearId = req.query.academic_year_id as string | undefined;
    let query = supabaseAdmin
      .from('fee_structures')
      .select('*, class:classes(name, grade)')
      .eq('school_id', req.user!.school_id);
    if (academicYearId && academicYearId !== 'all') {
      query = query.or(`academic_year_id.eq.${academicYearId},academic_year_id.is.null`);
    }
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch fee structures' });
  }
}

// Update fee structure
export async function updateFeeStructure(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, amount, frequency, dueDay, isMandatory, classId, transportRouteId, appliesTo, academicYearId } = req.body;

    const payload: any = {};
    if (name !== undefined) payload.name = name;
    if (amount !== undefined) payload.amount = Number(amount);
    if (frequency !== undefined) payload.frequency = frequency;
    if (dueDay !== undefined) payload.due_day = Number(dueDay);
    if (isMandatory !== undefined) payload.is_mandatory = isMandatory;
    if (classId !== undefined) payload.class_id = classId || null;
    if (transportRouteId !== undefined) payload.transport_route_id = transportRouteId || null;
    if (appliesTo !== undefined) payload.applies_to = appliesTo;
    if (academicYearId !== undefined) payload.academic_year_id = academicYearId || null;

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('fee_structures')
      .update(payload)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Fee structure not found' });

    return res.json({ message: 'Fee structure updated successfully', structure: data });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update fee structure' });
  }
}

// Delete fee structure
export async function deleteFeeStructure(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    // Remove pending/overdue fee payments linked to this structure
    await supabaseAdmin
      .from('fee_payments')
      .delete()
      .eq('fee_structure_id', id)
      .eq('school_id', req.user!.school_id)
      .in('status', ['pending', 'overdue']);

    // Remove exemptions linked to this structure
    await supabaseAdmin
      .from('fee_exemptions')
      .delete()
      .eq('fee_structure_id', id)
      .eq('school_id', req.user!.school_id);

    // Delete the structure itself
    const { error } = await supabaseAdmin
      .from('fee_structures')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ message: 'Fee structure deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete fee structure' });
  }
}

// Used by the admin UI before a manual monthly run. This prevents duplicate
// billing attempts when the scheduled job has already processed the month.
export async function getMonthlyGenerationStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const [structuresResult, payments] = await Promise.all([
      supabaseAdmin
        .from('fee_structures')
        .select('id')
        .eq('school_id', schoolId)
        .eq('frequency', 'monthly'),
      // Paginated — large schools have >1000 payments per month and
      // `.limit()` does NOT bypass Supabase's 1000-row server cap.
      fetchAllRows<any>(
        supabaseAdmin
          .from('fee_payments')
          .select('id, fee_structure_id, title, remarks, due_date')
          .eq('school_id', schoolId)
          .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`)
      ),
    ]);
    const { data: monthlyStructures, error: structuresError } = structuresResult;

    if (structuresError) return res.status(400).json({ error: structuresError.message });

    const monthlyStructureIds = new Set((monthlyStructures || []).map((structure: any) => structure.id));
    const generatedPayments = (payments || []).filter((payment: any) => {
      if (payment.fee_structure_id && monthlyStructureIds.has(payment.fee_structure_id)) return true;
      const description = `${payment.title || ''} ${payment.remarks || ''}`.toLowerCase();
      return description.includes(`monthly fee - ${monthLabel}`.toLowerCase()) || description.includes(`auto-generated for ${monthLabel}`.toLowerCase());
    });

    return res.json({
      alreadyGenerated: generatedPayments.length > 0,
      generatedCount: generatedPayments.length,
      monthLabel,
      generatedOn: generatedPayments[0]?.due_date || null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to check monthly fee generation status' });
  }
}

// Create fee structure AND immediately push fees to students
export async function createFeeStructure(req: AuthenticatedRequest, res: Response) {
  try {
    const { classId, name, amount, frequency, dueDay, isMandatory, academicYearId, transportRouteId, appliesTo, pushImmediately } = req.body;
    const schoolId = req.user!.school_id;

    // Determine applies_to value and validate the target before creating anything.
    const effectiveAppliesTo = appliesTo || (transportRouteId ? 'transport_route' : (classId && classId !== 'all' && classId !== '' ? 'class' : 'all'));
    if (!['class', 'all', 'transport_route'].includes(effectiveAppliesTo)) {
      return res.status(400).json({ error: 'Invalid fee target' });
    }
    if (effectiveAppliesTo === 'class' && (!classId || classId === 'all')) {
      return res.status(400).json({ error: 'Select a class for a class-based fee' });
    }
    if (effectiveAppliesTo === 'transport_route') {
      if (!transportRouteId) return res.status(400).json({ error: 'Select a transport route for this fee' });
      const { data: route, error: routeError } = await supabaseAdmin
        .from('transport_routes')
        .select('id')
        .eq('id', transportRouteId)
        .eq('school_id', schoolId)
        .maybeSingle();
      if (routeError || !route) return res.status(400).json({ error: 'The selected transport route does not exist in this school' });
    }

    const { data, error } = await supabaseAdmin
      .from('fee_structures')
      .insert({
        school_id: schoolId,
        academic_year_id: academicYearId || null,
        class_id: (effectiveAppliesTo === 'class' && classId && classId !== 'all') ? classId : null,
        transport_route_id: effectiveAppliesTo === 'transport_route' ? transportRouteId : null,
        applies_to: effectiveAppliesTo,
        name,
        amount,
        frequency: frequency || 'monthly',
        due_day: dueDay || 10,
        is_mandatory: isMandatory !== false,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // ═══════════════════════════════════════════════════════
    // PUSH fee_payments to students conditional on date/approval
    // If day of month is <= 5, we auto-push.
    // If day of month is > 5, we only push if pushImmediately is true.
    // ═══════════════════════════════════════════════════════
    const todayDay = new Date().getDate();
    const shouldPush = todayDay <= 5 || pushImmediately === true;
    let studentsAssigned = 0;

    if (shouldPush) {
      const structureId = data.id;
      const now = new Date();
      const dueDayNum = dueDay || 10;
      const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDayNum, 28));
      // If due day already passed this month, push to next month
      if (dueDate < now) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
      const formattedDueDate = dueDate.toISOString().split('T')[0];
      const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

      // Find students based on applies_to type
      let studentQuery = supabaseAdmin
        .from('students')
        .select('id, fee_start_month, user:users(id, first_name, last_name)')
        .eq('school_id', schoolId);

      if (effectiveAppliesTo === 'transport_route' && data.transport_route_id) {
        studentQuery = studentQuery.eq('transport_route_id', data.transport_route_id);
      } else if (effectiveAppliesTo === 'class' && data.class_id) {
        const { data: sections } = await supabaseAdmin
          .from('sections')
          .select('id')
          .eq('class_id', data.class_id);
        const sectionIds = sections?.map(s => s.id) || [];
        if (sectionIds.length > 0) {
          studentQuery = studentQuery.in('section_id', sectionIds);
        }
      }

      // Paginated fetch — "push to all" must reach schools with >1000 students,
      // otherwise PostgREST caps this query at the first 1000 rows.
      const students = await fetchAllRows(
        studentQuery
      );

      if (students && students.length > 0) {
        // ── SHARED DEDUP: only push to students who don't ALREADY have
        //    this month's fee for this structure. If auto-cron already created
        //    fees for 100 of 5000 students, this SKIPS the 100 and only creates
        //    the missing 4900 (partial generation). Same logic as adminGenerateFees.
        const structuresForDedup: any[] = [{ id: structureId }];
        const alreadyBilled = await buildAlreadyBilledMap(schoolId, monthLabel, structuresForDedup);
        const exemptionMap = await buildExemptionMap(schoolId);

        // Current billing month in YYYY-MM for fee_start_month comparison.
        const billingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const newStudents = students.filter((s: any) => {
          const billed = alreadyBilled.get(s.id);
          if (billed?.has(structureId)) return false;
          const studentExemptions = exemptionMap.get(s.id);
          if (studentExemptions?.has(structureId)) return false;
          // Skip students whose fee_start_month is in the future
          // (consistent with auto-generation). NULL = charge immediately.
          if (s.fee_start_month && s.fee_start_month > billingMonth) return false;
          return true;
        });

        studentsAssigned = newStudents.length;

        if (newStudents.length > 0) {
          // ── APPLY RECURRING DISCOUNTS ──
          // Fetch active recurring discounts so this push path matches the
          // centralized generator (auto-cron / admin button). Without this,
          // a student with a monthly discount gets charged full price here
          // but a discounted price via the cron — inconsistent billing.
          const { data: recurringDiscounts } = await supabaseAdmin
            .from('fee_discounts')
            .select('student_id, amount, reason')
            .eq('school_id', schoolId)
            .eq('is_active', true)
            .in('recurrence', ['monthly', 'quarterly', 'annually']);

          const discountMap = new Map<string, number>();
          for (const d of recurringDiscounts || []) {
            discountMap.set(d.student_id, (discountMap.get(d.student_id) || 0) + Number(d.amount));
          }

          const feeInserts = newStudents.map((s: any) => {
            const discountAmt = Math.min(Number(amount), discountMap.get(s.id) || 0);
            const expected = Math.max(0, Number(amount) - discountAmt);

            let remarks = `Admin-generated for ${monthLabel}`;
            if (discountAmt > 0) {
              remarks += ` | Recurring Discount Applied: ₹${discountAmt}`;
            }

            return {
              school_id: schoolId,
              student_id: s.id,
              fee_structure_id: structureId,
              academic_year_id: academicYearId || null,
              transport_route_id: effectiveAppliesTo === 'transport_route' ? data.transport_route_id : null,
              title: `${name} - ${monthLabel}`,
              amount: Number(amount),
              discount_amount: discountAmt,
              paid_amount: 0,
              status: expected === 0 ? 'paid' : 'pending',
              payment_method: 'unpaid',
              due_date: formattedDueDate,
              late_fee: 0,
              remarks
            };
          });

          const pushed = await insertFeePaymentsChunked(feeInserts);
          if (pushed.length === 0) {
            console.error('[FEE-STRUCTURE] Failed to push fees to students');
          } else {
            console.log(`[FEE-STRUCTURE] Pushed "${name}" fee to ${pushed.length} students (${students.length - pushed.length} already had it)`);

            // ── BATCH notifications: ONE parent lookup for ALL students ──
            // Replaces the old N+1 per-student parent query loop.
            const parentUserIds = await batchFetchParentUserIds(newStudents.map((s: any) => s.id));
            await batchCreateInAppNotifications(
              schoolId,
              parentUserIds,
              pushed.map((p: any) => ({
                student_id: p.student_id,
                fee_id: p.id,
                title: name,
                amount: Number(amount),
                due_date: formattedDueDate,
              }))
            );
          }
        } else {
          console.log(`[FEE-STRUCTURE] All ${students.length} students already have "${name}" for ${monthLabel} — nothing new to push.`);
        }
      }
    }

    return res.status(201).json({
      ...data,
      studentsAssigned: studentsAssigned,
      message: shouldPush
        ? `Fee structure created and assigned to ${studentsAssigned} students.`
        : `Fee structure created. Current month dues generation was skipped because day is after the 5th.`
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create fee structure' });
  }
}

// Get fee payments (with filters)
export async function getFeePayments(req: AuthenticatedRequest, res: Response) {
  try {
    const { student_id, status, class_id, section_id, academic_year_id, search, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabaseAdmin
      .from('fee_payments')
      .select(`
        *,
        student:students!left(
          id, admission_number, roll_number, father_name, mother_name, guardian_phone, address, city, state, pincode,
          user:users!left(first_name, last_name, email, phone),
          section:sections!left(id, name, class:classes!left(id, name))
        ),
        fee_structure:fee_structures(name, frequency)
      `, { count: 'exact' })
      .eq('school_id', req.user!.school_id);

    // Role-based filtering
    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin.from('students').select('id').eq('user_id', req.user!.id).single();
      if (student) query = query.eq('student_id', student.id);
    } else if (req.user!.role === 'parent') {
      const { data: parent } = await supabaseAdmin.from('parents').select('id').eq('user_id', req.user!.id).single();
      if (parent) {
        const { data: links } = await supabaseAdmin.from('parent_students').select('student_id').eq('parent_id', parent.id);
        const childIds = links?.map((l: any) => l.student_id) || [];
        query = query.in('student_id', childIds);
      }
    } else {
      // Admin/Teacher filters
      if (student_id) query = query.eq('student_id', student_id as string);

      // Bug Fix: Resolve class -> sections -> students using student_id IN list
      // If section_id is provided, we use it directly (it's more specific).
      // NOTE: When academic_year_id is provided, we filter by students in that year.
      // When no academic_year_id is provided, we filter by current students.
      if (section_id && section_id !== 'all') {
        let studentQuery = supabaseAdmin.from('students').select('id').eq('section_id', section_id as string).eq('school_id', req.user!.school_id);
        if (academic_year_id && academic_year_id !== 'all') {
          studentQuery = studentQuery.eq('academic_year_id', academic_year_id as string);
        }
        const { data: sectionStudents } = await studentQuery;
        const sectionStudentIds = sectionStudents?.map((s: any) => s.id) || [];
        if (sectionStudentIds.length > 0) query = query.in('student_id', sectionStudentIds);
        else query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
      } else if (class_id && class_id !== 'all') {
        // If only class_id is provided, resolve all sections in that class
        // NOTE: sections has no school_id column; it lives on the parent classes table.
        const { data: classSections } = await supabaseAdmin
          .from('sections')
          .select('id, class:classes!inner(school_id)')
          .eq('class_id', class_id as string)
          .eq('classes.school_id', req.user!.school_id);
        const sectionIds = classSections?.map((s: any) => s.id) || [];
        if (sectionIds.length > 0) {
          let studentQuery = supabaseAdmin.from('students').select('id').in('section_id', sectionIds).eq('school_id', req.user!.school_id);
          if (academic_year_id && academic_year_id !== 'all') {
            studentQuery = studentQuery.eq('academic_year_id', academic_year_id as string);
          }
          const { data: classStudents } = await studentQuery;
          const classStudentIds = classStudents?.map((s: any) => s.id) || [];
          if (classStudentIds.length > 0) query = query.in('student_id', classStudentIds);
          else query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
        } else {
          query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
        }
      }

      if (search) {
        const safeSearch = (search as string).trim();

        // Search users by name (handle multi-word names like "John Doe")
        const searchParts = safeSearch.split(/\s+/);
        const orConditions = searchParts.map(p => `first_name.ilike.%${p}%,last_name.ilike.%${p}%`).join(',');

        const { data: matchingUsers } = await supabaseAdmin.from('users')
          .select('id')
          .or(orConditions);
        const userIds = matchingUsers?.map((u: any) => u.id) || [];

        // Bug Fix: Add school_id scope so search is restricted to this school's students only
        let studentQuery = supabaseAdmin.from('students').select('id').eq('school_id', req.user!.school_id);
        if (userIds.length > 0) {
          const filters = [`admission_number.ilike.%${safeSearch}%`, `user_id.in.(${userIds.join(',')})`];
          if (/^\d+$/.test(safeSearch)) filters.push(`roll_number.eq.${Number(safeSearch)}`);
          studentQuery = studentQuery.or(filters.join(','));
        } else {
          const filters = [`admission_number.ilike.%${safeSearch}%`];
          if (/^\d+$/.test(safeSearch)) filters.push(`roll_number.eq.${Number(safeSearch)}`);
          studentQuery = studentQuery.or(filters.join(','));
        }

        const { data: matchingStudents, error: studentErr } = await studentQuery;
        if (studentErr) console.error('Search students error:', studentErr);
        const studentIds = matchingStudents?.map((s: any) => s.id) || [];

        if (studentIds.length > 0) {
          query = query.in('student_id', studentIds);
        } else {
          query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
        }
      }
    }

    if (status) query = query.eq('status', status as string);

    // --- ALL-SCHOOL ACADEMIC YEAR FILTER (no class/section selected) ---
    // CRITICAL: Must filter by student_id list (not academic_year_id on the record) because
    // fee records may have null academic_year_id regardless of which year they belong to.
    // For large schools we use chunked parallel queries to bypass PostgREST URL limits.
    if (academic_year_id && academic_year_id !== 'all' && !class_id && !section_id && !student_id && !search) {
      const { data: yearStudents } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('school_id', req.user!.school_id)
        .eq('academic_year_id', academic_year_id as string)
        .eq('is_active', true);
      const yearStudentIds = yearStudents?.map((s: any) => s.id) || [];

      if (yearStudentIds.length === 0) {
        return res.json({ payments: [], total: 0, page: 1, totalPages: 0 });
      }

      const CHUNK = 150;
      if (yearStudentIds.length <= CHUNK) {
        // Small school — single query
        query = query.in('student_id', yearStudentIds);
      } else {
        // Large school — chunked parallel queries merged in memory
        const SELECT_EXPR = `
          *,
          student:students!left(
            id, admission_number, roll_number, father_name, mother_name, guardian_phone, address, city, state, pincode,
            user:users!left(first_name, last_name, email, phone),
            section:sections!left(id, name, class:classes!left(id, name))
          ),
          fee_structure:fee_structures(name, frequency)
        `;

        const chunks: string[][] = [];
        for (let i = 0; i < yearStudentIds.length; i += CHUNK) {
          chunks.push(yearStudentIds.slice(i, i + CHUNK));
        }

        const chunkResults = await Promise.all(
          chunks.map(chunk =>
            fetchAllRows<any>(
              supabaseAdmin
                .from('fee_payments')
                .select(SELECT_EXPR)
                .eq('school_id', req.user!.school_id)
                .in('student_id', chunk)
                .order('created_at', { ascending: false })
            )
          )
        );

        let allRecords: any[] = [];
        for (const result of chunkResults) {
          if (result) allRecords = allRecords.concat(result);
        }

        // Apply status filter in memory if provided
        if (status) {
          allRecords = allRecords.filter((r: any) => r.status === status);
        }

        allRecords.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const totalCount = allRecords.length;
        const pageData = allRecords.slice(offset, offset + parseInt(limit as string));

        return res.json({
          payments: pageData,
          total: totalCount,
          page: parseInt(page as string),
          totalPages: Math.ceil(totalCount / parseInt(limit as string)),
        });
      }
    }

    const { data, error, count } = await query
      .range(offset, offset + parseInt(limit as string) - 1)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    return res.json({
      payments: data,
      total: count,
      page: parseInt(page as string),
      totalPages: Math.ceil((count || 0) / parseInt(limit as string)),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch fee payments' });
  }
}

// Collect fee (cash/offline) - supports partial payment
export async function collectFee(req: AuthenticatedRequest, res: Response) {
  try {
    const { paymentId, amount, paymentMethod, remarks, referenceNumber, paidDate, notifyEmail, notifyWhatsapp, discountAmount = 0, lateFee = 0 } = req.body;

    // 1. Get current payment record
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('fee_payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (fetchErr || !current) return res.status(404).json({ error: 'Payment record not found' });

    // Adjusted Total: Original Amount + New Late Fee (or existing) - New Discount (or existing)
    // We accumulate them if they are passed.
    const totalLateFee = Number(current.late_fee || 0) + Number(lateFee);
    const totalDiscount = Number(current.discount_amount || 0) + Number(discountAmount);

    const adjustedTotal = Number(current.amount) + totalLateFee - totalDiscount;
    const pendingAmount = adjustedTotal - Number(current.paid_amount || 0);

    if (Number(amount) > pendingAmount) {
      return res.status(400).json({ error: `Payment amount cannot exceed the pending balance (₹${pendingAmount})` });
    }

    const newPaidAmount = Number(current.paid_amount || 0) + Number(amount);

    // We consider it paid if they have paid the adjusted total
    const newStatus = newPaidAmount >= adjustedTotal ? 'paid' : 'pending';

    // 2. Generate receipt number  ({SHORT}{YY}{MONTH}{SERIAL}, e.g. GNA2681)
    const receiptNumber = await generateReceiptNumber(supabaseAdmin, req.user!.school_id);

    // 3. Update payment record
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('fee_payments')
      .update({
        paid_amount: newPaidAmount,
        status: newStatus,
        late_fee: totalLateFee,
        discount_amount: totalDiscount,
        payment_method: paymentMethod || 'cash',
        paid_date: paidDate ? new Date(paidDate).toISOString() : new Date().toISOString(),
        receipt_number: receiptNumber,
        remarks: remarks || current.remarks,
        reference_number: referenceNumber || null,
      })
      .eq('id', paymentId)
      .select('*, student:students(id, roll_number, user:users(first_name, last_name))')
      .single();

    if (updateErr) return res.status(400).json({ error: updateErr.message });

    // 3b. Record individual transaction in logbook
    await supabaseAdmin
      .from('fee_transactions')
      .insert({
        school_id: req.user!.school_id,
        fee_payment_id: paymentId,
        amount: Number(amount),
        payment_method: paymentMethod || 'cash',
        receipt_number: receiptNumber,
        remarks: remarks || 'Manual Payment Entry'
      });

    // 3c. If fee is paid, auto-issue any linked pending inventory distributions
    if (newStatus === 'paid') {
      const { data: linkedDistributions } = await supabaseAdmin
        .from('student_inventory_distribution')
        .select('*')
        .eq('fee_payment_id', paymentId)
        .eq('status', 'pending');

      if (linkedDistributions && linkedDistributions.length > 0) {
        for (const dist of linkedDistributions) {
          const { data: item } = await supabaseAdmin.from('school_inventory').select('quantity, min_stock').eq('id', dist.item_id).single();
          if (item && item.quantity >= dist.quantity) {
            const newQty = item.quantity - dist.quantity;
            await supabaseAdmin.from('school_inventory').update({ quantity: newQty, status: newQty <= item.min_stock ? 'low' : 'good' }).eq('id', dist.item_id);

            await supabaseAdmin.from('student_inventory_distribution').update({
              status: 'issued',
              issue_date: new Date().toISOString()
            }).eq('id', dist.id);

            await supabaseAdmin.from('inventory_transactions').insert({
              school_id: req.user!.school_id,
              item_id: dist.item_id,
              type: 'issued',
              quantity: dist.quantity,
              remarks: `Issued automatically after fee payment #${receiptNumber}`,
              student_id: dist.student_id
            });
          }
        }
      }
    }

    // 4. Send receipt to parent (conditionally based on modal choices)
    const { data: parentLink } = await supabaseAdmin
      .from('parent_students')
      .select('parent:parents(user:users(id, email, phone))')
      .eq('student_id', current.student_id)
      .limit(1)
      .maybeSingle();

    const pUser = (parentLink as any)?.parent?.user;
    const sUser = (updated as any)?.student?.user;

    if (pUser && sUser && (notifyEmail !== false || notifyWhatsapp)) {
      const channels: string[] = [];
      if (notifyEmail !== false) channels.push('email');
      if (notifyWhatsapp) channels.push('whatsapp', 'sms');

      await notificationService.sendPaymentReceipt({
        schoolId: req.user!.school_id,
        parentEmail: notifyEmail !== false ? pUser.email : undefined,
        parentPhone: notifyWhatsapp ? (pUser.phone || '') : '',
        parentUserId: pUser.id,
        studentName: `${sUser.first_name} ${sUser.last_name || ''}`,
        rollNumber: (updated as any)?.student?.roll_number,
        amount,
        receiptNumber,
        paymentMethod: paymentMethod || 'Cash',
        transactionId: updated.id,
        date: new Date().toLocaleDateString('en-IN'),
      });
    } else if (pUser) {
      // Always create in-app notification even if email/whatsapp skipped
      await notificationService.createInAppNotification({
        schoolId: req.user!.school_id,
        userId: pUser.id,
        type: 'payment_receipt',
        title: `Fee Paid — Receipt #${receiptNumber}`,
        message: `₹${Number(amount).toLocaleString()} received via ${paymentMethod || 'Cash'}. Receipt: ${receiptNumber}`,
        sourceId: updated.id,
      });
    }

    // Calculate global remaining balance for this student
    const { data: allStudentFees, error: selectErr } = await supabaseAdmin
      .from('fee_payments')
      .select('id, amount, late_fee, discount_amount, paid_amount, title, status, fee_structures(name)')
      .eq('student_id', current.student_id)
      .eq('school_id', req.user!.school_id);

    if (selectErr) {
      console.error('[collectFee] Supabase query error:', selectErr);
    }

    let globalBalanceRemaining = 0;
    let grandTotalDue = 0;
    let grandTotalPaid = 0;
    let grandBalance = 0;
    const receiptItems: any[] = [];

    if (allStudentFees) {
      allStudentFees.forEach((f) => {
        const due = Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0);
        // For the fee we just updated, use the definitive newPaidAmount from memory (avoids DB read lag)
        const paid = f.id === updated.id ? newPaidAmount : Number(f.paid_amount || 0);
        const bal = Math.max(0, due - paid);
        if (bal > 0 || f.id === updated.id) {
          grandTotalDue += due;
          grandTotalPaid += paid;
          grandBalance += bal;

          // Transaction-specific paid amount is the current payment amount if it's the updated fee, otherwise 0
          const paidThisTxn = f.id === updated.id ? Number(amount) : 0;

          receiptItems.push({
            id: f.id,
            title: f.title || (f.fee_structures as any)?.name || 'Fee Payment',
            dueAmount: due,
            paidAmount: paidThisTxn,
            balance: bal,
            status: bal <= 0 ? 'paid' : 'pending'
          });
        }
      });
      globalBalanceRemaining = grandBalance;
    }

    return res.json({ ...updated, receiptNumber, globalBalanceRemaining, grandTotalDue, grandTotalPaid, grandBalance, items: receiptItems });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to collect fee' });
  }
}

// Bulk Collect fees for a single student
export async function bulkCollectFee(req: AuthenticatedRequest, res: Response) {
  try {
    const { paymentIds, amount, paymentMethod, remarks, referenceNumber, paidDate, notifyEmail, notifyWhatsapp } = req.body;

    if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
      return res.status(400).json({ error: 'No payment IDs provided' });
    }

    const receiptNumber = await generateReceiptNumber(supabaseAdmin, req.user!.school_id);

    const updatedPayments: any[] = [];
    let totalCollectedAmount = 0;

    // Sort paymentIds or fetch them sorted by created_at (oldest first)
    const { data: pendingPayments } = await supabaseAdmin
      .from('fee_payments')
      .select('*')
      .in('id', paymentIds)
      .order('created_at', { ascending: true });

    if (!pendingPayments || pendingPayments.length === 0) {
      return res.status(400).json({ error: 'No valid pending payments found to collect' });
    }

    let remainingAmountToDistribute = amount !== undefined && amount !== null ? Number(amount) : Infinity;

    for (const current of pendingPayments) {
      if (remainingAmountToDistribute <= 0) break;

      const adjustedTotal = Number(current.amount) + Number(current.late_fee || 0) - Number(current.discount_amount || 0);
      const pendingAmount = adjustedTotal - Number(current.paid_amount || 0);

      if (pendingAmount <= 0) continue; // Already fully paid

      // Determine how much to pay for this specific fee
      const amountCollectedForThis = Math.min(pendingAmount, remainingAmountToDistribute);
      const newPaidAmount = Number(current.paid_amount || 0) + amountCollectedForThis;
      const newStatus = newPaidAmount >= adjustedTotal ? 'paid' : 'pending';

      remainingAmountToDistribute -= amountCollectedForThis;
      totalCollectedAmount += amountCollectedForThis;

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('fee_payments')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus,
          payment_method: paymentMethod || 'cash',
          paid_date: paidDate ? new Date(paidDate).toISOString() : new Date().toISOString(),
          receipt_number: receiptNumber,
          remarks: remarks || current.remarks,
          reference_number: referenceNumber || null,
        })
        .eq('id', current.id)
        .select('*, student:students(id, roll_number, user:users(first_name, last_name, email, phone)), fee_structure:fee_structures(name)')
        .single();

      if (updateErr) {
        console.error('Update error in bulkCollectFee:', updateErr);
        continue;
      }

      updatedPayments.push({
        ...updated,
        collected_this_txn: amountCollectedForThis
      });

      // Record transaction
      await supabaseAdmin.from('fee_transactions').insert({
        school_id: req.user!.school_id,
        fee_payment_id: current.id,
        amount: amountCollectedForThis,
        payment_method: paymentMethod || 'cash',
        receipt_number: receiptNumber,
        remarks: remarks || 'Bulk Manual Payment Entry'
      });

      // Auto-issue inventory if applicable (only if fully paid)
      if (newStatus === 'paid') {
        const { data: linkedDistributions } = await supabaseAdmin
          .from('student_inventory_distribution')
          .select('*')
          .eq('fee_payment_id', current.id)
          .eq('status', 'pending');

        if (linkedDistributions && linkedDistributions.length > 0) {
          for (const dist of linkedDistributions) {
            const { data: item } = await supabaseAdmin.from('school_inventory').select('quantity, min_stock').eq('id', dist.item_id).single();
            if (item && item.quantity >= dist.quantity) {
              const newQty = item.quantity - dist.quantity;
              await supabaseAdmin.from('school_inventory').update({ quantity: newQty, status: newQty <= item.min_stock ? 'low' : 'good' }).eq('id', dist.item_id);
              await supabaseAdmin.from('student_inventory_distribution').update({ status: 'issued', issue_date: new Date().toISOString() }).eq('id', dist.id);
              await supabaseAdmin.from('inventory_transactions').insert({
                school_id: req.user!.school_id, item_id: dist.item_id, type: 'issued', quantity: dist.quantity,
                remarks: `Issued automatically after fee payment #${receiptNumber}`, student_id: dist.student_id
              });
            }
          }
        }
      }
    }

    if (updatedPayments.length === 0) {
      return res.status(400).json({ error: 'No valid pending payments found to collect' });
    }

    // Send notifications if applicable
    const studentId = updatedPayments[0].student_id;
    const { data: parentLink } = await supabaseAdmin
      .from('parent_students')
      .select('parent:parents(user:users(id, email, phone))')
      .eq('student_id', studentId)
      .limit(1)
      .maybeSingle();

    const pUser = (parentLink as any)?.parent?.user;
    const sUser = (updatedPayments[0] as any)?.student?.user;

    if (pUser && sUser && (notifyEmail !== false || notifyWhatsapp)) {
      const channels: string[] = [];
      if (notifyEmail !== false) channels.push('email');
      if (notifyWhatsapp) channels.push('whatsapp', 'sms');

      await notificationService.sendPaymentReceipt({
        schoolId: req.user!.school_id,
        parentEmail: notifyEmail !== false ? pUser.email : undefined,
        parentPhone: notifyWhatsapp ? (pUser.phone || '') : '',
        parentUserId: pUser.id,
        studentName: `${sUser.first_name} ${sUser.last_name || ''}`,
        rollNumber: (updatedPayments[0] as any)?.student?.roll_number,
        amount: totalCollectedAmount,
        receiptNumber,
        paymentMethod: paymentMethod || 'Cash',
        transactionId: updatedPayments[0].id,
        date: new Date().toLocaleDateString('en-IN'),
      });
    } else if (pUser) {
      await notificationService.createInAppNotification({
        schoolId: req.user!.school_id,
        userId: pUser.id,
        type: 'payment_receipt',
        title: `Bulk Fee Paid — Receipt #${receiptNumber}`,
        message: `₹${totalCollectedAmount.toLocaleString()} received via ${paymentMethod || 'Cash'}. Receipt: ${receiptNumber}`,
        sourceId: updatedPayments[0].id,
      });
    }

    // Compute grand totals for the receipt.
    // We use a two-step approach:
    // 1. Build a map of updated fees from in-memory data (guaranteed accurate, no DB lag)
    // 2. Fetch ALL fees for the student from DB (for fees not touched in this transaction)
    // Then merge: for fees updated in this transaction, use in-memory values; for others, use DB values.
    const { data: allStudentFees, error: selectErr } = await supabaseAdmin
      .from('fee_payments')
      .select('id, amount, late_fee, discount_amount, paid_amount, title, status, fee_structures(name)')
      .eq('student_id', studentId)
      .eq('school_id', req.user!.school_id);

    if (selectErr) {
      console.error('[bulkCollectFee] Supabase query error:', selectErr);
    }

    // Build a lookup of in-memory updated payment values (guaranteed correct post-update)
    const updatedMap = new Map<string, any>();
    for (const p of updatedPayments) {
      updatedMap.set(p.id, p);
    }

    let globalBalanceRemaining = 0;
    let grandTotalDue = 0;
    let grandTotalPaid = 0;
    let grandBalance = 0;
    const receiptItems: any[] = [];

    const feesToProcess = allStudentFees && allStudentFees.length > 0
      ? allStudentFees
      : updatedPayments; // fallback to in-memory if DB read fails

    feesToProcess.forEach((f: any) => {
      // For fees updated in this transaction, use the in-memory value (avoids DB read lag)
      const inMemory = updatedMap.get(f.id);
      const due = Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0);
      const paid = inMemory ? Number(inMemory.paid_amount || 0) : Number(f.paid_amount || 0);
      const bal = Math.max(0, due - paid);
      // Include: fees with a remaining balance OR fees touched in this transaction
      if (bal > 0 || updatedMap.has(f.id)) {
        grandTotalDue += due;
        grandTotalPaid += paid;
        grandBalance += bal;

        // Transaction-specific paid amount is what was collected in this transaction, or 0
        const paidThisTxn = inMemory ? Number(inMemory.collected_this_txn || 0) : 0;

        receiptItems.push({
          id: f.id,
          title: f.title || (f.fee_structures as any)?.name || 'Fee Payment',
          dueAmount: due,
          paidAmount: paidThisTxn,
          balance: bal,
          status: bal <= 0 ? 'paid' : 'pending'
        });
      }
    });
    globalBalanceRemaining = grandBalance;

    return res.json({
      success: true,
      receiptNumber,
      totalCollected: totalCollectedAmount,
      globalBalanceRemaining,
      grandTotalDue,
      grandTotalPaid,
      grandBalance,
      payments: updatedPayments,
      items: receiptItems
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to bulk collect fees' });
  }
}


// Add Extra Fee / Generate Fee
export async function addExtraFee(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, title, amount, remarks, dueDate, lateFee, notifyEmail, notifyWhatsapp } = req.body;

    const dueDateStr = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('fee_payments')
      .insert({
        school_id: req.user!.school_id,
        student_id: studentId,
        amount: Number(amount) || 0,
        paid_amount: 0,
        status: 'pending',
        payment_method: 'unpaid',
        due_date: dueDateStr,
        late_fee: lateFee ? Number(lateFee) : 0,
        remarks: `${title}${remarks ? ': ' + remarks : ''}`.trim()
      })
      .select('*, student:students(id, user:users(first_name, last_name))')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Notify parent about new fee
    const { data: parentLink } = await supabaseAdmin
      .from('parent_students')
      .select('parent:parents(user:users(id, email, phone))')
      .eq('student_id', studentId)
      .limit(1)
      .maybeSingle();

    const pUser = (parentLink as any)?.parent?.user;
    const sUser = (data as any)?.student?.user;

    if (pUser) {
      // Always in-app
      await notificationService.createInAppNotification({
        schoolId: req.user!.school_id,
        userId: pUser.id,
        type: 'fee_reminder',
        title: `New Fee: ${title}`,
        message: `₹${Number(amount).toLocaleString()} due by ${new Date(dueDateStr).toLocaleDateString('en-IN')}. Please clear this at the earliest.`,
        metadata: { sourceId: data.id }
      });

      // Also notify student in-app
      if (sUser) {
        const { data: studentUser } = await supabaseAdmin
          .from('users').select('id').eq('id', (data as any).student?.user?.id || '').maybeSingle();
        // Notify via multi-channel if requested
        if ((notifyEmail !== false || notifyWhatsapp) && (sUser.first_name)) {
          const channels: ('email' | 'whatsapp' | 'push')[] = [];
          if (notifyEmail !== false && pUser.email) channels.push('email');
          if (notifyWhatsapp && pUser.phone) channels.push('whatsapp');
          if (channels.length > 0) {
            notificationService.sendMultiChannel({
              schoolId: req.user!.school_id,
              userId: pUser.id,
              channels,
              type: 'fee_reminder',
              title: `New Fee Generated: ${title}`,
              message: `Dear Parent, a fee of ₹${Number(amount).toLocaleString()} (${title}) has been generated for ${sUser.first_name} ${sUser.last_name || ''}. Due Date: ${new Date(dueDateStr).toLocaleDateString('en-IN')}.`,
              phone: pUser.phone || undefined,
              emailAddress: pUser.email || undefined,
            }).catch(err => console.error('Fee notification error:', err));
          }
        }
      }
    }

    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to generate fee' });
  }
}

// Create online payment order (Razorpay)
export async function createPaymentOrder(req: AuthenticatedRequest, res: Response) {
  try {
    const { feePaymentId } = req.body;

    const { data: payment, error } = await supabaseAdmin
      .from('fee_payments')
      .select(`
        *,
        student:students(
          user:users(first_name, last_name)
        )
      `)
      .eq('id', feePaymentId)
      .eq('school_id', req.user!.school_id)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: 'Fee payment record not found' });
    }

    if (payment.status === 'paid') {
      return res.status(400).json({ error: 'Fee already paid' });
    }

    const totalLateFee = Number(payment.late_fee || 0);
    const totalDiscount = Number(payment.discount_amount || 0);
    const adjustedTotal = Number(payment.amount) + totalLateFee - totalDiscount;
    const pendingAmount = adjustedTotal - Number(payment.paid_amount || 0);

    if (pendingAmount <= 0) {
      return res.status(400).json({ error: 'Fee already fully paid' });
    }

    const studentName = `${(payment as any).student?.user?.first_name || ''} ${(payment as any).student?.user?.last_name || ''}`;

    // Process payment directly (manual/offline — Razorpay removed)
    const result = await paymentService.processPayment({
      feePaymentId: payment.id,
      paymentMethod: 'manual',
      skipSignatureVerify: true,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ success: true, message: 'Payment recorded successfully', receiptNumber: result.receiptNumber, amount: result.amount });
  } catch (error: any) {
    console.error('Create payment order error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Verify online payment
export async function verifyPayment(req: AuthenticatedRequest, res: Response) {
  try {
    const { feePaymentId, transactionId, paymentMethod } = req.body;

    if (!feePaymentId) {
      return res.status(400).json({ error: 'feePaymentId is required' });
    }

    const result = await paymentService.processPayment({
      feePaymentId,
      transactionId,
      paymentMethod: paymentMethod || 'manual',
      skipSignatureVerify: true,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ message: 'Payment verified successfully', receiptNumber: result.receiptNumber, amount: result.amount });
  } catch (error: any) {
    console.error('Verify payment error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Get fee statistics
export async function getFeeStats(req: AuthenticatedRequest, res: Response) {
  try {
    const { class_id, section_id, academic_year_id, search, status } = req.query;

    let query = supabaseAdmin
      .from('fee_payments')
      .select(`
        amount, paid_amount, status, payment_method, paid_date, late_fee, discount_amount, academic_year_id
      `)
      .eq('school_id', req.user!.school_id);

    // Apply DB filters
    if (status && status !== 'all') {
      query = query.eq('status', status as string);
    }

    if (academic_year_id && academic_year_id !== 'all') {
      if (!section_id && !class_id) {
        const { data: yearStudents } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('school_id', req.user!.school_id)
          .eq('academic_year_id', academic_year_id as string)
          .eq('is_active', true);
        const yearStudentIds = yearStudents?.map((s: any) => s.id) || [];

        if (yearStudentIds.length === 0) {
          return res.json({ total: 0, collected: 0, pending: 0, rate: 0, defaulters: 0, monthlyTrends: [] });
        }

        const CHUNK = 150;
        if (yearStudentIds.length <= CHUNK) {
          query = query.in('student_id', yearStudentIds);
        } else {
          // Large school: run chunked parallel queries and aggregate in memory
          const chunks: string[][] = [];
          for (let i = 0; i < yearStudentIds.length; i += CHUNK) {
            chunks.push(yearStudentIds.slice(i, i + CHUNK));
          }
          const chunkResults = await Promise.all(
            chunks.map(chunk =>
              fetchAllRows<any>(
                supabaseAdmin
                  .from('fee_payments')
                  .select('amount, paid_amount, status, payment_method, paid_date, late_fee, discount_amount, academic_year_id')
                  .eq('school_id', req.user!.school_id)
                  .in('student_id', chunk)
              )
            )
          );
          let allRecords: any[] = [];
          for (const result of chunkResults) {
            if (result) allRecords = allRecords.concat(result);
          }
          if (status && status !== 'all') {
            allRecords = allRecords.filter((r: any) => r.status === status);
          }
          // Aggregate stats in memory and return early
          const total = allRecords.reduce((sum, p: any) => sum + (Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0)), 0);
          const collected = allRecords.reduce((sum, p: any) => sum + Number(p.paid_amount || 0), 0);
          const pending = total - collected;
          const defaulters = allRecords.filter((p: any) => p.status === 'overdue').length;
          const monthlyMap: Record<string, number> = {};
          allRecords.filter((p: any) => p.status === 'paid' && p.paid_date).forEach((p: any) => {
            const month = p.paid_date.substring(0, 7);
            monthlyMap[month] = (monthlyMap[month] || 0) + Number(p.paid_amount || 0);
          });
          const monthlyTrends = Object.entries(monthlyMap)
            .map(([month, amount]) => ({ month, amount }))
            .sort((a, b) => a.month.localeCompare(b.month));
          return res.json({ total, collected, pending, rate: total > 0 ? Math.round((collected / total) * 10000) / 100 : 0, defaulters, monthlyTrends });
        }
      }
    }

    // Resolve class -> section -> student IDs (with academic year context)
    if (section_id && section_id !== 'all') {
      let studentQuery = supabaseAdmin.from('students').select('id').eq('section_id', section_id as string).eq('school_id', req.user!.school_id);
      if (academic_year_id && academic_year_id !== 'all') {
        studentQuery = studentQuery.eq('academic_year_id', academic_year_id as string);
      }
      const { data: sectionStudents } = await studentQuery;
      const sectionStudentIds = sectionStudents?.map((s: any) => s.id) || [];
      if (sectionStudentIds.length > 0) query = query.in('student_id', sectionStudentIds);
      else query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
    } else if (class_id && class_id !== 'all') {
      const { data: classSections } = await supabaseAdmin
        .from('sections')
        .select('id, class:classes!inner(school_id)')
        .eq('class_id', class_id as string)
        .eq('classes.school_id', req.user!.school_id);
      const sectionIds = classSections?.map((s: any) => s.id) || [];
      if (sectionIds.length > 0) {
        let studentQuery = supabaseAdmin.from('students').select('id').in('section_id', sectionIds).eq('school_id', req.user!.school_id);
        if (academic_year_id && academic_year_id !== 'all') {
          studentQuery = studentQuery.eq('academic_year_id', academic_year_id as string);
        }
        const { data: classStudents } = await studentQuery;
        const classStudentIds = classStudents?.map((s: any) => s.id) || [];
        if (classStudentIds.length > 0) query = query.in('student_id', classStudentIds);
        else query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    if (search) {
      const safeSearch = (search as string).trim();
      const searchParts = safeSearch.split(/\\s+/);
      const orConditions = searchParts.map(p => `first_name.ilike.%${p}%,last_name.ilike.%${p}%`).join(',');

      const { data: matchingUsers } = await supabaseAdmin.from('users')
        .select('id')
        .or(orConditions);
      const userIds = matchingUsers?.map((u: any) => u.id) || [];

      let studentQuery = supabaseAdmin.from('students').select('id').eq('school_id', req.user!.school_id);
      if (userIds.length > 0) {
        const filters = [`admission_number.ilike.%${safeSearch}%`, `user_id.in.(${userIds.join(',')})`];
        if (/^\d+$/.test(safeSearch)) filters.push(`roll_number.eq.${Number(safeSearch)}`);
        studentQuery = studentQuery.or(filters.join(','));
      } else {
        const filters = [`admission_number.ilike.%${safeSearch}%`];
        if (/^\d+$/.test(safeSearch)) filters.push(`roll_number.eq.${Number(safeSearch)}`);
        studentQuery = studentQuery.or(filters.join(','));
      }

      const { data: matchingStudents } = await studentQuery;
      const studentIds = matchingStudents?.map((s: any) => s.id) || [];

      if (studentIds.length > 0) query = query.in('student_id', studentIds);
      else query = query.eq('student_id', '00000000-0000-0000-0000-000000000000');
    }

    // Paginated — `.limit(50000)` did NOT bypass Supabase's 1000-row server
    // cap; stats for large schools were silently computed from 1000 rows only.
    const payments = await fetchAllRows<any>(query);

    if (payments.length === 0) return res.json({ total: 0, collected: 0, pending: 0, rate: 0, defaulters: 0, monthlyTrends: [] });

    const total = payments.reduce((sum, p: any) => sum + (Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0)), 0);
    const collected = payments.reduce((sum, p: any) => sum + Number(p.paid_amount || 0), 0);
    const pending = total - collected;
    const defaulters = payments.filter((p: any) => p.status === 'overdue').length;

    // Monthly collection trends
    const monthlyMap: Record<string, number> = {};
    payments.filter((p: any) => p.status === 'paid' && p.paid_date).forEach((p: any) => {
      const month = p.paid_date.substring(0, 7);
      monthlyMap[month] = (monthlyMap[month] || 0) + Number(p.paid_amount || 0);
    });

    const monthlyTrends = Object.entries(monthlyMap)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return res.json({
      total,
      collected,
      pending,
      rate: total > 0 ? Math.round((collected / total) * 10000) / 100 : 0,
      defaulters,
      monthlyTrends,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch fee stats' });
  }
}

// Send fee reminders to defaulters
export async function sendFeeReminders(req: AuthenticatedRequest, res: Response) {
  try {
    const { class_id, section_id, student_id } = req.body;

    let query = supabaseAdmin
      .from('fee_payments')
      .select(`
        *,
        student:students!inner(
          id, section_id,
          user:users(first_name, last_name),
          section:sections!inner(id, class_id, name, class:classes(name))
        )
      `)
      .eq('school_id', req.user!.school_id)
      .in('status', ['pending', 'overdue']);

    if (student_id) query = query.eq('student_id', student_id);
    else if (section_id) query = query.eq('student.section_id', section_id);
    else if (class_id) query = query.eq('student.section.class_id', class_id);

    const { data: pendingPayments } = await query;

    if (!pendingPayments || pendingPayments.length === 0) {
      return res.json({ message: 'No pending payments found', sent: 0 });
    }

    let sentCount = 0;
    for (const payment of pendingPayments) {
      const { data: parentLink } = await supabaseAdmin
        .from('parent_students')
        .select('parent:parents(user:users(id, email, phone))')
        .eq('student_id', payment.student_id)
        .limit(1)
        .single();

      const pUser = (parentLink as any)?.parent?.user;
      if (pUser) {
        const parentUser = pUser;
        const studentUser = (payment as any).student?.user;

        await notificationService.sendFeeReminder({
          schoolId: req.user!.school_id,
          parentPhone: parentUser.phone || '',
          parentEmail: parentUser.email || '',
          parentUserId: parentUser.id,
          studentName: `${studentUser?.first_name || ''} ${studentUser?.last_name || ''}`,
          amount: payment.amount,
          dueDate: payment.due_date || 'ASAP',
        });
        sentCount++;
      }
    }

    return res.json({ message: `Reminders sent to ${sentCount} parents`, sent: sentCount });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to send reminders' });
  }
}

// Sync Dues: Delegate to the CENTRALIZED fee generation service.
// This ensures sync uses the exact same dedup / exemptions / recurring
// discounts / IST-month logic as the auto-cron and admin button, so it
// can never create a duplicate or miss a discount.
export async function syncDues(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;

    const result = await generateFeesForMonth({
      schoolId,
      feeType: 'both',
      force: false,
    });

    return res.json({
      message: `Sync complete. Generated ${result.generated} new payment records (${result.skipped} already billed or exempted).`,
      syncCount: result.generated,
      generated: result.generated,
      skipped: result.skipped,
      monthLabel: result.monthLabel,
      details: result.details,
    });
  } catch (error: any) {
    console.error('Sync Dues Error:', error);
    return res.status(500).json({ error: 'Failed to synchronize fee records' });
  }
}

// Get transactions for a specific fee payment (Digital Logbook History)
export async function getFeeTransactions(req: AuthenticatedRequest, res: Response) {
  try {
    const { paymentId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('fee_transactions')
      .select('*, fee_payment:fee_payments(amount, paid_amount, late_fee, discount_amount, title, remarks)')
      .eq('fee_payment_id', paymentId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
}

export async function getAllFeeTransactions(req: AuthenticatedRequest, res: Response) {
  try {
    const { start_date, end_date, class_id, section_id, payment_method, academic_year_id } = req.query;

    let query = supabaseAdmin
      .from('fee_transactions')
      .select(`
        *,
        fee_payment:fee_payments!inner(
          amount, paid_amount, late_fee, discount_amount, title, remarks, student_id,
          student:students(
            id, admission_number, roll_number, father_name, mother_name, guardian_phone, address, city, state, pincode,
            user:users(first_name, last_name, phone),
            section:sections(name, class:classes(name))
          )
        )
      `)
      .eq('school_id', req.user!.school_id);

    if (start_date) {
      query = query.gte('created_at', `${start_date}T00:00:00.000Z`);
    }
    if (end_date) {
      query = query.lte('created_at', `${end_date}T23:59:59.999Z`);
    }
    if (payment_method && payment_method !== 'all') {
      query = query.eq('payment_method', payment_method as string);
    }

    // Resolve class -> section -> student IDs to filter transactions
    if (section_id && section_id !== 'all') {
      let studentQuery = supabaseAdmin.from('students').select('id').eq('section_id', section_id as string).eq('school_id', req.user!.school_id);
      if (academic_year_id && academic_year_id !== 'all') studentQuery = studentQuery.eq('academic_year_id', academic_year_id as string);

      const { data: sectionStudents } = await studentQuery;
      const sectionStudentIds = sectionStudents?.map((s: any) => s.id) || [];
      if (sectionStudentIds.length > 0) {
        if (sectionStudentIds.length <= 200) query = query.in('fee_payment.student_id', sectionStudentIds);
        else {
          // For large sections, doing an IN on joined table fails, fallback to no strict filter
          // In real-world, we'd use a raw SQL RPC, but this is an edge case since sections rarely have > 200 students.
        }
      } else {
        query = query.eq('fee_payment.student_id', '00000000-0000-0000-0000-000000000000');
      }
    } else if (class_id && class_id !== 'all') {
      const { data: classSections } = await supabaseAdmin
        .from('sections')
        .select('id, class:classes!inner(school_id)')
        .eq('class_id', class_id as string)
        .eq('classes.school_id', req.user!.school_id);
      const sectionIds = classSections?.map((s: any) => s.id) || [];
      if (sectionIds.length > 0) {
        let studentQuery = supabaseAdmin.from('students').select('id').in('section_id', sectionIds).eq('school_id', req.user!.school_id);
        if (academic_year_id && academic_year_id !== 'all') studentQuery = studentQuery.eq('academic_year_id', academic_year_id as string);

        const { data: classStudents } = await studentQuery;
        const classStudentIds = classStudents?.map((s: any) => s.id) || [];
        if (classStudentIds.length > 0) {
          if (classStudentIds.length <= 200) query = query.in('fee_payment.student_id', classStudentIds);
          // if > 200, we skip the `.in` to avoid the 400 Bad Request URL limit on nested joins.
          // In a heavily populated class, filtering on the client is safer if an RPC is not available.
        } else {
          query = query.eq('fee_payment.student_id', '00000000-0000-0000-0000-000000000000');
        }
      } else {
        query = query.eq('fee_payment.student_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(2000);

    if (error) return res.status(400).json({ error: error.message });

    // Group transactions by receipt_number to show "Global Payments"
    const groupedData: any[] = [];
    const transactionMap = new Map<string, any>();

    (data || []).forEach((txn: any) => {
      // fee_payment is a relation (object or array)
      const feePayment = Array.isArray(txn.fee_payment) ? txn.fee_payment[0] : txn.fee_payment;
      if (!feePayment) return; // skip orphans

      const receiptNumber = txn.receipt_number;

      const subItem = {
        title: feePayment.title || feePayment.remarks || 'Fee',
        dueAmount: Number(feePayment.amount || 0) + Number(feePayment.late_fee || 0) - Number(feePayment.discount_amount || 0),
        paidAmount: Number(txn.amount || 0), // How much was paid for THIS sub-fee in this txn
        balance: Math.max(0, (Number(feePayment.amount || 0) + Number(feePayment.late_fee || 0) - Number(feePayment.discount_amount || 0)) - Number(feePayment.paid_amount || 0)),
      };

      if (receiptNumber) {
        if (transactionMap.has(receiptNumber)) {
          const existing = transactionMap.get(receiptNumber);
          existing.amount += Number(txn.amount);

          existing.fee_payment.amount = Number(existing.fee_payment.amount || 0) + Number(feePayment.amount || 0);
          existing.fee_payment.paid_amount = Number(existing.fee_payment.paid_amount || 0) + Number(feePayment.paid_amount || 0);
          existing.fee_payment.late_fee = Number(existing.fee_payment.late_fee || 0) + Number(feePayment.late_fee || 0);
          existing.fee_payment.discount_amount = Number(existing.fee_payment.discount_amount || 0) + Number(feePayment.discount_amount || 0);

          existing.sub_items.push(subItem);

          // Combine titles/remarks
          const shortTitle = feePayment.title || feePayment.remarks || 'Fee';
          if (!existing.fee_payment.title.includes(shortTitle)) {
            existing.fee_payment.title += `, ${shortTitle}`;
          }
        } else {
          // Clone the object so we don't mutate the original by reference
          const newTxn = JSON.parse(JSON.stringify(txn));
          newTxn.fee_payment = Array.isArray(newTxn.fee_payment) ? newTxn.fee_payment[0] : newTxn.fee_payment;
          newTxn.fee_payment.title = newTxn.fee_payment.title || newTxn.fee_payment.remarks || 'Fee';
          newTxn.sub_items = [subItem];
          transactionMap.set(receiptNumber, newTxn);
          groupedData.push(newTxn); // Push reference
        }
      } else {
        // No receipt number, keep as individual
        txn.fee_payment = feePayment;
        txn.sub_items = [subItem];
        groupedData.push(txn);
      }
    });

    // Fetch school expenses to include in the Global Ledger
    const { data: expenses } = await supabaseAdmin
      .from('school_expenses')
      .select('*')
      .eq('school_id', req.user!.school_id)
      .eq('status', 'paid');
      
    if (expenses && expenses.length > 0) {
      expenses.forEach((expense: any) => {
        groupedData.push({
          id: expense.id,
          created_at: expense.date || expense.created_at,
          receipt_number: expense.bill_number || `EXP-${expense.id.substring(0,6)}`,
          payment_method: expense.payment_method,
          amount: expense.amount,
          is_expense: true,
          fee_payment: {
            title: expense.reason || expense.title,
            student: {
              user: {
                first_name: expense.payee || 'Expense',
                last_name: `(${expense.category || 'Bill'})`
              }
            }
          }
        });
      });
    }

    // Sort combined data by date descending
    groupedData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json(groupedData);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch global transactions' });
  }
}

// Get specific fee receipt details
export async function getFeeReceipt(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('fee_payments')
      .select(`
        *,
        student:students(
          id, admission_number, roll_number,
          user:users(first_name, last_name, email, phone),
          section:sections(id, name, class:classes(name))
        ),
        fee_structure:fee_structures(name, amount, frequency)
      `)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Receipt not found' });

    // Check access: Admins/Teachers see all, parents/students see only their own
    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin.from('students').select('id').eq('user_id', req.user!.id).single();
      if (student?.id !== data.student_id) return res.status(403).json({ error: 'Access denied' });
    } else if (req.user!.role === 'parent') {
      const { data: parent } = await supabaseAdmin.from('parents').select('id').eq('user_id', req.user!.id).single();
      const { data: link } = await supabaseAdmin.from('parent_students').select('id').eq('parent_id', parent?.id).eq('student_id', data.student_id).single();
      if (!link) return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch receipt details' });
  }
}

export async function bulkAssignFee(req: AuthenticatedRequest, res: Response) {
  try {
    const { targetType, targetId, title, amount, dueDate, remarks, lateFee, notifyEmail, notifyWhatsapp } = req.body;
    const schoolId = req.user!.school_id;

    if (!title || !amount) return res.status(400).json({ error: 'Title and amount are required' });

    let studentIds: string[] = [];

    if (targetType === 'student') {
      studentIds = [targetId];
    } else if (targetType === 'section') {
      // Paginated fetch — a section can exceed 1000 students in large schools.
      const rows = await fetchAllRows<{ id: string }>(
        supabaseAdmin.from('students').select('id').eq('section_id', targetId).eq('school_id', schoolId)
      );
      studentIds = rows.map(s => s.id);
    } else if (targetType === 'class') {
      const { data: sections } = await supabaseAdmin.from('sections').select('id').eq('class_id', targetId);
      const sectionIds = sections?.map(s => s.id) || [];
      if (sectionIds.length > 0) {
        // Paginated fetch — a class (sum of its sections) can exceed 1000 students.
        const rows = await fetchAllRows<{ id: string }>(
          supabaseAdmin.from('students').select('id').in('section_id', sectionIds).eq('school_id', schoolId)
        );
        studentIds = rows.map(s => s.id);
      }
    } else if (targetType === 'all') {
      // Paginated fetch — WITHOUT this, PostgREST caps the query at 1000 rows,
      // so "push fee to all" skipped every student past the first 1000.
      const rows = await fetchAllRows<{ id: string }>(
        supabaseAdmin.from('students').select('id').eq('school_id', schoolId)
      );
      studentIds = rows.map(s => s.id);
    }

    if (studentIds.length === 0) return res.status(400).json({ error: 'No students found for the selected target' });

    const dueDateStr = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ── DEDUP: Skip students who ALREADY have a pending fee with this exact title ──
    // Prevents duplicate billing when the same fee is bulk-assigned twice.
    const trimmedTitle = String(title).trim();
    const lowerTitle = trimmedTitle.toLowerCase();

    // Query existing payments with the same title for these students (chunked IN)
    const existingSet = new Set<string>();
    for (let i = 0; i < studentIds.length; i += 500) {
      const idChunk = studentIds.slice(i, i + 500);
      const { data: existing } = await supabaseAdmin
        .from('fee_payments')
        .select('student_id, title')
        .eq('school_id', schoolId)
        .in('student_id', idChunk)
        .in('status', ['pending', 'overdue']);

      for (const e of existing || []) {
        if (String(e.title || '').toLowerCase() === lowerTitle) {
          existingSet.add(e.student_id);
        }
      }
    }

    const newStudentIds = studentIds.filter(id => !existingSet.has(id));
    if (newStudentIds.length === 0) {
      return res.status(200).json({
        message: `All ${studentIds.length} students already have the fee "${trimmedTitle}" — nothing new to assign.`,
        count: 0,
        skipped: studentIds.length,
      });
    }

    const feeInserts = newStudentIds.map(id => ({
      school_id: schoolId,
      student_id: id,
      amount: Number(amount),
      paid_amount: 0,
      status: 'pending',
      payment_method: 'unpaid',
      due_date: dueDateStr,
      late_fee: lateFee ? Number(lateFee) : 0,
      remarks: `${title}${remarks ? ': ' + remarks : ''}`.trim()
    }));

    // Use chunked insert to support 5000+ students safely
    const inserted = await insertFeePaymentsChunked(feeInserts);
    if (inserted.length === 0) {
      return res.status(500).json({ error: 'Failed to assign fee to any student' });
    }

    // Batch notification: ONE parent lookup query instead of per-student N+1
    const parentUserIds = await batchFetchParentUserIds(newStudentIds);
    await batchCreateInAppNotifications(
      schoolId,
      parentUserIds,
      inserted.map((p: any) => ({
        student_id: p.student_id,
        fee_id: p.id,
        title: trimmedTitle,
        amount: Number(amount),
        due_date: dueDateStr,
      }))
    );

    return res.status(201).json({
      message: `Successfully assigned fee to ${inserted.length} students (${existingSet.size} already had it).`,
      count: inserted.length,
      skipped: existingSet.size,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to bulk assign fee' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN BULK FEE GENERATION (Optimized + Logged)
// Reads from BOTH fee_structures (tuition) AND transport_routes (transport).
// Accepts fee_type: 'tuition' | 'transport' | 'both' (default: 'both').
// Accepts structure_id/route_id for per-structure generation (progress UI).
//
// KEY OPTIMIZATIONS for large schools (5000+ students):
//  1. Batch duplicate detection — queries existing payments ONCE per school.
//  2. Batch exemption fetch — one query for all structures.
//  3. Chunked inserts (500 rows) — each chunk is atomic (Supabase REST API
//     treats each .insert() as a transaction; if one row fails, the whole
//     chunk rolls back automatically).
//  4. If one batch fails, logs and CONTINUES (partial success, not total failure).
//  5. Only generates for students who DON'T already have the fee (dedupe guard).
//  6. Generation logs — every run is logged to fee_generation_logs with metrics.
//  7. Per-structure generation — supports structure_id/route_id for real-time
//     progress reporting in the frontend.
// ════════════════════════════════════════════════════════════════════════════
export async function adminGenerateFees(req: AuthenticatedRequest, res: Response) {
  const startTime = Date.now();
  try {
    const schoolId = req.user!.school_id;
    const { class_id, section_id, fee_type = 'both', structure_id, route_id, month } = req.body as {
      class_id?: string;
      section_id?: string;
      fee_type?: 'tuition' | 'transport' | 'both';
      structure_id?: string;
      route_id?: string;
      month?: string;
    };

    const now = new Date();
    const monthStr = month ? monthLabelFromMonth(month) : now.toLocaleString('default', { month: 'long', year: 'numeric' });

    // ── Create generation log entry ──
    const { data: genLog } = await supabaseAdmin
      .from('fee_generation_logs')
      .insert({
        school_id: schoolId,
        month: monthStr,
        year: now.getFullYear(),
        triggered_by: 'admin',
        triggered_by_user_id: req.user!.id,
        fee_type: fee_type,
        class_id: class_id || null,
        section_id: section_id || null,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const logId = genLog?.id;

    // ════════════════════════════════════════════════════════
    // DELEGATE to the CENTRALIZED fee generation service.
    // This ensures identical duplicate-detection and month logic
    // across auto-cron, admin button, admission wizard, and sync.
    // ════════════════════════════════════════════════════════
    const result = await generateFeesForMonth({
      schoolId,
      month,  // <-- admins can now pick which month to generate
      classId: class_id,
      sectionId: section_id,
      feeType: fee_type,
      structureIds: structure_id ? [structure_id] : undefined,
      force: false,
    });

    const totalGenerated = result.generated;
    const totalSkipped = result.skipped;
    const details = result.details;
    const errors = result.errors;
    const tuitionGenerated = details.filter(d => d.startsWith('Tuition')).reduce((sum, d) => sum + (parseInt(d.match(/:\s*(\d+)/)?.[1] || '0') || 0), 0);
    const transportGenerated = details.filter(d => d.startsWith('Transport')).reduce((sum, d) => sum + (parseInt(d.match(/:\s*(\d+)/)?.[1] || '0') || 0), 0);
    const studentsProcessed = totalGenerated + totalSkipped;

    // ── Calculate metrics ──
    const generationTimeMs = Date.now() - startTime;
    const feesPerSec = generationTimeMs > 0 ? Number(((totalGenerated / generationTimeMs) * 1000).toFixed(2)) : 0;

    // ── Update generation log with results ──
    if (logId) {
      await supabaseAdmin
        .from('fee_generation_logs')
        .update({
          total_generated: totalGenerated,
          tuition_generated: tuitionGenerated,
          transport_generated: transportGenerated,
          total_skipped: totalSkipped,
          failed_count: errors.length,
          generation_time_ms: generationTimeMs,
          students_processed: studentsProcessed,
          fees_per_sec: feesPerSec,
          details: details,
          errors: errors.length > 0 ? errors : null,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', logId);
    }

    if (totalGenerated === 0) {
      return res.json({
        message: `All fees for ${monthStr} were already generated for all eligible students. Click again to generate only for students who are missing fees (none found).`,
        totalGenerated: 0,
        totalSkipped,
        tuitionGenerated: 0,
        transportGenerated: 0,
        details,
        logId,
        metrics: { generationTimeMs, studentsProcessed, feesPerSec },
      });
    }

    return res.json({
      message: `Generated fees for ${totalGenerated} student(s) for ${monthStr} (Tuition: ${tuitionGenerated}, Transport: ${transportGenerated}).`,
      totalGenerated,
      totalSkipped,
      tuitionGenerated,
      transportGenerated,
      details,
      logId,
      metrics: {
        generationTimeMs,
        studentsProcessed,
        feesPerSec,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN-GEN] Error:', error);
    return res.status(500).json({ error: error.message || 'Fee generation failed' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET FEE GENERATION LOGS
// Returns past generation runs with metrics — answers "Why were only 2,942
// fees generated?" by showing exactly what happened in each run.
// ════════════════════════════════════════════════════════════════════════════
export async function getGenerationLogs(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('fee_generation_logs')
      .select(`
        id, month, year, triggered_by, fee_type,
        total_generated, tuition_generated, transport_generated,
        total_skipped, failed_count,
        generation_time_ms, students_processed, fees_per_sec,
        details, errors, status,
        started_at, completed_at, created_at,
        class:classes(name),
        section:sections(name)
      `)
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch generation logs' });
  }
}


export async function generateMonthlyFeesJob(req: any, res: Response) {
  try {
    const apiKey = req.headers['x-cron-secret'];
    if (apiKey !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized cron request' });
    }

    // Use the CENTRALIZED service for ALL schools so the HTTP cron matches
    // the in-app node-cron exactly — same dedup/exemption/discount logic.
    const { data: schools } = await supabaseAdmin.from('schools').select('id, name');
    if (!schools || schools.length === 0) {
      return res.json({ message: 'No schools found', totalGenerated: 0, totalSkipped: 0 });
    }

    let totalGenerated = 0;
    let totalSkipped = 0;
    const details: string[] = [];

    for (const school of schools) {
      const result = await generateFeesForMonth({
        schoolId: school.id,
        feeType: 'both',
        force: false,
      });
      totalGenerated += result.generated;
      totalSkipped += result.skipped;
      details.push(...result.details);
    }

    return res.json({
      message: `Monthly fees generated for all schools. Generated: ${totalGenerated}, Skipped: ${totalSkipped}.`,
      totalGenerated,
      totalSkipped,
      details,
    });
  } catch (error: any) {
    console.error('Monthly fee cron error:', error);
    return res.status(500).json({ error: 'Cron job failed' });
  }
}

// ── Fee Categories ─────────────────────────────────────────────────────────

export async function getFeeCategories(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('fee_categories')
      .select('*')
      .eq('school_id', req.user!.school_id)
      .order('name');
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

export async function createFeeCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, description, isRecurring, defaultAmount, taxPercent } = req.body;
    const { data, error } = await supabaseAdmin
      .from('fee_categories')
      .insert({ school_id: req.user!.school_id, name, description, is_recurring: isRecurring || false, default_amount: defaultAmount || 0, tax_percent: taxPercent || 0 })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to create category' });
  }
}

export async function updateFeeCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, isRecurring, defaultAmount, taxPercent, isActive } = req.body;
    const payload: any = {};
    if (name !== undefined) payload.name = name;
    if (description !== undefined) payload.description = description;
    if (isRecurring !== undefined) payload.is_recurring = isRecurring;
    if (defaultAmount !== undefined) payload.default_amount = defaultAmount;
    if (taxPercent !== undefined) payload.tax_percent = taxPercent;
    if (isActive !== undefined) payload.is_active = isActive;
    const { data, error } = await supabaseAdmin.from('fee_categories').update(payload).eq('id', id).eq('school_id', req.user!.school_id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to update category' });
  }
}

export async function deleteFeeCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('fee_categories').update({ is_active: false }).eq('id', id).eq('school_id', req.user!.school_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Category deactivated' });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to delete category' });
  }
}

// ── Fee Discounts ──────────────────────────────────────────────────────────

export async function getFeeDiscounts(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, sectionId, classId } = req.query;
    let query = supabaseAdmin
      .from('fee_discounts')
      .select('*, student:students(id, user:users(first_name, last_name), admission_number, section:sections(name, class:classes(name))), approver:users!fee_discounts_approved_by_fkey(first_name, last_name)')
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false });
    if (studentId) query = query.eq('student_id', studentId as string);

    // Filter by section or class
    if (sectionId && sectionId !== 'all') {
      // Get students in this section
      const { data: sectionStudents } = await supabaseAdmin
        .from('students').select('id').eq('section_id', sectionId as string).eq('school_id', req.user!.school_id);
      const ids = (sectionStudents || []).map((s: any) => s.id);
      if (ids.length === 0) return res.json([]);
      query = query.in('student_id', ids);
    } else if (classId && classId !== 'all') {
      const { data: sections } = await supabaseAdmin.from('sections').select('id').eq('class_id', classId as string);
      const sectionIds = (sections || []).map((s: any) => s.id);
      if (sectionIds.length === 0) return res.json([]);
      const { data: sectionStudents } = await supabaseAdmin
        .from('students').select('id').in('section_id', sectionIds).eq('school_id', req.user!.school_id);
      const ids = (sectionStudents || []).map((s: any) => s.id);
      if (ids.length === 0) return res.json([]);
      query = query.in('student_id', ids);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to fetch discounts' });
  }
}

export async function applyDiscount(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, type, amount, reason, recurrence } = req.body;
    if (!studentId || !amount) return res.status(400).json({ error: 'studentId and amount required' });

    // Determine recurrence: explicit field, or fall back to type for backward compat
    const effectiveRecurrence = recurrence || (['monthly', 'quarterly', 'annually'].includes(type) ? type : 'one_time');
    const isRecurring = effectiveRecurrence !== 'one_time';

    // ── LINKAGE STRATEGY ──
    // One-time discounts: link to a specific fee_payment_id (fee_payment_id is set).
    // Recurring discounts: keep fee_payment_id = NULL so the generator picks them up
    //   for FUTURE months. BUT we still reduce the CURRENT latest pending fee so the
    //   user sees the discount applied immediately (not "not linked").
    let feePaymentId: string | undefined = req.body.feePaymentId;
    let feeToReduceId: string | null = null;

    if (!feePaymentId) {
      // Find the student's latest pending/partial fee
      const { data: latestPay } = await supabaseAdmin
        .from('fee_payments')
        .select('id')
        .eq('student_id', studentId)
        .eq('school_id', req.user!.school_id)
        .in('status', ['pending', 'partial'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestPay) {
        feeToReduceId = latestPay.id;
        // Only one-time discounts get linked to the fee record itself
        if (!isRecurring) feePaymentId = latestPay.id;
      }
    } else {
      feeToReduceId = feePaymentId;
    }

    // Store the discount record.
    // Recurring → fee_payment_id = NULL (so the generator picks it up for FUTURE months).
    // One-time → fee_payment_id = the linked payment.
    // NOTE: feeToReduceId (which may differ from feePaymentId for recurring) is used
    //   to reduce the CURRENT fee immediately, while fee_payment_id stays NULL for recurring.
    const { data, error } = await supabaseAdmin
      .from('fee_discounts')
      .insert({ school_id: req.user!.school_id, student_id: studentId, fee_payment_id: isRecurring ? null : (feePaymentId || null), type: type || 'custom', recurrence: effectiveRecurrence, amount, reason, approved_by: req.user!.id, created_by: req.user!.id })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Reduce amount on the current/latest pending fee (for BOTH one-time and recurring)
    if (feeToReduceId) {
      const { data: pay } = await supabaseAdmin.from('fee_payments').select('amount, paid_amount, late_fee, discount_amount').eq('id', feeToReduceId).single();
      if (pay) {
        const newDiscountAmt = Number(pay.discount_amount || 0) + Number(amount);
        const expected = Math.max(0, Number(pay.amount || 0) + Number(pay.late_fee || 0) - newDiscountAmt);
        const newStatus = Number(pay.paid_amount || 0) >= expected ? 'paid' : Number(pay.paid_amount || 0) > 0 ? 'partial' : 'pending';
        await supabaseAdmin.from('fee_payments').update({ discount_amount: newDiscountAmt, status: newStatus }).eq('id', feeToReduceId);
      }
    }
    return res.status(201).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to apply discount' });
  }
}

// ── Fee Fines ──────────────────────────────────────────────────────────────

export async function getFeeFines(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, sectionId, classId } = req.query;
    let query = supabaseAdmin
      .from('fee_fines')
      .select('*, student:students(id, user:users(first_name, last_name), admission_number, section:sections(name, class:classes(name)))')
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false });
    if (studentId) query = query.eq('student_id', studentId as string);

    // Filter by section or class
    if (sectionId && sectionId !== 'all') {
      const { data: sectionStudents } = await supabaseAdmin
        .from('students').select('id').eq('section_id', sectionId as string).eq('school_id', req.user!.school_id);
      const ids = (sectionStudents || []).map((s: any) => s.id);
      if (ids.length === 0) return res.json([]);
      query = query.in('student_id', ids);
    } else if (classId && classId !== 'all') {
      const { data: sections } = await supabaseAdmin.from('sections').select('id').eq('class_id', classId as string);
      const sectionIds = (sections || []).map((s: any) => s.id);
      if (sectionIds.length === 0) return res.json([]);
      const { data: sectionStudents } = await supabaseAdmin
        .from('students').select('id').in('section_id', sectionIds).eq('school_id', req.user!.school_id);
      const ids = (sectionStudents || []).map((s: any) => s.id);
      if (ids.length === 0) return res.json([]);
      query = query.in('student_id', ids);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to fetch fines' });
  }
}

export async function addFine(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, reason, amount, dueDate, remarks } = req.body;
    let { feePaymentId } = req.body;
    if (!studentId || !amount || !reason) return res.status(400).json({ error: 'studentId, amount, and reason required' });

    // Auto-link to latest pending payment if no specific payment is given
    if (!feePaymentId) {
      const { data: latestPay } = await supabaseAdmin
        .from('fee_payments')
        .select('id')
        .eq('student_id', studentId)
        .eq('school_id', req.user!.school_id)
        .in('status', ['pending', 'partial'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestPay) feePaymentId = latestPay.id;
    }

    const { data, error } = await supabaseAdmin
      .from('fee_fines')
      .insert({ school_id: req.user!.school_id, student_id: studentId, fee_payment_id: feePaymentId || null, reason, amount, due_date: dueDate || null, remarks, created_by: req.user!.id })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Increase late_fee on the linked payment
    if (feePaymentId) {
      const { data: pay } = await supabaseAdmin.from('fee_payments').select('amount, paid_amount, late_fee, discount_amount').eq('id', feePaymentId).single();
      if (pay) {
        const newLateAmt = Number(pay.late_fee || 0) + Number(amount);
        const expected = Math.max(0, Number(pay.amount || 0) + newLateAmt - Number(pay.discount_amount || 0));
        const newStatus = Number(pay.paid_amount || 0) >= expected ? 'paid' : Number(pay.paid_amount || 0) > 0 ? 'partial' : 'pending';
        await supabaseAdmin.from('fee_payments').update({ late_fee: newLateAmt, status: newStatus }).eq('id', feePaymentId);
      }
    }

    // Notify parent
    const { data: pLink } = await supabaseAdmin.from('parent_students').select('parent:parents(user:users(id, email))').eq('student_id', studentId).maybeSingle();
    const parentUser = (pLink as any)?.parent?.user;
    if (parentUser?.id) {
      await notificationService.createInAppNotification({
        schoolId: req.user!.school_id, userId: parentUser.id, type: 'fee_reminder',
        title: `Fine Added: ₹${amount}`, message: `A fine of ₹${amount} has been added. Reason: ${reason}. ${dueDate ? `Due by ${new Date(dueDate).toLocaleDateString('en-IN')}.` : ''}`,
        sourceId: data.id,
      });
    }
    return res.status(201).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to add fine' });
  }
}

export async function waiveFine(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    // Fetch fine before updating to get its amount and linked fee payment
    const { data: fine } = await supabaseAdmin.from('fee_fines').select('*').eq('id', id).eq('school_id', req.user!.school_id).single();
    if (!fine) return res.status(404).json({ error: 'Fine not found' });

    const { error } = await supabaseAdmin.from('fee_fines').update({ is_paid: true, remarks: 'Waived by admin' }).eq('id', id).eq('school_id', req.user!.school_id);
    if (error) return res.status(400).json({ error: error.message });

    // Decrease late_fee on the payment if linked
    if (fine.fee_payment_id) {
      const { data: pay } = await supabaseAdmin.from('fee_payments').select('amount, paid_amount, late_fee, discount_amount').eq('id', fine.fee_payment_id).single();
      if (pay) {
        // Subtract waived fine amount
        const newLateAmt = Math.max(0, Number(pay.late_fee || 0) - Number(fine.amount || 0));

        // Expected amount is base + late - discount
        const expected = Math.max(0, Number(pay.amount || 0) + newLateAmt - Number(pay.discount_amount || 0));

        // Evaluate new status
        const newStatus = Number(pay.paid_amount || 0) >= expected ? 'paid' : Number(pay.paid_amount || 0) > 0 ? 'partial' : 'pending';

        // Update late_fee and status
        await supabaseAdmin.from('fee_payments').update({ late_fee: newLateAmt, status: newStatus }).eq('id', fine.fee_payment_id);
      }
    }

    return res.json({ message: 'Fine waived' });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to waive fine' });
  }
}

// ── Get fee payments for a specific student (for discount/fine linking) ──────
export async function getStudentFeePayments(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('fee_payments')
      .select('id, amount, paid_amount, late_fee, discount_amount, status, due_date, title, fee_structure:fee_structures(name)')
      .eq('student_id', studentId)
      .eq('school_id', req.user!.school_id)
      .in('status', ['pending', 'partial'])
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to fetch student payments' });
  }
}

// ── Fee Refunds ────────────────────────────────────────────────────────────

export async function getFeeRefunds(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.query;
    let query = supabaseAdmin
      .from('fee_refunds')
      .select('*, student:students(user:users(first_name, last_name), admission_number), approver:users!fee_refunds_approved_by_fkey(first_name, last_name)')
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false });
    if (studentId) query = query.eq('student_id', studentId as string);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to fetch refunds' });
  }
}

export async function createRefund(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, feePaymentId, amount, reason, referenceNumber } = req.body;
    if (!studentId || !amount || !reason) return res.status(400).json({ error: 'studentId, amount, reason required' });
    const { data, error } = await supabaseAdmin
      .from('fee_refunds')
      .insert({ school_id: req.user!.school_id, student_id: studentId, fee_payment_id: feePaymentId || null, amount, reason, reference_number: referenceNumber || null, approved_by: req.user!.id, created_by: req.user!.id })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    if (feePaymentId) {
      const { data: pay } = await supabaseAdmin.from('fee_payments').select('paid_amount').eq('id', feePaymentId).single();
      if (pay) await supabaseAdmin.from('fee_payments').update({ refunded_amount: amount, paid_amount: Math.max(0, Number(pay.paid_amount) - Number(amount)) }).eq('id', feePaymentId);
    }
    return res.status(201).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to create refund' });
  }
}

// ── Finance Dashboard ──────────────────────────────────────────────────────

export async function getFinanceDashboard(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0];
    const lastMonthFirst = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];

    const [{ data: allPayments }, { data: todayTxns }, { data: yesterdayTxns }, { data: classes }, { data: discountsAll }, { data: finesAll }] = await Promise.all([
      supabaseAdmin.from('fee_payments').select('amount, paid_amount, late_fee, discount_amount, status, due_date, paid_date, student_id, student:students(section:sections(class_id, class:classes(name)))').eq('school_id', schoolId),
      supabaseAdmin.from('fee_transactions').select('amount, payment_method, created_at').eq('school_id', schoolId).gte('created_at', today),
      supabaseAdmin.from('fee_transactions').select('amount, payment_method, created_at').eq('school_id', schoolId).gte('created_at', yesterday).lt('created_at', today),
      supabaseAdmin.from('classes').select('id, name').eq('school_id', schoolId),
      supabaseAdmin.from('fee_discounts').select('amount').eq('school_id', schoolId),
      supabaseAdmin.from('fee_fines').select('amount, is_paid').eq('school_id', schoolId),
    ]);

    const payments = allPayments || [];
    const totalExpected = payments.reduce((s: number, p: any) => s + (Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0)), 0);
    const totalCollected = payments.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0);
    const totalPending = totalExpected - totalCollected;
    const overduePayments = payments.filter((p: any) => p.status === 'overdue' || (p.status !== 'paid' && p.due_date && p.due_date < today));
    const totalOverdue = overduePayments.reduce((s: number, p: any) => s + ((Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0)) - Number(p.paid_amount || 0)), 0);
    const studentsWithDue = new Set(payments.filter((p: any) => p.status !== 'paid').map((p: any) => p.student_id)).size;
    const todayCollection = (todayTxns || []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const monthlyPayments = payments.filter((p: any) => p.paid_date && p.paid_date >= firstOfMonth);
    const monthlyCollection = monthlyPayments.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0);
    const totalDiscounts = (discountsAll || []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    const totalFines = (finesAll || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
    const collectionPct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    const yesterdayCollection = (yesterdayTxns || []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const todayGrowthRaw = yesterdayCollection > 0 ? ((todayCollection - yesterdayCollection) / yesterdayCollection) * 100 : 0;
    const todayGrowth = todayGrowthRaw > 0 ? `+${todayGrowthRaw.toFixed(1)}%` : `${todayGrowthRaw.toFixed(1)}%`;

    const lastMonthPayments = payments.filter((p: any) => p.paid_date && p.paid_date >= lastMonthFirst && p.paid_date < firstOfMonth);
    const lastMonthCollection = lastMonthPayments.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0);
    const monthlyGrowthRaw = lastMonthCollection > 0 ? ((monthlyCollection - lastMonthCollection) / lastMonthCollection) * 100 : 0;
    const monthlyGrowth = monthlyGrowthRaw > 0 ? `+${monthlyGrowthRaw.toFixed(1)}%` : `${monthlyGrowthRaw.toFixed(1)}%`;

    // Monthly trend — last 6 months
    const monthlyTrend: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrend[key] = 0;
    }
    payments.forEach((p: any) => {
      if (p.paid_date) {
        const key = p.paid_date.substring(0, 7);
        if (key in monthlyTrend) monthlyTrend[key] += Number(p.paid_amount || 0);
      }
    });

    // Class-wise collection via student→section→class join
    const classMap: Record<string, { expected: number; collected: number; name: string }> = {};
    (classes || []).forEach((c: any) => { classMap[c.id] = { expected: 0, collected: 0, name: c.name }; });
    payments.forEach((p: any) => {
      const classId = (p as any).student?.section?.class_id;
      const className = (p as any).student?.section?.class?.name;
      if (classId) {
        if (!classMap[classId]) classMap[classId] = { expected: 0, collected: 0, name: className || 'Unknown' };
        classMap[classId].expected += (Number(p.amount || 0) + Number(p.late_fee || 0) - Number(p.discount_amount || 0));
        classMap[classId].collected += Number(p.paid_amount || 0);
      }
    });

    // Payment method distribution from actual transactions
    const methodMap: Record<string, number> = {};
    (todayTxns || []).forEach((t: any) => {
      const m = t.payment_method || 'cash';
      methodMap[m] = (methodMap[m] || 0) + Number(t.amount || 0);
    });

    return res.json({
      cards: {
        todayCollection, monthlyCollection, totalPending, totalOverdue,
        studentsWithDue, totalDiscounts, totalFines, collectionPct,
        expectedRevenue: totalExpected, outstandingAmount: totalPending,
        todayGrowth, monthlyGrowth
      },
      charts: {
        monthlyTrend: Object.entries(monthlyTrend).map(([month, amount]) => ({ month, amount })),
        classWise: Object.values(classMap).filter(c => c.expected > 0),
        paymentMethods: Object.entries(methodMap).map(([method, amount]) => ({ method, amount })),
      },
    });
  } catch (e: any) {
    console.error('Dashboard error:', e);
    return res.status(500).json({ error: 'Failed to load finance dashboard' });
  }
}

// ── Student Fee Ledger ─────────────────────────────────────────────────────

export async function getStudentLedger(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId } = req.params;
    const schoolId = req.user!.school_id;

    const [{ data: payments }, { data: discounts }, { data: fines }, { data: refunds }] = await Promise.all([
      supabaseAdmin.from('fee_payments').select('*, fee_structure:fee_structures(name)').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
      supabaseAdmin.from('fee_discounts').select('*').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
      supabaseAdmin.from('fee_fines').select('*').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
      supabaseAdmin.from('fee_refunds').select('*').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
    ]);

    const entries: any[] = [];

    (payments || []).forEach((p: any) => {
      entries.push({ type: 'charge', date: p.created_at, description: p.title || p.fee_structure?.name || 'Fee', amount: Number(p.amount), status: p.status, dueDate: p.due_date, id: p.id });
      if (Number(p.paid_amount) > 0) entries.push({ type: 'payment', date: p.paid_date || p.updated_at, description: `Payment — ${p.receipt_number || ''}`, amount: -Number(p.paid_amount), status: 'paid', id: `pmt-${p.id}` });
    });
    (discounts || []).forEach((d: any) => {
      entries.push({ type: 'discount', date: d.created_at, description: `Discount: ${d.type} — ${d.reason || ''}`, amount: -Number(d.amount), status: 'applied', id: d.id });
    });
    (fines || []).forEach((f: any) => {
      entries.push({ type: 'fine', date: f.created_at, description: `Fine: ${f.reason}`, amount: Number(f.amount), status: f.is_paid ? 'paid' : 'pending', id: f.id });
    });
    (refunds || []).forEach((r: any) => {
      entries.push({ type: 'refund', date: r.created_at, description: `Refund: ${r.reason}`, amount: -Number(r.amount), status: 'refunded', id: r.id });
    });

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Running balance
    let balance = 0;
    const ledger = entries.map(e => { balance += e.amount; return { ...e, balance }; });

    const totalCharged = entries.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
    const totalPaid = entries.filter(e => e.type === 'payment').reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalDiscountAmt = entries.filter(e => e.type === 'discount').reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalFineAmt = entries.filter(e => e.type === 'fine').reduce((s, e) => s + e.amount, 0);

    return res.json({ ledger, summary: { totalCharged, totalPaid, totalDiscounts: totalDiscountAmt, totalFines: totalFineAmt, closingBalance: balance } });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to fetch ledger' });
  }
}

// ── Cumulative Fee Register (current year + carried-forward back dues) ─────
// Kautix rule: the CURRENT year's register shows Current Year Fees PLUS any
// unresolved Balance carried forward from PRIOR academic years. Each back item
// keeps its ORIGINAL academic year + category (title / fee structure).
export async function getFeeRegisterCumulative(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { academic_year_id, class_id, section_id, search, student_id, page = '1', limit = '100' } = req.query;

    if (!academic_year_id) {
      return res.status(400).json({ error: 'academic_year_id is required' });
    }
    const targetYearId = String(academic_year_id);

    const { data: targetYear, error: tyErr } = await supabaseAdmin
      .from('academic_years').select('id, name, start_date')
      .eq('id', targetYearId).eq('school_id', schoolId).single();
    if (tyErr || !targetYear) return res.status(400).json({ error: 'Invalid academic year' });
    const targetStart = targetYear.start_date ? new Date(`${targetYear.start_date}T00:00:00Z`).getTime() : Date.now();

    let scopeQuery = supabaseAdmin
      .from('students').select('id, roll_number, admission_number, section_id, section:sections(id, name, class:classes(id, name, grade))')
      .eq('school_id', schoolId);

    if (student_id) {
      scopeQuery = scopeQuery.eq('id', String(student_id));
    } else if (section_id && section_id !== 'all') {
      scopeQuery = scopeQuery.eq('section_id', String(section_id));
    } else if (class_id && class_id !== 'all') {
      const { data: classSections } = await supabaseAdmin.from('sections').select('id').eq('class_id', String(class_id));
      const sectionIds = classSections?.map((s: any) => s.id) || [];
      if (sectionIds.length === 0) return res.json({ students: [], total: 0 });
      scopeQuery = scopeQuery.in('section_id', sectionIds);
    }
    scopeQuery = scopeQuery.eq('academic_year_id', targetYearId);

    const { data: scopedStudents, error: ssErr } = await scopeQuery;
    if (ssErr) return res.status(400).json({ error: ssErr.message });
    const studentIds = (scopedStudents || []).map((s: any) => s.id).filter(Boolean);
    if (studentIds.length === 0) return res.json({ students: [], total: 0 });

    let students = scopedStudents || [];
    if (search && String(search).trim()) {
      const term = String(search).trim().toLowerCase();
      const { data: users } = await supabaseAdmin
        .from('users').select('id').eq('school_id', schoolId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
      const uids = new Set((users || []).map((u: any) => u.id));
      students = students.filter((s: any) =>
        uids.has(s.user_id) ||
        String(s.admission_number || '').toLowerCase().includes(term) ||
        String(s.roll_number || '').toLowerCase().includes(term)
      );
    }

    // Fetch ALL fee payments (all years) for the scoped students, chunked.
    const feesByStudent = new Map<string, any[]>();
    const CHUNK = 200;
    for (let i = 0; i < studentIds.length; i += CHUNK) {
      const ids = studentIds.slice(i, i + CHUNK);
      const chunkRows = await fetchAllRows<any>(
        supabaseAdmin
          .from('fee_payments')
          .select('*, fee_structure:fee_structures(name), year:academic_years(name, start_date)')
          .eq('school_id', schoolId)
          .in('student_id', ids)
      );
      const data = chunkRows;
      for (const f of data || []) {
        if (!feesByStudent.has(f.student_id)) feesByStudent.set(f.student_id, []);
        feesByStudent.get(f.student_id)!.push(f);
      }
    }
// Build per-student cumulative register: current fees + carried back dues.
    const buildRegister = (student: any): any => {
      const fees = feesByStudent.get(student.id) || [];
      const currentItems: any[] = [];
      const backItems: any[] = [];

      for (const f of fees) {
        const amount = Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0);
        const paid = Number(f.paid_amount || 0);
        const balance = Math.max(0, amount - paid);
        const feeYearId = f.academic_year_id;
        const feeYearStart = f.year?.start_date
          ? new Date(`${f.year.start_date}T00:00:00Z`).getTime() : null;
        const isCurrent = !feeYearId || feeYearId === targetYearId || (feeYearStart !== null && feeYearStart >= targetStart);
        const isResolved = balance <= 0;

        const item = {
          id: f.id,
          title: f.title || (f.fee_structure as any)?.name || 'Fee',
          category: (f.fee_structure as any)?.name || f.title || 'Fee',
          academic_year_id: f.academic_year_id || targetYearId,
          academic_year_name: f.year?.name || targetYear.name,
          amount, paid, balance, status: f.status,
        };

        if (isCurrent || isResolved) currentItems.push(item);
        else backItems.push(item);
      }

      const sum = (arr: any[], k: (x: any) => number) => arr.reduce((s, x) => s + k(x), 0);
      const currentDue = sum(currentItems, x => x.balance);
      const currentPaid = sum(currentItems, x => x.paid);
      const backDue = sum(backItems, x => x.balance);
      const backPaid = sum(backItems, x => x.paid);

      const byYear = new Map<string, any>();
      for (const it of backItems) {
        if (!byYear.has(it.academic_year_name)) byYear.set(it.academic_year_name, { year: it.academic_year_name, items: [], total: 0 });
        byYear.get(it.academic_year_name)!.items.push(it);
        byYear.get(it.academic_year_name)!.total += it.balance;
      }

      return {
        student: {
          id: student.id,
          roll_number: student.roll_number,
          admission_number: student.admission_number,
          section: student.section,
        },
        current: { total: currentDue, paid: currentPaid, items: currentItems },
        backDues: { total: backDue, paid: backPaid, breakdown: Array.from(byYear.values()) },
        totalDue: currentDue + backDue,
      };
    };

    const registers = students.map(buildRegister);
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const pageData = registers.slice(offset, offset + parseInt(limit as string));
    const n = parseInt(limit as string);

    return res.json({
      academic_year_id: targetYearId,
      academic_year_name: targetYear.name,
      students: pageData,
      total: registers.length,
      page: parseInt(page as string),
      totalPages: Math.ceil(registers.length / n),
      summary: {
        totalDue: registers.reduce((s, r) => s + r.totalDue, 0),
        totalCollected: registers.reduce((s, r) => s + r.current.paid + r.backDues.paid, 0),
      },
    });
  } catch (e: any) {
    console.error('getFeeRegisterCumulative error:', e);
    return res.status(500).json({ error: 'Failed to fetch cumulative register' });
  }
}
// ── Self-Resolving Student Ledger (no ID needed) ───────────────────────────
export async function getMyLedger(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const schoolId = req.user!.school_id;

    // Resolve student ID from auth
    let studentId: string | null = null;

    if (role === 'student') {
      const { data: s } = await supabaseAdmin.from('students').select('id').eq('user_id', userId).single();
      studentId = s?.id || null;
    } else if (role === 'parent') {
      const { data: p } = await supabaseAdmin.from('parents').select('id').eq('user_id', userId).maybeSingle();
      if (p) {
        const { data: links } = await supabaseAdmin.from('student_parent_links').select('student_id').eq('parent_id', p.id).limit(1);
        studentId = links?.[0]?.student_id || null;
      }
    } else {
      // Admin/Teacher — can pass ?studentId= as query
      studentId = req.query.studentId as string || null;
    }

    if (!studentId) {
      console.log('getMyLedger: No student ID found for user', userId, 'role', role);
      return res.status(404).json({ error: 'Student profile not found' });
    }

    console.log('getMyLedger: Fetching ledger for student', studentId, 'school', schoolId);

    const [{ data: payments }, { data: discounts }, { data: fines }, { data: refunds }] = await Promise.all([
      supabaseAdmin.from('fee_payments').select('*, fee_structure:fee_structures(name, frequency)').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
      supabaseAdmin.from('fee_discounts').select('*').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
      supabaseAdmin.from('fee_fines').select('*').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
      supabaseAdmin.from('fee_refunds').select('*').eq('student_id', studentId).eq('school_id', schoolId).order('created_at'),
    ]);

    console.log('getMyLedger: Found payments:', payments?.length);

    const entries: any[] = [];
    const paymentMap = new Map<string, any>();

    (payments || []).forEach((p: any) => {
      // Add the charge entry normally
      entries.push({
        type: 'charge', date: p.created_at, description: p.title || p.fee_structure?.name || 'Fee',
        amount: Number(p.amount), status: p.status, dueDate: p.due_date,
        paidAmount: Number(p.paid_amount || 0), receiptNumber: p.receipt_number,
        frequency: p.fee_structure?.frequency, id: p.id, raw: p,
      });

      // Group the payment entry by receipt number
      if (Number(p.paid_amount) > 0) {
        if (p.receipt_number) {
          if (paymentMap.has(p.receipt_number)) {
            const existing = paymentMap.get(p.receipt_number);
            existing.amount -= Number(p.paid_amount); // Amount is negative for payments
            // Combine descriptions if not already there
            const shortDesc = (p.title || p.fee_structure?.name || 'Fee').substring(0, 15);
            if (!existing.description.includes(shortDesc)) {
              existing.description += `, ${shortDesc}`;
            }
          } else {
            paymentMap.set(p.receipt_number, {
              type: 'payment', date: p.paid_date || p.updated_at,
              description: `Payment - ${(p.title || p.fee_structure?.name || 'Fee').substring(0, 15)}`,
              amount: -Number(p.paid_amount), status: 'paid',
              receiptNumber: p.receipt_number, paymentMode: p.payment_mode,
              id: `pmt-${p.receipt_number}`, raw: p,
            });
          }
        } else {
          // If no receipt number exists, just push it individually
          entries.push({
            type: 'payment', date: p.paid_date || p.updated_at,
            description: `Payment`, amount: -Number(p.paid_amount), status: 'paid',
            receiptNumber: p.receipt_number, paymentMode: p.payment_mode, id: `pmt-${p.id}`, raw: p,
          });
        }
      }
    });

    // Add grouped payments into the main entries array
    for (const pmt of paymentMap.values()) {
      entries.push(pmt);
    }
    (discounts || []).forEach((d: any) => {
      entries.push({ type: 'discount', date: d.created_at, description: `Discount: ${d.type}`, reason: d.reason, amount: -Number(d.amount), status: 'applied', id: d.id, raw: d });
    });
    (fines || []).forEach((f: any) => {
      entries.push({ type: 'fine', date: f.created_at, description: `Fine`, reason: f.reason, amount: Number(f.amount), status: f.is_paid ? 'paid' : 'pending', id: f.id, raw: f });
    });
    (refunds || []).forEach((r: any) => {
      entries.push({ type: 'refund', date: r.created_at, description: `Refund`, reason: r.reason, amount: -Number(r.amount), status: 'refunded', id: r.id, raw: r });
    });

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = 0;
    const ledger = entries.map(e => { balance += e.amount; return { ...e, balance }; });

    const totalCharged = entries.filter(e => e.type === 'charge').reduce((s, e) => s + e.amount, 0);
    const totalPaid = entries.filter(e => e.type === 'payment').reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalDiscounts = entries.filter(e => e.type === 'discount').reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalFines = entries.filter(e => e.type === 'fine').reduce((s, e) => s + e.amount, 0);

    const { data: stdProfile } = await supabaseAdmin
      .from('students')
      .select('father_name, mother_name')
      .eq('id', studentId)
      .single();

    return res.json({
      ledger,
      summary: {
        totalCharged,
        totalPaid,
        totalDiscounts,
        totalFines,
        closingBalance: balance,
        studentId,
        father_name: stdProfile?.father_name || null,
        mother_name: stdProfile?.mother_name || null
      }
    });
  } catch (e: any) {
    console.error('My ledger error:', e);
    return res.status(500).json({ error: 'Failed to fetch ledger' });
  }
}

// Bulk upload past fee dues
export async function bulkCreatePastDues(req: AuthenticatedRequest, res: Response) {
  try {
    const { dues, academicYearId } = req.body;

    if (!Array.isArray(dues)) {
      return res.status(400).json({ error: 'Expected an array of dues' });
    }

    // Keep database requests small enough for large schools (5,000+ students).
    // Supabase/PostgREST can reject or time out on one very large JSON insert.
    const INSERT_CHUNK_SIZE = 500;
    const MAX_ROWS_PER_REQUEST = 5000;

    if (dues.length > MAX_ROWS_PER_REQUEST) {
      return res.status(413).json({
        error: `A maximum of ${MAX_ROWS_PER_REQUEST} dues can be uploaded per request. Please upload in chunks.`,
      });
    }

    // ── Pre-fetch existing fees to prevent duplicate creation ───────────
    // Collect all student IDs + titles from the payload once, then check what
    // already exists in the DB for those students (same student_id + same title),
    // so that running bulk-upload twice doesn't double-charge families.
    const schoolId = req.user!.school_id;
    const studentIdSet = new Set(dues.map((d: any) => d.studentId).filter(Boolean));
    const existingKeys = new Set<string>();
    if (studentIdSet.size > 0) {
      const ids = Array.from(studentIdSet);
      // Check in chunks of 500 to avoid huge IN clauses
      for (let i = 0; i < ids.length; i += 500) {
        const idChunk = ids.slice(i, i + 500);
        const { data: existing } = await supabaseAdmin
          .from('fee_payments')
          .select('student_id, title, remarks, amount')
          .eq('school_id', schoolId)
          .in('student_id', idChunk)
          .in('status', ['pending', 'overdue']);
        for (const e of existing || []) {
          // Dedup key: student + title + amount (same title with DIFFERENT amount is allowed — admin may be correcting)
          const titleKey = String(e.title || e.remarks || '').trim().toLowerCase();
          const amtKey = String(Number(e.amount || 0));
          existingKeys.add(`${e.student_id}|${titleKey}|${amtKey}`);
        }
      }
    }

    const results: any[] = [];
    const inserts: any[] = [];
    let skippedDuplicate = 0;

    // Process rows
    for (const row of dues) {
      if (!row.studentId) {
        results.push({ success: false, raw: row, error: 'Student ID missing' });
        continue;
      }
      if (row.amount === '' || row.amount === null || row.amount === undefined || isNaN(Number(row.amount)) || Number(row.amount) <= 0) {
        // Skip silently if amount is 0 or empty for easy register saving
        results.push({ success: true, skipped: true, raw: row, message: 'Skipped (amount <= 0 or empty)' });
        continue;
      }

      const title = String(row.title || row.feeDescription || 'Past Dues (Arrears)').trim() || 'Past Dues (Arrears)';
      const amtKey = String(Number(row.amount));
      const matchKey = `${row.studentId}|${title.toLowerCase()}|${amtKey}`;

      // Skip only if this student already has a pending fee with SAME title AND SAME amount
      // (prevents double-upload of the exact same sheet — but allows corrections with different amounts)
      if (existingKeys.has(matchKey)) {
        skippedDuplicate++;
        results.push({ success: true, skipped: true, duplicate: true, raw: row, message: `Duplicate — ${title} ₹${row.amount} already exists for this student` });
        continue;
      }
      existingKeys.add(matchKey); // prevent dupes within the same payload too

      inserts.push({
        school_id: schoolId,
        student_id: row.studentId,
        amount: Number(row.amount),
        paid_amount: 0,
        status: 'pending',
        payment_method: 'unpaid',
        title,
        remarks: row.remarks || 'Bulk uploaded past dues',
        academic_year_id: academicYearId || null,
        due_date: new Date().toISOString().split('T')[0]
      });

      results.push({ success: true, raw: row });
    }

    let insertedCount = 0;
    for (let start = 0; start < inserts.length; start += INSERT_CHUNK_SIZE) {
      const chunk = inserts.slice(start, start + INSERT_CHUNK_SIZE);
      const { error } = await supabaseAdmin.from('fee_payments').insert(chunk);
      if (error) {
        console.error(`Bulk dues insert error at rows ${start + 1}-${start + chunk.length}:`, error);
        return res.status(500).json({
          error: 'Database error while inserting dues',
          insertedCount,
          failedFrom: start,
          details: error.message,
        });
      }
      insertedCount += chunk.length;
    }

    return res.json({
      message: skippedDuplicate > 0
        ? `Successfully added ${insertedCount} due records (${skippedDuplicate} duplicate${skippedDuplicate === 1 ? '' : 's'} skipped)`
        : `Successfully added ${insertedCount} due records`,
      insertedCount,
      skippedDuplicate,
      results,
    });
  } catch (error: any) {
    console.error('Bulk upload past dues error:', error);
    return res.status(500).json({ error: 'Failed to bulk upload past dues' });
  }
}

// ── Admin Edit / Delete individual fee payment ─────────────────────────────
export async function updateFeePayment(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { title, amount, dueDate, status, remarks, lateFee, discountAmount, paidAmount, studentId } = req.body;

    const payload: any = {};

    if (title !== undefined) payload.title = title;
    if (amount !== undefined) payload.amount = Number(amount);
    if (dueDate !== undefined) payload.due_date = dueDate;
    if (status !== undefined) payload.status = status;
    if (remarks !== undefined) payload.remarks = remarks;
    if (lateFee !== undefined) payload.late_fee = Number(lateFee);
    if (discountAmount !== undefined) payload.discount_amount = Number(discountAmount);
    if (paidAmount !== undefined) payload.paid_amount = Number(paidAmount);
    if (studentId !== undefined) payload.student_id = studentId;

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('fee_payments')
      .update(payload)
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Fee payment not found' });

    return res.json({ message: 'Fee updated successfully', payment: data });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update fee' });
  }
}

export async function deleteFeePayment(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    // Also clean up transactions linked to this fee
    await supabaseAdmin
      .from('fee_transactions')
      .delete()
      .eq('fee_payment_id', id)
      .eq('school_id', req.user!.school_id);

    const { error } = await supabaseAdmin
      .from('fee_payments')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ message: 'Fee record deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete fee' });
  }
}

// ── Admin Bulk Delete / Edit fee payments ──────────────────────────────────
export async function bulkDeleteFeePayments(req: AuthenticatedRequest, res: Response) {
  try {
    const { paymentIds } = req.body;

    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return res.status(400).json({ error: 'No payment IDs provided' });
    }
    if (paymentIds.length > 5000) {
      return res.status(400).json({ error: 'Maximum 5000 fees can be deleted per request' });
    }

    // Clean up linked transactions
    for (let i = 0; i < paymentIds.length; i += 500) {
      const chunk = paymentIds.slice(i, i + 500);
      await supabaseAdmin
        .from('fee_transactions')
        .delete()
        .in('fee_payment_id', chunk)
        .eq('school_id', req.user!.school_id);
    }

    let deletedCount = 0;
    for (let i = 0; i < paymentIds.length; i += 500) {
      const chunk = paymentIds.slice(i, i + 500);
      const { data, error } = await supabaseAdmin
        .from('fee_payments')
        .delete()
        .in('id', chunk)
        .eq('school_id', req.user!.school_id)
        .select('id');
      if (error) {
        console.error(`Bulk delete fee chunk ${i} error:`, error);
        continue;
      }
      deletedCount += (data || []).length;
    }

    return res.json({
      message: `Deleted ${deletedCount} fee record${deletedCount === 1 ? '' : 's'}`,
      deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to bulk delete fees' });
  }
}

export async function bulkEditFeePayments(req: AuthenticatedRequest, res: Response) {
  try {
    const { paymentIds, updates } = req.body;

    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return res.status(400).json({ error: 'No payment IDs provided' });
    }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Updates object is required' });
    }

    const payload: any = {};

    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.amount !== undefined) payload.amount = Number(updates.amount);
    if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.remarks !== undefined) payload.remarks = updates.remarks;
    if (updates.lateFee !== undefined) payload.late_fee = Number(updates.lateFee);
    if (updates.discountAmount !== undefined) payload.discount_amount = Number(updates.discountAmount);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    let updatedCount = 0;
    for (let i = 0; i < paymentIds.length; i += 500) {
      const chunk = paymentIds.slice(i, i + 500);
      const { data, error } = await supabaseAdmin
        .from('fee_payments')
        .update(payload)
        .in('id', chunk)
        .eq('school_id', req.user!.school_id)
        .select('id');
      if (error) {
        console.error(`Bulk edit fee chunk ${i} error:`, error);
        continue;
      }
      updatedCount += (data || []).length;
    }

    return res.json({
      message: `Updated ${updatedCount} fee record${updatedCount === 1 ? '' : 's'}`,
      updatedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to bulk edit fees' });
  }
}

// ─── Transport Routes ─────────────────────────────────────────────────────────

export async function getTransportRoutes(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('transport_routes')
      .select('*')
      .eq('school_id', req.user!.school_id)
      .order('name', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch transport routes' });
  }
}

export async function createTransportRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, description, feeAmount, pickupPoints } = req.body;
    if (!name) return res.status(400).json({ error: 'Route name is required' });

    // Prevent duplicate route names within the same school (case-insensitive)
    const normalizedName = String(name).trim();
    const { data: existingRoute } = await supabaseAdmin
      .from('transport_routes')
      .select('id, name')
      .eq('school_id', req.user!.school_id)
      .or(`name.ilike.${encodeURIComponent(normalizedName)},route_name.ilike.${encodeURIComponent(normalizedName)}`)
      .limit(1);
    if (existingRoute && existingRoute.length > 0) {
      return res.status(409).json({ error: `A transport route named "${existingRoute[0].name}" already exists. Please use a different name.` });
    }

    const { data, error } = await supabaseAdmin
      .from('transport_routes')
      .insert({
        school_id: req.user!.school_id,
        name,
        description: description || null,
        fee_amount: feeAmount || 0,
        pickup_points: pickupPoints || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create transport route' });
  }
}

export async function updateTransportRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, feeAmount, pickupPoints, isActive } = req.body;

    // Prevent renaming to a name already used by another route in this school (case-insensitive)
    if (name && String(name).trim()) {
      const normalizedName = String(name).trim();
      const { data: existingRoute } = await supabaseAdmin
        .from('transport_routes')
        .select('id, name')
        .eq('school_id', req.user!.school_id)
        .or(`name.ilike.${encodeURIComponent(normalizedName)},route_name.ilike.${encodeURIComponent(normalizedName)}`)
        .neq('id', id)
        .limit(1);
      if (existingRoute && existingRoute.length > 0) {
        return res.status(409).json({ error: `A transport route named "${existingRoute[0].name}" already exists. Please use a different name.` });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('transport_routes')
      .update({
        name,
        description,
        fee_amount: feeAmount,
        pickup_points: pickupPoints,
        is_active: isActive,
      })
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update transport route' });
  }
}

export async function deleteTransportRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('transport_routes')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Transport route deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete transport route' });
  }
}

// Assign or unassign a student to a transport route
export async function assignStudentTransportRoute(req: AuthenticatedRequest, res: Response) {
  try {
    const { studentId, routeId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const { error } = await supabaseAdmin
      .from('students')
      .update({ transport_route_id: routeId || null })
      .eq('id', studentId)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: routeId ? 'Student assigned to route' : 'Student removed from route' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to assign transport route' });
  }
}

// ==========================================
// FEE EXEMPTIONS (PER STRUCTURE)
// ==========================================

export async function getFeeExemptions(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { feeStructureId } = req.query;

    let query = supabaseAdmin.from('fee_exemptions')
      .select('id, fee_structure_id, created_at, student:students(id, admission_number, roll_number, section:sections(name, class:classes(name)), user:users(first_name, last_name))')
      .eq('school_id', schoolId);

    if (feeStructureId) {
      query = query.eq('fee_structure_id', feeStructureId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function addFeeExemption(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const userId = req.user?.id;
    const { studentId, feeStructureId } = req.body;

    if (!studentId || !feeStructureId) {
      return res.status(400).json({ error: 'studentId and feeStructureId are required' });
    }

    const [{ data: student, error: studentError }, { data: structure, error: structureError }] = await Promise.all([
      supabaseAdmin.from('students').select('id').eq('id', studentId).eq('school_id', schoolId).maybeSingle(),
      supabaseAdmin.from('fee_structures').select('id').eq('id', feeStructureId).eq('school_id', schoolId).maybeSingle(),
    ]);
    if (studentError || structureError) throw studentError || structureError;
    if (!student || !structure) return res.status(400).json({ error: 'Student or fee structure was not found in this school' });

    const { data, error } = await supabaseAdmin
      .from('fee_exemptions')
      .insert({
        school_id: schoolId,
        student_id: studentId,
        fee_structure_id: feeStructureId,
        created_by: userId
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ error: 'Student is already exempted from this fee structure' });
      }
      throw error;
    }

    // Preserve paid records, but remove unpaid dues tied to the newly exempted structure.
    const { data: removedPayments, error: clearError } = await supabaseAdmin
      .from('fee_payments')
      .delete()
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('fee_structure_id', feeStructureId)
      .in('status', ['pending', 'overdue'])
      .select('id');
    if (clearError) throw clearError;

    res.json({ ...data, removedUnpaidDues: removedPayments?.length || 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function removeFeeExemption(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('fee_exemptions')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}



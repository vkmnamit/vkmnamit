import { supabaseAdmin } from '../config/supabase';
import { fetchAllRows, chunkArray } from '../utils/supabasePagination';
import { feeTitleForMonth, isPaymentForMonthLabel } from './fees_automation.service';

/**
 * Return a Date representing "now" in IST (Asia/Kolkata), even when the
 * server runs in UTC. This ensures the "current month" used for fee
 * generation, due dates, and labels always matches the Indian calendar
 * month — so at 12:30 AM IST (midnight UTC) we correctly bill the NEW
 * month instead of the previous one.
 */
export function nowInIST(): Date {
    const istOffsetMs = 5.5 * 60 * 60 * 1000; // +05:30
    const nowUtcMs = Date.now();
    // Construct a UTC Date offset by +5:30h so its .getMonth()/.getFullYear()
    // reflect the Indian wall-clock date.
    return new Date(nowUtcMs + istOffsetMs);
}

// ═══════════════════════════════════════════════════════════════════════════
// CENTRALIZED FEE GENERATION SERVICE
// 
// This is the SINGLE source of truth for fee generation across the entire app:
//   - Auto-cron (fees_automation.service.ts)
//   - Admin "Generate Fees" button (fees.controller.ts)
//   - Admission wizard (student.controller.ts)
//   - Bulk student import (student.controller.ts)
//   - Student promotion (student.controller.ts)
//   - Sync Dues (fees.controller.ts)
//
// Every path MUST call `generateFeesForMonth()` so that:
//   1. Duplicate detection is identical everywhere (no double billing)
//   2. Admin can select WHICH month to generate fees for (not always current)
//   3. Notifications are batched once per school
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerateFeesOptions {
    schoolId: string;
    /** Target billing month in YYYY-MM format. Defaults to current month. */
    month?: string;
    /** Optional: restrict fee generation to specific fee_structure IDs */
    structureIds?: string[];
    /** Optional: restrict to specific student IDs (used by admission wizard) */
    studentIds?: string[];
    /** Optional: filter by class_id → sections */
    classId?: string;
    /** Optional: filter by section_id */
    sectionId?: string;
    /** Optional: only generate tuition fees ('tuition' | 'transport' | 'both') */
    feeType?: 'tuition' | 'transport' | 'both';
    /** Skip dedup — USE WITH EXTREME CAUTION. Only for one_time/manual fees. */
    force?: boolean;
    /** For admission: create only for a newly-added student */
    isAdmission?: boolean;
}

export interface GenerateFeesResult {
    generated: number;
    skipped: number;
    details: string[];
    errors: string[];
    monthLabel: string;
}

/**
 * Parse a 'YYYY-MM' string into a month label like "August 2026".
 * If invalid, defaults to the current month.
 */
export function monthLabelFromMonth(month?: string): string {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [yr, mo] = month.split('-').map(Number);
        if (yr >= 2000 && yr <= 2100 && mo >= 1 && mo <= 12) {
            const d = new Date(yr, mo - 1, 1);
            return d.toLocaleString('default', { month: 'long', year: 'numeric' });
        }
    }
    // Use IST so the label reflects the Indian month, not the server's.
    const ist = nowInIST();
    return ist.toLocaleString('default', { month: 'long', year: 'numeric' });
}

/**
 * Convert a month label ("August 2026") back to 'YYYY-MM'.
 */
export function monthFromLabel(label: string): string {
    try {
        const d = new Date(`${label} 1, 2000`); // placeholder year — replaced below
        const parsed = new Date(Date.parse(`${label} 1`));
        if (!isNaN(parsed.getTime())) {
            return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
        }
    } catch { }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get the target Date for a given YYYY-MM billing month.
 */
export function billingDateForMonth(month?: string): Date {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [yr, mo] = month.split('-').map(Number);
        if (yr >= 2000 && yr <= 2100 && mo >= 1 && mo <= 12) {
            return new Date(yr, mo - 1, 1);
        }
    }
    // Default to TODAY in IST so the billing month, due dates, and
    // fee_start_month comparison all use the Indian calendar.
    return nowInIST();
}

/**
 * Batch-fetch parent user IDs for many students.
 * Chunks the `.in()` clause (500 ids at a time) so schools with 5000+ students
 * don't overflow the URL/header size limit on a single request.
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

/**
 * Insert fee_payments in 500-row chunks to avoid Supabase param/body limits.
 */
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

/**
 * Build a dedup map: student_id → Set<fee_structure_id> for already-billed
 * payments for a specific school + month.
 */
async function buildAlreadyBilledMap(
    schoolId: string,
    monthLabel: string,
    allStructures: any[]
): Promise<Map<string, Set<string>>> {
    // Page with `.range()` — a school with >1000 already-billed month fees would
    // otherwise only return the FIRST 1000 rows, causing duplicate billing.
    const existingPayments = await fetchAllRows(
        supabaseAdmin
            .from('fee_payments')
            .select('id, student_id, title, remarks, fee_structure_id')
            .eq('school_id', schoolId)
            .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`)
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
 * Build exemption map: student_id → Set<fee_structure_id>.
 */
async function buildExemptionMap(schoolId: string): Promise<Map<string, Set<string>>> {
    const exemptions = await fetchAllRows(
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
 * Build a set of (student_id, fee_structure_id) already billed for a specific
 * month — used for admission-time dedup (avoid creating a fee the cron or
 * admin button already created).
 */
export async function hadFeeForMonth(
    schoolId: string,
    studentId: string,
    structureId: string,
    monthLabel: string
): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('fee_payments')
        .select('id, title, remarks, fee_structure_id')
        .eq('school_id', schoolId)
        .eq('student_id', studentId)
        .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`)
        .limit(50);

    return (data || []).some(p => isPaymentForMonthLabel(p, monthLabel, structureId));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CENTRAL FEE GENERATION FUNCTION
 *
 * Every fee-generation path in the system MUST use this to avoid duplicates.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function generateFeesForMonth(options: GenerateFeesOptions): Promise<GenerateFeesResult> {
    const {
        schoolId,
        month,
        structureIds,
        studentIds,
        classId,
        sectionId,
        feeType = 'both',
        force = false,
    } = options;

    const now = billingDateForMonth(month);
    const monthLabel = monthLabelFromMonth(month);
    const billingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const details: string[] = [];
    const errors: string[] = [];
    let totalGenerated = 0;
    let totalSkipped = 0;

    // Resolve eligible sections from class filter
    let eligibleSectionIds: string[] | null = null;
    if (sectionId) {
        eligibleSectionIds = [sectionId];
    } else if (classId) {
        const { data: classSections } = await supabaseAdmin
            .from('sections')
            .select('id, class:classes!inner(school_id)')
            .eq('class_id', classId)
            .eq('classes.school_id', schoolId);
        eligibleSectionIds = classSections?.map((s: any) => s.id) || [];
    }

    // ── TUITION FEES (from fee_structures) ──
    if (feeType === 'tuition' || feeType === 'both') {
        let structureQuery = supabaseAdmin
            .from('fee_structures')
            .select('*')
            .eq('school_id', schoolId);
        if (structureIds && structureIds.length > 0) {
            structureQuery = structureQuery.in('id', structureIds);
        }
        const { data: structures } = await structureQuery;

        if (structures && structures.length > 0) {
            // Batch dedup: build map of already-billed (student, structure) once
            const alreadyBilled = force ? new Map<string, Set<string>>() : await buildAlreadyBilledMap(schoolId, monthLabel, structures);
            const exemptionMap = await buildExemptionMap(schoolId);

            // ── RECURRING DISCOUNTS ──
            // Fetch all active recurring discounts for this school.
            // These are auto-applied to every new fee generated for the student.
            const { data: recurringDiscounts } = await supabaseAdmin
                .from('fee_discounts')
                .select('student_id, amount, reason, type, recurrence')
                .eq('school_id', schoolId)
                .eq('is_active', true)
                .in('recurrence', ['monthly', 'quarterly', 'annually']);

            // Build map: studentId -> { monthly: {amount, reason}, quarterly: {...}, annually: {...} }
            const recurringDiscountMap = new Map<string, Record<string, { amount: number; reason: string }>>();
            for (const d of recurringDiscounts || []) {
                const rec = d.recurrence || 'monthly';
                if (!recurringDiscountMap.has(d.student_id)) {
                    recurringDiscountMap.set(d.student_id, {});
                }
                const studentDiscs = recurringDiscountMap.get(d.student_id)!;
                studentDiscs[rec] = {
                    amount: (studentDiscs[rec]?.amount || 0) + Number(d.amount),
                    reason: d.reason || `${rec} recurring discount`
                };
            }

            for (const structure of structures) {
                // Determine eligible students
                let studentQuery = supabaseAdmin
                    .from('students')
                    .select('id, fee_start_month')
                    .eq('school_id', schoolId)
                    .eq('is_active', true);

                if (studentIds && studentIds.length > 0) {
                    studentQuery = studentQuery.in('id', studentIds);
                }

                if (structure.applies_to === 'transport_route' && structure.transport_route_id) {
                    studentQuery = studentQuery.eq('transport_route_id', structure.transport_route_id);
                } else if (structure.applies_to === 'class' && structure.class_id) {
                    if (eligibleSectionIds !== null) {
                        const { data: structSections } = await supabaseAdmin.from('sections').select('id').eq('class_id', structure.class_id);
                        const structSectionIds = structSections?.map((s: any) => s.id) || [];
                        const overlap = eligibleSectionIds.filter(id => structSectionIds.includes(id));
                        if (overlap.length === 0) { totalSkipped++; continue; }
                        studentQuery = studentQuery.in('section_id', overlap);
                    } else {
                        const { data: sections } = await supabaseAdmin.from('sections').select('id').eq('class_id', structure.class_id);
                        const sectionIds = sections?.map((s: any) => s.id) || [];
                        if (sectionIds.length === 0) { totalSkipped++; continue; }
                        studentQuery = studentQuery.in('section_id', sectionIds);
                    }
                } else if (eligibleSectionIds !== null) {
                    studentQuery = studentQuery.in('section_id', eligibleSectionIds);
                }

                // Page with `.range()` so >1000-student classes/schools are fully
                // included instead of silently truncating to the first 1000 rows.
                const students = await fetchAllRows<{ id: string; fee_start_month?: string | null }>(studentQuery);
                if (!students || students.length === 0) { totalSkipped++; continue; }

                const title = feeTitleForMonth(structure.name, monthLabel);
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const safeDueDay = Math.min(structure.due_day || 10, daysInMonth);
                const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(safeDueDay).padStart(2, '0')}`;

                const newStudents = students.filter((s: any) => {
                    if (force) return true;
                    const billed = alreadyBilled.get(s.id);
                    if (billed?.has(structure.id)) return false;
                    const studentExemptions = exemptionMap.get(s.id);
                    if (studentExemptions?.has(structure.id)) return false;
                    // Skip students whose fee_start_month is in the future
                    if (s.fee_start_month && s.fee_start_month > billingMonth) return false;
                    return true;
                });

                if (newStudents.length === 0) { totalSkipped++; continue; }

                const inserts = newStudents.map((s: any) => {
                    // ── APPLY RECURRING DISCOUNT ──
                    // Determine which recurrence applies based on the structure's frequency.
                    const structureFreq = structure.frequency || 'monthly';
                    const discKey = structureFreq === 'monthly' ? 'monthly' : structureFreq === 'quarterly' ? 'quarterly' : structureFreq === 'annually' ? 'annually' : null;
                    const disc = discKey ? recurringDiscountMap.get(s.id)?.[discKey] : undefined;
                    const discountAmt = disc ? Math.min(Number(structure.amount), disc.amount) : 0;
                    const expected = Math.max(0, Number(structure.amount) - discountAmt);

                    let remarks = `Auto-generated for ${monthLabel}`;
                    if (discountAmt > 0 && disc) {
                        remarks += ` | Recurring Discount Applied: ₹${discountAmt} (${disc.reason || 'recurring'})`;
                    }

                    return {
                        school_id: schoolId,
                        student_id: s.id,
                        fee_structure_id: structure.id,
                        academic_year_id: structure.academic_year_id || null,
                        transport_route_id: structure.applies_to === 'transport_route' ? structure.transport_route_id : null,
                        title,
                        amount: Number(structure.amount),
                        discount_amount: discountAmt,
                        paid_amount: 0,
                        status: expected === 0 ? 'paid' : 'pending',
                        payment_method: 'unpaid',
                        due_date: dueDate,
                        late_fee: 0,
                        remarks,
                    };
                });

                const inserted = await insertFeePaymentsChunked(inserts);
                if (inserted.length === 0) {
                    errors.push(`Tuition - ${structure.name}: All chunks failed`);
                    totalSkipped += inserts.length;
                    continue;
                }

                totalGenerated += inserted.length;
                details.push(`Tuition - ${structure.name}: ${inserted.length} generated`);

                // Batch notifications
                const parentUserIds = await batchFetchParentUserIds(newStudents.map((s: any) => s.id));
                await batchCreateInAppNotifications(
                    schoolId,
                    parentUserIds,
                    inserted.map((p: any) => ({
                        student_id: p.student_id,
                        fee_id: p.id,
                        title: structure.name,
                        amount: Number(structure.amount),
                        due_date: dueDate,
                    }))
                );
            }
        }
    }

    // ── TRANSPORT FEES (from transport_routes) ──
    if (feeType === 'transport' || feeType === 'both') {
        let routeQuery = supabaseAdmin
            .from('transport_routes')
            .select('id, name, route_name, monthly_fee, quarterly_fee, annual_fee')
            .eq('school_id', schoolId)
            .eq('is_active', true);
        const { data: routes } = await routeQuery;

        if (routes && routes.length > 0) {
            const currentMonth = now.getMonth() + 1;
            const isQuarterStart = [1, 4, 7, 10].includes(currentMonth);
            const isAnnualMonth = currentMonth === 4;
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const dueDay = Math.min(10, daysInMonth);
            const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

            for (const route of routes) {
                const routeName = route.name || route.route_name || 'Route';
                const feesToCharge: { type: string; amount: number }[] = [];

                if (Number(route.monthly_fee) > 0) feesToCharge.push({ type: 'Monthly', amount: Number(route.monthly_fee) });
                if (isQuarterStart && Number(route.quarterly_fee) > 0) feesToCharge.push({ type: 'Quarterly', amount: Number(route.quarterly_fee) });
                if (isAnnualMonth && Number(route.annual_fee) > 0) feesToCharge.push({ type: 'Annual', amount: Number(route.annual_fee) });

                if (feesToCharge.length === 0) continue;

                let studentQuery = supabaseAdmin
                    .from('students')
                    .select('id')
                    .eq('school_id', schoolId)
                    .eq('is_active', true)
                    .eq('transport_route_id', route.id);

                if (studentIds && studentIds.length > 0) {
                    studentQuery = studentQuery.in('id', studentIds);
                }
                if (eligibleSectionIds !== null) {
                    studentQuery = studentQuery.in('section_id', eligibleSectionIds);
                }

                // Page with `.range()` — a transport route can exceed 1000 students
                // in large schools and must not be truncated to the first 1000.
                const students = await fetchAllRows<{ id: string }>(studentQuery);
                if (!students || students.length === 0) { totalSkipped++; continue; }

                for (const fee of feesToCharge) {
                    const titleMatch = `${routeName} - ${fee.type} Transport Fee - ${monthLabel}`;

                    // Dedup on exact title + route + month
                    // Check ALL students for this route to prevent duplicates.
                    // Paginated too: >1000 already-billed rows would otherwise be
                    // truncated, causing students past row 1000 to be double-billed.
                    const existing = force
                        ? []
                        : await fetchAllRows<{ student_id: string }>(
                            supabaseAdmin
                                .from('fee_payments')
                                .select('student_id')
                                .eq('transport_route_id', route.id)
                                .eq('title', titleMatch)
                                .gte('created_at', `${billingMonth}-01`)
                                .lt('created_at', new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0])
                          );

                    const existingStudentIds = new Set((existing || []).map((p: any) => p.student_id));

                    // If specific students requested, only check those
                    let studentsToProcess = students;
                    if (studentIds && studentIds.length > 0) {
                        studentsToProcess = students.filter((s: any) => studentIds.includes(s.id));
                    }

                    const newStudents = studentsToProcess.filter((s: any) => !existingStudentIds.has(s.id));
                    if (newStudents.length === 0) { totalSkipped++; continue; }

                    const payments = newStudents.map((s: any) => ({
                        school_id: schoolId,
                        student_id: s.id,
                        fee_structure_id: null,
                        academic_year_id: null,
                        transport_route_id: route.id,
                        title: titleMatch,
                        amount: fee.amount,
                        paid_amount: 0,
                        status: 'pending',
                        payment_method: 'unpaid',
                        due_date: dueDate,
                        late_fee: 0,
                        remarks: `Admin-generated ${fee.type.toLowerCase()} transport fee for ${monthLabel}`,
                    }));

                    const inserted = await insertFeePaymentsChunked(payments);
                    if (inserted.length === 0) {
                        errors.push(`Transport - ${routeName} (${fee.type}): Failed`);
                        totalSkipped += payments.length;
                    } else {
                        totalGenerated += inserted.length;
                        details.push(`Transport - ${routeName} (${fee.type}): ${inserted.length} generated`);
                    }
                }
            }
        }
    }

    return {
        generated: totalGenerated,
        skipped: totalSkipped,
        details,
        errors,
        monthLabel,
    };
}

/**
 * Generate fees for a single student (admission wizard). Uses the same
 * dedup logic as the bulk generation to prevent duplicate fees when the
 * cron has already billed the student for the month.
 */
export async function generateFeesForStudent(
    schoolId: string,
    studentId: string,
    structureIds: string[],
    month?: string
): Promise<{ generated: number; skipped: number; details: string[]; errors: string[] }> {
    const now = billingDateForMonth(month);
    const monthLabel = monthLabelFromMonth(month);

    if (!structureIds || structureIds.length === 0) {
        return { generated: 0, skipped: 0, details: ['No fee structures selected'], errors: [] };
    }

    const { data: structures } = await supabaseAdmin
        .from('fee_structures')
        .select('*')
        .in('id', structureIds);

    if (!structures || structures.length === 0) {
        return { generated: 0, skipped: 0, details: ['No matching fee structures found'], errors: [] };
    }

    // Fetch student's fee_start_month for proration
    const { data: student } = await supabaseAdmin
        .from('students')
        .select('fee_start_month')
        .eq('id', studentId)
        .eq('school_id', schoolId)
        .maybeSingle();

    const studentStartMonth = student?.fee_start_month;
    const billingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // If the student's fee_start_month is in the future, skip (don't bill yet)
    if (studentStartMonth && studentStartMonth > billingMonth) {
        return { generated: 0, skipped: structureIds.length, details: [`Fee start ${studentStartMonth} is after ${billingMonth} — no bills generated`], errors: [] };
    }

    // Build dedup map for this student
    const { data: existingPayments } = await supabaseAdmin
        .from('fee_payments')
        .select('id, student_id, title, remarks, fee_structure_id')
        .eq('school_id', schoolId)
        .eq('student_id', studentId)
        .or(`title.ilike.%${monthLabel}%,remarks.ilike.%${monthLabel}%`)
        .limit(100);

    const alreadyBilled = new Set<string>();
    for (const p of existingPayments || []) {
        if (isPaymentForMonthLabel(p, monthLabel)) {
            if (p.fee_structure_id) alreadyBilled.add(p.fee_structure_id);
            // Legacy merged title covers all structures
            if ((p.title || '').toLowerCase().includes(`monthly fee - ${monthLabel.toLowerCase()}`)) {
                for (const st of structures) alreadyBilled.add(st.id);
            }
        }
    }

    // Check exemptions
    const { data: exemptions } = await supabaseAdmin
        .from('fee_exemptions')
        .select('fee_structure_id')
        .eq('school_id', schoolId)
        .eq('student_id', studentId);
    const exempted = new Set((exemptions || []).map((e: any) => e.fee_structure_id));

    // Calculate due date
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dueDayNum = Math.min(...structures.map((s: any) => s.due_day || 10));
    const safeDueDay = Math.min(dueDayNum, daysInMonth);
    const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(safeDueDay).padStart(2, '0')}`;

    let generated = 0;
    let skipped = 0;
    const detailsArr: string[] = [];
    const errors: string[] = [];

    for (const structure of structures) {
        if (alreadyBilled.has(structure.id)) {
            skipped++;
            detailsArr.push(`${structure.name}: already billed for ${monthLabel}`);
            continue;
        }
        if (exempted.has(structure.id)) {
            skipped++;
            detailsArr.push(`${structure.name}: exempted`);
            continue;
        }

        const { error } = await supabaseAdmin.from('fee_payments').insert({
            school_id: schoolId,
            student_id: studentId,
            fee_structure_id: structure.id,
            academic_year_id: structure.academic_year_id || null,
            transport_route_id: structure.applies_to === 'transport_route' ? structure.transport_route_id : null,
            title: `${structure.name} - ${monthLabel}`,
            amount: Number(structure.amount),
            paid_amount: 0,
            status: 'pending',
            payment_method: 'unpaid',
            due_date: dueDate,
            late_fee: 0,
            remarks: `Admission fee for ${monthLabel}`,
        });

        if (error) {
            errors.push(`${structure.name}: ${error.message}`);
            skipped++;
        } else {
            generated++;
            detailsArr.push(`${structure.name}: ₹${structure.amount} generated for ${monthLabel}`);
        }
    }

    return { generated, skipped, details: detailsArr, errors };
}
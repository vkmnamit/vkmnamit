import cron from 'node-cron';
import { supabaseAdmin as supabase } from '../config/supabase';
import { notificationService } from './notification.service';
import { generateFeesForMonth, monthLabelFromMonth } from './fee_generation.service';
import { format, endOfMonth, subDays, startOfMonth, differenceInCalendarDays, parseISO } from 'date-fns';

// ═══════════════════════════════════════════════════════════════
// SHARED FEE-GENERATION HELPERS
// These keep every generation path (auto-cron, admin click, sync)
// using the SAME duplicate-detection logic so no double billing.
// ═══════════════════════════════════════════════════════════════

/** Standard per-structure monthly title: "Tuition Fee - August 2026" */
export function feeTitleForMonth(structureName: string, monthLabel: string): string {
  return `${structureName} - ${monthLabel}`;
}

/** Legacy merged title used by old auto-generation: "Monthly Fee - August 2026" */
export function mergedMonthlyTitleForMonth(monthLabel: string): string {
  return `Monthly Fee - ${monthLabel}`;
}

/**
 * True if a fee_payment already represents this month's fee for a student.
 * Matches BOTH the per-structure title and the legacy merged title.
 */
export function nowInIST(): Date {
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // +05:30
  return new Date(Date.now() + istOffsetMs);
}

export function isPaymentForMonthLabel(
  payment: { title?: string | null; remarks?: string | null; fee_structure_id?: string | null },
  monthLabel: string,
  feeStructureId?: string | null
): boolean {
  const month = monthLabel.toLowerCase();
  const title = (payment.title || '').toLowerCase();
  const remarks = (payment.remarks || '').toLowerCase();

  if (feeStructureId && payment.fee_structure_id === feeStructureId) {
    if (title.includes(month) || remarks.includes(month)) return true;
  }
  return (
    title.includes(`monthly fee - ${month}`) ||
    remarks.includes(`auto-generated for ${month}`) ||
    remarks.includes(`admin-generated for ${month}`)
  );
}

class FeesAutomationService {
  // In-flight guard: prevents the midnight cron and an admin click from
  // running fee generation for the same school concurrently (race → dupes).
  private schoolGenInFlight = new Set<string>();

  /**
   * Insert fee_payments in small batches. Supabase/PostgreSQL rejects
   * requests with too many parameters (default 32767) or oversized bodies
   * — single inserts of 5000+ rows can throw PGRST116/413 at runtime.
   * Chunking avoids that entirely and if one batch fails (e.g. unique
   * violation from a concurrent run) we log and CONTINUE instead of
   * aborting the whole school.
   */
  private async insertFeePaymentsInChunks(
    rows: any[],
    chunkSize = 500
  ): Promise<{ inserted: any[]; failedRows: number; errors: string[] }> {
    const allInserted: any[] = [];
    const errors: string[] = [];
    let failedRows = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('fee_payments')
        .insert(chunk)
        .select('id, student_id, amount, discount_amount');

      if (error) {
        failedRows += chunk.length;
        errors.push(error.message);
        console.error(`[FEE-GEN] Chunk insert ${i}-${i + chunk.length - 1} failed:`, error.message);
      } else {
        allInserted.push(...(data || []));
      }
    }

    return { inserted: allInserted, failedRows, errors };
  }

  constructor() {
    // ═══════════════════════════════════════════════════════
    // CRON 1: Auto-generate fee_payments on the 1st of every month.
    // The centralized service uses nowInIST() internally, so the fees are
    // always billed for the CURRENT INDIAN month regardless of the server
    // timezone — even if this cron fires at server-midnight UTC.
    // ═══════════════════════════════════════════════════════
    cron.schedule('0 0 1 * *', () => {
      console.log('[CRON] Running monthly fee generation (IST month)...');
      this.autoGenerateMonthlyFees();
    });

    // ═══════════════════════════════════════════════════════
    // CRON 2: Daily fee reminder check (7d, 3d, due, 5d/10d/30d overdue)
    // ═══════════════════════════════════════════════════════
    cron.schedule('0 9 * * *', () => {
      this.runScheduledFeeReminders();
    });

    // Legacy month-end reminder (kept for backward compatibility)
    cron.schedule('0 10 * * *', () => {
      this.checkAndSendReminders();
    });

    // ═══════════════════════════════════════════════════════
    // CRON 3: Mark overdue fees on the 1st of every month at 1 AM
    // Runs after fee generation (midnight). Any fee from last month
    // still "pending" becomes "overdue".
    // ═══════════════════════════════════════════════════════
    cron.schedule('0 1 1 * *', () => {
      console.log('[CRON] Marking overdue fees...');
      this.markOverdueFees();
    });

    // ═══════════════════════════════════════════════════════
    // CRON 4: End-of-month auto-receipts + progress reports at 8 PM
    // Sends receipts for all fees paid this month, plus a
    // consolidated monthly progress report with REAL data.
    // ═══════════════════════════════════════════════════════
    cron.schedule('0 20 28-31 * *', () => {
      const today = new Date();
      const lastDay = endOfMonth(today);
      if (today.getDate() === lastDay.getDate()) {
        console.log('[CRON] Running end-of-month receipts & reports...');
        this.sendEndOfMonthReceipts();
        this.sendMonthlyProgressReports();
      }
    });

    // ═══════════════════════════════════════════════════════
    // CRON 5: Daily Admin Fee Digest at 8 AM
    // Sends admins a school-mapped section-wise fee summary:
    // total pending, overdue counts, new payments today.
    // ═══════════════════════════════════════════════════════
    cron.schedule('0 8 * * *', () => {
      console.log('[CRON] Running daily admin fee digest...');
      this.sendAdminFeeDigest();
    });

    // ═══════════════════════════════════════════════════════
    // CRON 6: Daily Payroll Pending Reminders at 10 AM
    // For every school, remind admin of unpaid teacher salaries.
    // Also sends in-app + email to each teacher with pending pay.
    // ═══════════════════════════════════════════════════════
    cron.schedule('0 10 * * *', () => {
      console.log('[CRON] Running payroll pending reminders...');
      this.sendPayrollPendingReminders();
    });

    console.log('✅ Kautix Fees Automation Service Initialized [6 Cron Jobs Active]');
  }

  // ════════════════════════════════════════════════════════════
  // AUTO-GENERATE MONTHLY FEE PAYMENTS
  // Creates per-fee-structure payments (same title format as the
  // admin button: "Tuition Fee - August 2026") so the admin-path
  // dedupe and the cron-path dedupe are fully compatible.
  //
  // Options:
  //   schoolId?  — restrict to one school (admin click). When omitted
  //                (midnight cron), every school is processed.
  // A per-school in-flight guard prevents the cron and an admin
  // click from racing and creating duplicates.
  // ════════════════════════════════════════════════════════════
  async autoGenerateMonthlyFees(options: { schoolId?: string } = {}) {
    const { schoolId } = options;

    if (schoolId) {
      if (this.schoolGenInFlight.has(schoolId)) {
        console.log(`[FEE-GEN] Generation already in flight for school ${schoolId}. Skipping duplicate run.`);
        return { generated: 0, skipped: 0, alreadyRunning: true };
      }
      this.schoolGenInFlight.add(schoolId);
    }

    try {
      let schoolQuery = supabase.from('schools').select('id, name');
      if (schoolId) schoolQuery = schoolQuery.eq('id', schoolId);
      const { data: schools } = await schoolQuery;

      let totalGenerated = 0;
      let totalSkipped = 0;

      for (const school of schools || []) {
        // Use the CENTRALIZED fee generation service.
        // We omit `month` so the service defaults to the CURRENT INDIAN month
        // via nowInIST() — never the server's calendar month.
        const result = await generateFeesForMonth({
          schoolId: school.id,
          feeType: 'both',
          force: false,
        });

        totalGenerated += result.generated;
        totalSkipped += result.skipped;

        console.log(`[CRON] ${school.name}: ${result.generated} generated, ${result.skipped} skipped`);
      }

      console.log(`[FEE-GEN] ✅ Cron finished. Generated ${totalGenerated}, skipped ${totalSkipped}`);
      return { generated: totalGenerated, skipped: totalSkipped };
    } catch (error: any) {
      console.error('[FEE-GEN] Fatal error:', error.message);
      return { generated: 0, skipped: 0, error: error.message };
    } finally {
      if (schoolId) this.schoolGenInFlight.delete(schoolId);
    }
  }

  private async sendFeeGeneratedNotifications(
    school: { id: string; name: string },
    insertedPayments: any[],
    opts: { title: string; monthLabel: string; dueDate: string; students: any[] }
  ) {
    for (const s of opts.students) {
      const sUser = (s as any).user;
      if (!sUser) continue;

      const p = insertedPayments.find(ip => ip.student_id === s.id);
      if (!p) continue;
      if (p.amount - p.discount_amount <= 0) continue;

      const notifMsg = `📋 New fee raised: "${opts.title}" of ₹${p.amount} for ${opts.monthLabel}. ` +
        (p.discount_amount > 0 ? `(A recurring discount of ₹${p.discount_amount} was applied). ` : '') +
        `Due by: ${opts.dueDate}. Please clear dues on time.`;

      notificationService.createInAppNotification({
        schoolId: school.id,
        userId: sUser.id,
        type: 'fee_generated',
        title: `New Fee: ${opts.title}`,
        message: notifMsg,
      }).catch(console.error);

      notificationService.sendMultiChannel({
        schoolId: school.id,
        userId: sUser.id,
        channels: ['email', 'whatsapp'],
        type: 'fee_generated',
        title: `Fee Due: ${opts.title}`,
        message: notifMsg,
        emailAddress: sUser.email,
        phone: sUser.phone,
      }).catch(console.error);

      (async () => {
        try {
          const { data: parentLink } = await supabase
            .from('parent_students')
            .select('parent:parents(user:users(id, email, phone))')
            .eq('student_id', s.id)
            .limit(1)
            .maybeSingle();

          const pUser = (parentLink as any)?.parent?.user;
          if (pUser) {
            const parentMsg = `📋 Dear Parent, a new fee "${opts.title}" of ₹${p.amount} has been raised for ${sUser.first_name} for ${opts.monthLabel}. ` +
              (p.discount_amount > 0 ? `(Discount applied: ₹${p.discount_amount}). ` : '') +
              `Due by: ${opts.dueDate}.`;

            notificationService.createInAppNotification({
              schoolId: school.id,
              userId: pUser.id,
              type: 'fee_generated',
              title: `New Fee for ${sUser.first_name}: ${opts.title}`,
              message: parentMsg,
            }).catch(console.error);

            notificationService.sendMultiChannel({
              schoolId: school.id,
              userId: pUser.id,
              channels: ['email', 'whatsapp'],
              type: 'fee_generated',
              title: `Fee Due: ${opts.title}`,
              message: parentMsg,
              emailAddress: pUser.email,
              phone: pUser.phone,
            }).catch(console.error);
          }
        } catch (err) {
          console.error(err);
        }
      })();
    }
  }

  private async generateTransportRouteFees(schoolId: string, now: Date) {
    const currentMonth = now.getMonth() + 1;
    const isQuarterStart = [1, 4, 7, 10].includes(currentMonth);
    const isAnnualMonth = currentMonth === 4;

    const { data: routes, error: routesError } = await supabase
      .from('transport_routes')
      .select('id, name, monthly_fee, quarterly_fee, annual_fee')
      .eq('school_id', schoolId)
      .eq('is_active', true);

    if (routesError) {
      console.error('[FEE-GEN] Could not load transport routes:', routesError.message);
      return;
    }

    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const nextMonthStart = format(new Date(now.getFullYear(), now.getMonth() + 1, 1), 'yyyy-MM-dd');
    const monthLabel = format(now, 'MMMM yyyy');

    for (const route of routes || []) {
      const feesToCharge: { type: string; amount: number }[] = [];

      if (route.monthly_fee > 0) feesToCharge.push({ type: 'Monthly', amount: route.monthly_fee });
      if (isQuarterStart && route.quarterly_fee > 0) feesToCharge.push({ type: 'Quarterly', amount: route.quarterly_fee });
      if (isAnnualMonth && route.annual_fee > 0) feesToCharge.push({ type: 'Annual', amount: route.annual_fee });

      if (feesToCharge.length === 0) continue;

      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .eq('transport_route_id', route.id);

      if (studentsError || !students?.length) continue;

      for (const fee of feesToCharge) {
        const titleMatch = `${route.name} - ${fee.type} Transport Fee - ${monthLabel}`;

        const { data: existing, error: existingError } = await supabase
          .from('fee_payments')
          .select('student_id')
          .eq('transport_route_id', route.id)
          .eq('title', titleMatch)
          .gte('created_at', monthStart)
          .lt('created_at', nextMonthStart);

        if (existingError) continue;

        const existingStudentIds = new Set((existing || []).map((p: any) => p.student_id));
        const dueDay = Math.min(10, endOfMonth(now).getDate());
        const dueDate = `${format(now, 'yyyy-MM')}-${String(dueDay).padStart(2, '0')}`;

        const payments = students
          .filter((s: any) => !existingStudentIds.has(s.id))
          .map((s: any) => ({
            school_id: schoolId,
            student_id: s.id,
            fee_structure_id: null,
            academic_year_id: null,
            transport_route_id: route.id,
            title: titleMatch,
            amount: Number(fee.amount),
            paid_amount: 0,
            status: 'pending',
            payment_method: 'unpaid',
            due_date: dueDate,
            late_fee: 0,
            remarks: `Auto-generated ${fee.type.toLowerCase()} transport fee for ${monthLabel}`,
          }));

        if (!payments.length) continue;

        const chunkResult = await this.insertFeePaymentsInChunks(payments);
        if (chunkResult.inserted.length === 0) {
          console.error(`[FEE-GEN] Failed to generate ${fee.type} transport fees for ${route.name}:`, chunkResult.errors.join('; '));
        } else {
          console.log(`[FEE-GEN] Created ${chunkResult.inserted.length} ${fee.type} transport fee payments for "${route.name}"`);
        }
      }
    }
  }

  // Generate quarterly (Jan/Apr/Jul/Oct) and annual (Apr) fee payments
  private async generateNonMonthlyFees(schoolId: string, now: Date) {
    const currentMonth = now.getMonth() + 1; // 1-12

    // Quarterly: generate in months 1, 4, 7, 10
    const isQuarterStart = [1, 4, 7, 10].includes(currentMonth);
    // Annual: generate in April (month 4) or whatever the school year start is
    const isAnnualMonth = currentMonth === 4;

    const frequencies: string[] = [];
    if (isQuarterStart) frequencies.push('quarterly');
    if (isAnnualMonth) frequencies.push('annually');
    // one_time fees are never auto-generated — they're manual

    if (frequencies.length === 0) return;

    // Fetch relevant recurring discounts
    const { data: discounts } = await supabase
      .from('fee_discounts')
      .select('student_id, amount, reason, type')
      .eq('school_id', schoolId)
      .in('type', frequencies)
      .is('fee_payment_id', null);

    const discountMap = new Map<string, any>();
    discounts?.forEach(d => {
      const key = `${d.student_id}_${d.type}`;
      discountMap.set(key, {
        amount: (discountMap.get(key)?.amount || 0) + Number(d.amount),
        reason: d.reason
      });
    });

    const { data: exemptions } = await supabase
      .from('fee_exemptions')
      .select('student_id, fee_structure_id')
      .eq('school_id', schoolId);

    const exemptionMap = new Map<string, Set<string>>();
    exemptions?.forEach(e => {
      if (!exemptionMap.has(e.student_id)) {
        exemptionMap.set(e.student_id, new Set());
      }
      exemptionMap.get(e.student_id)?.add(e.fee_structure_id);
    });

    for (const freq of frequencies) {
      const { data: structures } = await supabase
        .from('fee_structures')
        .select('id, class_id, name, amount, due_day, academic_year_id, transport_route_id, applies_to')
        .eq('school_id', schoolId)
        .eq('frequency', freq);

      if (!structures || structures.length === 0) continue;

      const monthLabel = format(now, 'MMMM yyyy');

      for (const structure of structures) {
        let students: Array<{ id: string }> | null = null;
        if (structure.applies_to === 'transport_route' && structure.transport_route_id) {
          const { data } = await supabase
            .from('students')
            .select('id')
            .eq('school_id', schoolId)
            .eq('is_active', true)
            .eq('transport_route_id', structure.transport_route_id);
          students = data;
        } else if (structure.applies_to === 'class' || structure.class_id) {
          const { data } = await supabase
            .from('students')
            .select('id, section:sections!inner(class_id)')
            .eq('school_id', schoolId)
            .eq('is_active', true)
            .eq('sections.class_id', structure.class_id);
          students = data;
        } else {
          const { data } = await supabase
            .from('students')
            .select('id')
            .eq('school_id', schoolId)
            .eq('is_active', true);
          students = data;
        }

        if (!students || students.length === 0) continue;

        const dueDay = Math.min(structure.due_day || 15, endOfMonth(now).getDate());
        const dueDate = `${format(now, 'yyyy-MM')}-${String(dueDay).padStart(2, '0')}`;

        // Check existing
        const { data: existing } = await supabase
          .from('fee_payments')
          .select('student_id')
          .eq('fee_structure_id', structure.id)
          .gte('created_at', format(startOfMonth(now), 'yyyy-MM-dd'))
          .lte('created_at', format(endOfMonth(now), 'yyyy-MM-dd'));

        const existingIds = new Set(existing?.map(p => p.student_id) || []);

        const newPayments = students
          .filter(s => !existingIds.has(s.id))
          .filter(s => {
            const exemptedStructureIds = exemptionMap.get(s.id);
            return !exemptedStructureIds || !exemptedStructureIds.has(structure.id);
          })
          .map(s => {
            const discKey = `${s.id}_${freq}`;
            const disc = discountMap.get(discKey) || { amount: 0, reason: '' };
            const discountAmt = Math.min(structure.amount, disc.amount);
            const expected = Math.max(0, structure.amount - discountAmt);

            let remarks = `Auto-generated ${freq} fee for ${monthLabel}`;
            if (discountAmt > 0) {
              remarks += ` | Discount Applied: ₹${discountAmt} (${disc.reason || 'recurring'})`;
            }

            return {
              school_id: schoolId,
              student_id: s.id,
              fee_structure_id: structure.id,
              academic_year_id: structure.academic_year_id || null,
              transport_route_id: structure.applies_to === 'transport_route' ? structure.transport_route_id : null,
              title: `${structure.name} - ${monthLabel}`,
              amount: structure.amount,
              discount_amount: discountAmt,
              paid_amount: 0,
              status: expected === 0 ? 'paid' : 'pending',
              payment_method: 'unpaid',
              due_date: dueDate,
              late_fee: 0,
              remarks: remarks,
            };
          });

        if (newPayments.length > 0) {
          const chunkResult = await this.insertFeePaymentsInChunks(newPayments);
          const insertedPayments = chunkResult.inserted;
          if (insertedPayments.length === 0) {
            console.error(`[FEE-GEN] Failed to create ${freq} payments:`, chunkResult.errors.join('; '));
          } else {
            console.log(`[FEE-GEN] Created ${insertedPayments.length} ${freq} payments for "${structure.name}"`);

            const discountTrackInserts: any[] = [];
            for (const p of insertedPayments || []) {
              if (p.discount_amount > 0) {
                const discKey = `${p.student_id}_${freq}`;
                const originalDisc = discountMap.get(discKey);
                discountTrackInserts.push({
                  school_id: schoolId,
                  student_id: p.student_id,
                  fee_payment_id: p.id,
                  type: freq,
                  amount: p.discount_amount,
                  reason: `Auto-deducted: ${originalDisc?.reason || `${freq} recurring discount`}`,
                });
              }
            }
            if (discountTrackInserts.length > 0) {
              await supabase.from('fee_discounts').insert(discountTrackInserts);
            }
          }
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // MARK OVERDUE FEES
  // Runs on the 1st — any fee from previous months still pending → overdue
  // ════════════════════════════════════════════════════════════
  async markOverdueFees() {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('fee_payments')
        .update({ status: 'overdue' })
        .eq('status', 'pending')
        .lt('created_at', today)
        .select('id');

      if (error) {
        console.error('[OVERDUE] Error:', error.message);
      } else {
        console.log(`[OVERDUE] Marked ${data?.length || 0} payments as overdue`);
      }
    } catch (error: any) {
      console.error('[OVERDUE] Fatal:', error.message);
    }
  }

  // ════════════════════════════════════════════════════════════
  // SCHEDULED FEE REMINDERS: 7d before, 3d before, due date, 5/10/30 days overdue
  // ════════════════════════════════════════════════════════════
  async runScheduledFeeReminders() {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    const { data: schools } = await supabase.from('schools').select('id, name');
    for (const school of schools || []) {
      const { data: pendingFees } = await supabase
        .from('fee_payments')
        .select(`
          id, amount, paid_amount, status, due_date, created_at,
          student:students(id, user:users(id, first_name, last_name, email, phone))
        `)
        .eq('school_id', school.id)
        .in('status', ['pending', 'overdue']);

      if (!pendingFees || pendingFees.length === 0) continue;

      // #2 OPTIMIZATION: Batch-fetch ALL parent links for this school in one query
      const studentIds = [...new Set(pendingFees.map((f: any) => f.student?.id).filter(Boolean))];
      const { data: allParentLinks } = await supabase
        .from('parent_students')
        .select('student_id, parent:parents(user:users(id, email, phone))')
        .in('student_id', studentIds);

      // Build a lookup map: studentId → parent user
      const parentByStudentId = new Map<string, any>();
      for (const link of allParentLinks || []) {
        if (!parentByStudentId.has(link.student_id)) {
          parentByStudentId.set(link.student_id, (link as any).parent?.user || null);
        }
      }

      for (const fee of pendingFees || []) {
        const dueDateStr = fee.due_date || format(endOfMonth(new Date(fee.created_at)), 'yyyy-MM-dd');
        const daysUntilDue = differenceInCalendarDays(parseISO(dueDateStr), today);
        const daysOverdue = daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0;

        let reminderType: string | null = null;
        if (daysUntilDue === 7) reminderType = '7_days_before';
        else if (daysUntilDue === 3) reminderType = '3_days_before';
        else if (daysUntilDue === 0) reminderType = 'due_date';
        else if (daysOverdue === 5) reminderType = '5_days_overdue';
        else if (daysOverdue === 10) reminderType = '10_days_overdue';
        else if (daysOverdue === 30) reminderType = '30_days_overdue';

        if (!reminderType) continue;

        const { data: alreadySent } = await supabase
          .from('fee_reminder_log')
          .select('id')
          .eq('fee_payment_id', fee.id)
          .eq('reminder_type', reminderType)
          .maybeSingle();

        if (alreadySent) continue;

        const sUser = (fee as any).student?.user;
        if (!sUser) continue;
        const studentName = `${sUser.first_name} ${sUser.last_name || ''}`;
        const studentId = (fee as any).student?.id;
        const balance = Number(fee.amount) - Number(fee.paid_amount || 0);

        // Use the pre-fetched map — no extra DB call per student
        const pUser = parentByStudentId.get(studentId) || null;
        const recipients = [
          { userId: sUser.id, email: sUser.email, phone: sUser.phone, label: 'student' },
          ...(pUser ? [{ userId: pUser.id, email: pUser.email, phone: pUser.phone, label: 'parent' }] : []),
        ];

        const titleMap: Record<string, string> = {
          '7_days_before': 'Fee Due in 7 Days',
          '3_days_before': 'Fee Due in 3 Days',
          due_date: 'Fee Due Today',
          '5_days_overdue': 'Fee Overdue — 5 Days',
          '10_days_overdue': 'Fee Overdue — 10 Days',
          '30_days_overdue': 'Fee Overdue — 30 Days',
        };

        for (const r of recipients) {
          await notificationService.sendMultiChannel({
            schoolId: school.id,
            userId: r.userId,
            channels: ['email', 'whatsapp'],
            type: 'fee_reminder',
            title: titleMap[reminderType] || 'Fee Reminder',
            message: `${r.label === 'parent' ? 'Dear Parent, ' : ''}Fee of ₹${balance} for ${studentName} is ${reminderType.includes('overdue') ? 'overdue' : 'due'} (${format(parseISO(dueDateStr), 'MMM dd, yyyy')}). Pay at: ${process.env.FRONTEND_URL || 'https://kautix.in'}/fees`,
            emailAddress: r.email,
            phone: r.phone,
            sourceType: 'fee_reminder',
            sourceId: fee.id,
          });
        }

        await supabase.from('fee_reminder_log').insert({
          fee_payment_id: fee.id,
          reminder_type: reminderType,
        });
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // CHECK & SEND FEE REMINDERS (2 days before month-end)
  // ════════════════════════════════════════════════════════════
  async checkAndSendReminders(force = false) {
    const today = new Date();
    const lastDayOfMonth = endOfMonth(today);
    const reminderDay = subDays(lastDayOfMonth, 2);

    // Only run on the 2nd last day of the month, unless forced
    if (!force && format(today, 'yyyy-MM-dd') !== format(reminderDay, 'yyyy-MM-dd')) return;

    console.log('[REMINDER] Running monthly fee reminders...');

    const { data: schools } = await supabase.from('schools').select('id, name');

    for (const school of schools || []) {
      // Fetch all pending/overdue fees for this school
      const { data: pendingFees } = await supabase
        .from('fee_payments')
        .select(`
          id, amount, created_at,
          student:students(
            id,
            user:users(first_name, last_name)
          )
        `)
        .eq('school_id', school.id)
        .in('status', ['pending', 'overdue']);

      for (const fee of pendingFees || []) {
        const sUser = (fee as any).student?.user;
        if (!sUser) continue;
        const studentName = `${sUser.first_name} ${sUser.last_name || ''}`;
        const studentId = (fee as any).student?.id;

        // Find linked parent
        const { data: parentLink } = await supabase
          .from('parent_students')
          .select('parent:parents(user:users(id, email, phone))')
          .eq('student_id', studentId)
          .limit(1)
          .maybeSingle();

        const pUser = (parentLink as any)?.parent?.user;
        if (!pUser) continue;

        await notificationService.sendFeeReminder({
          schoolId: school.id,
          parentPhone: pUser.phone || '',
          parentEmail: pUser.email || '',
          parentUserId: pUser.id,
          studentName,
          amount: fee.amount,
          dueDate: format(lastDayOfMonth, 'MMM dd, yyyy'),
          paymentLink: `${process.env.FRONTEND_URL || 'https://kautix.in'}/fees`,
        });
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // END-OF-MONTH AUTO-RECEIPTS
  // Finds all fees paid this month and sends receipts to parents
  // who haven't received one yet (via notification_logs check).
  // ════════════════════════════════════════════════════════════
  async sendEndOfMonthReceipts() {
    try {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

      const { data: schools } = await supabase.from('schools').select('id');

      for (const school of schools || []) {
        // Get all fees paid this month
        const { data: paidFees } = await supabase
          .from('fee_payments')
          .select(`
            id, amount, paid_amount, payment_method, receipt_number, transaction_id, paid_date,
            student:students(
              id, roll_number,
              user:users(first_name, last_name)
            ),
            fee_structure:fee_structures(name)
          `)
          .eq('school_id', school.id)
          .eq('status', 'paid')
          .gte('paid_date', monthStart)
          .lte('paid_date', monthEnd);

        if (!paidFees || paidFees.length === 0) continue;

        // Check which receipts were already sent
        const { data: sentReceipts } = await supabase
          .from('notification_logs')
          .select('metadata')
          .eq('school_id', school.id)
          .eq('type', 'payment_receipt')
          .gte('sent_at', monthStart)
          .lte('sent_at', monthEnd);

        const sentPaymentIds = new Set(
          sentReceipts?.map(r => r.metadata?.fee_payment_id).filter(Boolean) || []
        );

        for (const fee of paidFees) {
          // Skip if receipt already sent
          if (sentPaymentIds.has(fee.id)) continue;

          const sUser = (fee as any).student?.user;
          if (!sUser) continue;
          const studentName = `${sUser.first_name} ${sUser.last_name || ''}`;
          const studentId = (fee as any).student?.id;

          // Find parent
          const { data: parentLink } = await supabase
            .from('parent_students')
            .select('parent:parents(user:users(id, email, phone))')
            .eq('student_id', studentId)
            .limit(1)
            .maybeSingle();

          const pUser = (parentLink as any)?.parent?.user;
          if (!pUser) continue;

          await notificationService.sendPaymentReceipt({
            schoolId: school.id,
            parentEmail: pUser.email || '',
            parentPhone: pUser.phone || '',
            parentUserId: pUser.id,
            studentName,
            rollNumber: (fee as any).student?.roll_number,
            amount: fee.paid_amount || fee.amount,
            receiptNumber: fee.receipt_number || `RCP-${fee.id.substring(0, 8).toUpperCase()}`,
            paymentMethod: fee.payment_method || 'Online',
            transactionId: fee.transaction_id || fee.id,
            date: fee.paid_date ? format(new Date(fee.paid_date), 'MMM dd, yyyy') : format(now, 'MMM dd, yyyy'),
          });

          console.log(`[RECEIPT] Sent receipt for payment ${fee.id} → ${pUser.email}`);
        }
      }

      console.log('[RECEIPT] End-of-month receipt dispatch complete.');
    } catch (error: any) {
      console.error('[RECEIPT] Fatal error:', error.message);
    }
  }

  // ════════════════════════════════════════════════════════════
  // PAYMENT SUCCESS HANDLER (called after Razorpay/manual pay)
  // ════════════════════════════════════════════════════════════
  async handlePaymentSuccess(paymentId: string, transactionId: string, method: string) {
    const { data: currentFee } = await supabase
      .from('fee_payments')
      .select('amount')
      .eq('id', paymentId)
      .single();

    if (!currentFee) return;

    const { data: fee, error } = await supabase
      .from('fee_payments')
      .update({
        status: 'paid',
        paid_amount: currentFee.amount,
        transaction_id: transactionId,
        payment_method: method,
        paid_date: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .select('*, student:students(id, roll_number, user:users(first_name, last_name))')
      .single();

    if (error || !fee) return;

    // Find parent and send receipt immediately
    const studentId = (fee as any).student?.id;
    const sUser = (fee as any).student?.user;
    if (!studentId || !sUser) return;

    const { data: parentLink } = await supabase
      .from('parent_students')
      .select('parent:parents(user:users(id, email, phone))')
      .eq('student_id', studentId)
      .limit(1)
      .maybeSingle();

    const pUser = (parentLink as any)?.parent?.user;
    if (!pUser) return;

    await notificationService.sendPaymentReceipt({
      schoolId: fee.school_id,
      parentEmail: pUser.email,
      parentPhone: pUser.phone || '',
      parentUserId: pUser.id,
      studentName: `${sUser.first_name} ${sUser.last_name || ''}`,
      rollNumber: (fee as any).student?.roll_number,
      amount: currentFee.amount,
      receiptNumber: `REC-${paymentId.split('-')[0].toUpperCase()}`,
      paymentMethod: method,
      transactionId,
      date: format(new Date(), 'MMM dd, yyyy'),
    });
  }

  // ════════════════════════════════════════════════════════════
  // MONTHLY PROGRESS REPORTS (with REAL data)
  // ════════════════════════════════════════════════════════════
  async sendMonthlyProgressReports() {
    console.log('[REPORT] Starting Monthly Progress Reports...');
    const now = new Date();
    const monthName = format(now, 'MMMM yyyy');
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const { data: students } = await supabase
      .from('students')
      .select(`
        id, school_id,
        user:users(first_name, last_name)
      `)
      .eq('is_active', true);

    for (const student of students || []) {
      const sUser = (student as any).user;
      if (!sUser) continue;
      const studentName = `${sUser.first_name} ${sUser.last_name || ''}`;

      // --- REAL attendance data ---
      const { data: attendance } = await supabase
        .from('attendance')
        .select('status')
        .eq('student_id', student.id)
        .gte('date', monthStart)
        .lte('date', monthEnd);

      const totalDays = attendance?.length || 0;
      const presentDays = attendance?.filter((a: any) => a.status === 'present').length || 0;
      const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

      // --- REAL exam data ---
      const { data: examResults } = await supabase
        .from('exam_results')
        .select('marks_obtained, grade, exam:exams(total_marks, subject:subjects(name))')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false })
        .limit(10);

      let avgGrade = 'N/A';
      const topSubjects: string[] = [];
      if (examResults && examResults.length > 0) {
        const totalPct = examResults.reduce((sum, r) => {
          const total = (r.exam as any)?.total_marks || 100;
          return sum + (Number(r.marks_obtained) / total) * 100;
        }, 0);
        const avgPct = totalPct / examResults.length;
        avgGrade = avgPct >= 90 ? 'A+' : avgPct >= 80 ? 'A' : avgPct >= 70 ? 'B+' : avgPct >= 60 ? 'B' : avgPct >= 50 ? 'C' : 'D';

        // Top subjects by score
        const subjectScores: Record<string, number[]> = {};
        examResults.forEach(r => {
          const subName = (r.exam as any)?.subject?.name || 'Unknown';
          if (!subjectScores[subName]) subjectScores[subName] = [];
          subjectScores[subName].push(Number(r.marks_obtained) / ((r.exam as any)?.total_marks || 100) * 100);
        });
        const sorted = Object.entries(subjectScores)
          .map(([name, scores]) => ({ name, avg: scores.reduce((a, b) => a + b, 0) / scores.length }))
          .sort((a, b) => b.avg - a.avg);
        topSubjects.push(...sorted.slice(0, 3).map(s => s.name));
      }

      // --- REAL fee data ---
      const { data: fees } = await supabase
        .from('fee_payments')
        .select('amount, paid_amount, status, paid_date')
        .eq('student_id', student.id)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const totalPaid = fees?.filter(f => f.status === 'paid').reduce((sum, f) => sum + Number(f.paid_amount || 0), 0) || 0;
      const totalPending = fees?.filter(f => f.status !== 'paid').reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;
      const lastPaidFee = fees?.filter(f => f.paid_date).sort((a, b) => new Date(b.paid_date).getTime() - new Date(a.paid_date).getTime())[0];

      // --- Find parent ---
      const { data: parentLink } = await supabase
        .from('parent_students')
        .select('parent:parents(user:users(id, email, phone))')
        .eq('student_id', student.id)
        .limit(1)
        .maybeSingle();

      const pUser = (parentLink as any)?.parent?.user;
      if (!pUser) continue;

      await notificationService.sendMonthlyReport({
        schoolId: student.school_id,
        parentPhone: pUser.phone || '',
        parentEmail: pUser.email || '',
        parentUserId: pUser.id,
        studentName,
        month: monthName,
        paymentSummary: {
          totalPaid,
          pending: totalPending,
          lastPaymentDate: lastPaidFee?.paid_date ? format(new Date(lastPaidFee.paid_date), 'MMM dd, yyyy') : undefined,
        },
        performanceSummary: {
          avgGrade,
          attendanceRate,
          topSubjects: topSubjects.length > 0 ? topSubjects : ['No exam data yet'],
        },
      });
    }

    console.log('[REPORT] ✅ Monthly Progress Reports Sent.');
  }

  // ════════════════════════════════════════════════════════════
  // ADMIN DAILY FEE DIGEST
  // Runs every morning at 8 AM — sends each school's admin(s)
  // a school → section breakdown of: pending, overdue, and
  // payments collected today.
  // ════════════════════════════════════════════════════════════
  async sendAdminFeeDigest() {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data: schools } = await supabase.from('schools').select('id, name');
      for (const school of schools || []) {
        // Get all admins for this school
        const { data: admins } = await supabase
          .from('users')
          .select('id, email, first_name')
          .eq('school_id', school.id)
          .eq('role', 'admin')
          .eq('is_active', true);

        if (!admins || admins.length === 0) continue;

        // Get pending + overdue fees grouped by class/section
        const { data: pendingFees } = await supabase
          .from('fee_payments')
          .select(`
            id, amount, paid_amount, status,
            student:students(
              id,
              section:sections(name, class:classes(name))
            )
          `)
          .eq('school_id', school.id)
          .in('status', ['pending', 'overdue']);

        // Get payments collected today
        const { data: todayPayments } = await supabase
          .from('fee_payments')
          .select('amount, paid_amount')
          .eq('school_id', school.id)
          .eq('status', 'paid')
          .gte('paid_date', today)
          .lte('paid_date', `${today}T23:59:59`);

        const todayCollected = todayPayments?.reduce((sum, f) => sum + Number(f.paid_amount || 0), 0) || 0;
        const totalPending = pendingFees?.filter(f => f.status === 'pending').length || 0;
        const totalOverdue = pendingFees?.filter(f => f.status === 'overdue').length || 0;
        const overdueAmount = pendingFees
          ?.filter(f => f.status === 'overdue')
          .reduce((sum, f) => sum + (Number(f.amount) - Number(f.paid_amount || 0)), 0) || 0;

        // Build section-wise breakdown
        const sectionMap: Record<string, { pending: number; overdue: number; amount: number }> = {};
        for (const fee of pendingFees || []) {
          const sectionName = (fee as any).student?.section?.name;
          const className = (fee as any).student?.section?.class?.name;
          const key = className && sectionName ? `${className} - ${sectionName}` : 'Unassigned';
          if (!sectionMap[key]) sectionMap[key] = { pending: 0, overdue: 0, amount: 0 };
          if (fee.status === 'pending') sectionMap[key].pending++;
          if (fee.status === 'overdue') sectionMap[key].overdue++;
          sectionMap[key].amount += Number(fee.amount) - Number(fee.paid_amount || 0);
        }

        const sectionRows = Object.entries(sectionMap)
          .map(([section, data]) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${section}</td><td style="padding:6px 12px;text-align:center;border-bottom:1px solid #f1f5f9;color:#f59e0b">${data.pending}</td><td style="padding:6px 12px;text-align:center;border-bottom:1px solid #f1f5f9;color:#ef4444">${data.overdue}</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f1f5f9">₹${data.amount.toLocaleString()}</td></tr>`)
          .join('');

        const htmlContent = `
<div style="font-family:Inter,sans-serif;max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px;color:#fff">
    <h1 style="margin:0;font-size:20px;font-weight:800">Daily Fee Digest</h1>
    <p style="margin:6px 0 0;opacity:.8;font-size:13px">${school.name} • ${format(new Date(), 'EEEE, MMM dd yyyy')}</p>
  </div>
  <div style="padding:24px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
    <div style="background:#f0fdf4;border-radius:12px;padding:16px;text-align:center">
      <p style="font-size:11px;color:#16a34a;font-weight:700;text-transform:uppercase;margin:0">Collected Today</p>
      <p style="font-size:24px;font-weight:900;color:#16a34a;margin:8px 0 0">₹${todayCollected.toLocaleString()}</p>
    </div>
    <div style="background:#fffbeb;border-radius:12px;padding:16px;text-align:center">
      <p style="font-size:11px;color:#d97706;font-weight:700;text-transform:uppercase;margin:0">Pending Dues</p>
      <p style="font-size:24px;font-weight:900;color:#d97706;margin:8px 0 0">${totalPending} students</p>
    </div>
    <div style="background:#fef2f2;border-radius:12px;padding:16px;text-align:center">
      <p style="font-size:11px;color:#dc2626;font-weight:700;text-transform:uppercase;margin:0">Overdue (₹)</p>
      <p style="font-size:24px;font-weight:900;color:#dc2626;margin:8px 0 0">₹${overdueAmount.toLocaleString()}</p>
    </div>
  </div>
  <div style="padding:0 24px 24px">
    <h3 style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px">Section-wise Breakdown</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Section</th><th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Pending</th><th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Overdue</th><th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Amt Due</th></tr></thead>
      <tbody>${sectionRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af">No pending fees today 🎉</td></tr>'}</tbody>
    </table>
  </div>
  <div style="background:#f8fafc;padding:16px 24px;text-align:center">
    <a href="${process.env.FRONTEND_URL || 'https://kautix.in'}/fees" style="background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">View Full Ledger →</a>
  </div>
</div>`;

        // Notify all admins
        for (const admin of admins) {
          await notificationService.sendMultiChannel({
            schoolId: school.id,
            userId: admin.id,
            channels: ['email'],
            type: 'admin_fee_digest',
            title: `Daily Fee Digest — ${school.name}`,
            message: `Today's collection: ₹${todayCollected.toLocaleString()} | Pending: ${totalPending} students | Overdue: ₹${overdueAmount.toLocaleString()}`,
            emailAddress: admin.email,
            htmlContent,
          });

          // Also create in-app notification
          await notificationService.createInAppNotification({
            schoolId: school.id,
            userId: admin.id,
            type: 'admin_fee_digest',
            title: 'Daily Fee Digest',
            message: `Today: ₹${todayCollected.toLocaleString()} collected | ${totalPending} pending | ${totalOverdue} overdue across ${Object.keys(sectionMap).length} sections`,
          });
        }

        console.log(`[DIGEST] Sent admin fee digest for ${school.name} to ${admins.length} admin(s)`);
      }
    } catch (error: any) {
      console.error('[DIGEST] Fatal error:', error.message);
    }
  }

  // ════════════════════════════════════════════════════════════
  // PAYROLL PENDING REMINDERS
  // Runs daily — reminds school admin about unpaid teacher payroll
  // and sends each teacher a personal in-app notification about
  // their pending salary status.
  // ════════════════════════════════════════════════════════════
  async sendPayrollPendingReminders() {
    try {
      const { data: schools } = await supabase.from('schools').select('id, name');
      for (const school of schools || []) {
        // Get pending payroll entries
        const { data: pendingPayroll } = await supabase
          .from('teacher_payroll')
          .select('*, teacher:users(id, first_name, last_name, email, phone)')
          .eq('school_id', school.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (!pendingPayroll || pendingPayroll.length === 0) continue;

        const totalDue = pendingPayroll.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

        // Notify each teacher about their pending salary
        for (const entry of pendingPayroll) {
          const teacher = (entry as any).teacher;
          if (!teacher) continue;

          await notificationService.createInAppNotification({
            schoolId: school.id,
            userId: teacher.id,
            type: 'payroll_pending',
            title: 'Salary Pending',
            message: `Your salary of ₹${Number(entry.amount).toLocaleString()} for ${entry.month} ${entry.year} is pending. Contact admin if you have queries.`,
            sourceType: 'teacher_payroll',
            sourceId: entry.id,
          });
        }

        // Notify admins with aggregate summary
        const { data: admins } = await supabase
          .from('users')
          .select('id, email, first_name')
          .eq('school_id', school.id)
          .eq('role', 'admin')
          .eq('is_active', true);

        for (const admin of admins || []) {
          const teacherNames = pendingPayroll
            .slice(0, 5)
            .map((p: any) => `${p.teacher?.first_name} ${p.teacher?.last_name || ''}`)
            .join(', ');

          await notificationService.createInAppNotification({
            schoolId: school.id,
            userId: admin.id,
            type: 'payroll_reminder',
            title: 'Payroll Alert',
            message: `${pendingPayroll.length} teacher(s) have unpaid salaries totalling ₹${totalDue.toLocaleString()}. Staff: ${teacherNames}${pendingPayroll.length > 5 ? '...' : ''}`,
            sourceType: 'teacher_payroll',
          });

          // Send email to admin
          await notificationService.sendMultiChannel({
            schoolId: school.id,
            userId: admin.id,
            channels: ['email'],
            type: 'payroll_reminder',
            title: `Payroll Alert — ${pendingPayroll.length} Pending Salaries`,
            message: `${pendingPayroll.length} teacher(s) have pending salaries totalling ₹${totalDue.toLocaleString()}`,
            emailAddress: admin.email,
            htmlContent: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto"><div style="background:linear-gradient(135deg,#1e3a5f,#7c3aed);padding:32px;border-radius:16px 16px 0 0;color:#fff"><h1 style="margin:0;font-size:20px;font-weight:800">Payroll Alert</h1><p style="margin:6px 0 0;opacity:.8">${school.name} • ${format(new Date(), 'MMM dd, yyyy')}</p></div><div style="padding:24px;background:#fff;border-radius:0 0 16px 16px"><p style="font-size:16px;font-weight:700;color:#1f2937">${pendingPayroll.length} teacher(s) have not been paid this cycle.</p><p style="color:#6b7280;font-size:14px">Total outstanding: <strong style="color:#7c3aed">₹${totalDue.toLocaleString()}</strong></p><ul style="color:#374151;font-size:14px">${pendingPayroll.map((p: any) => `<li style="margin-bottom:6px">${p.teacher?.first_name} ${p.teacher?.last_name || ''} — ₹${Number(p.amount).toLocaleString()} (${p.month} ${p.year})</li>`).join('')}</ul><a href="${process.env.FRONTEND_URL || 'https://kautix.in'}/payroll" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">Process Payroll →</a></div></div>`,
          });
        }

        console.log(`[PAYROLL-REMINDER] Notified ${pendingPayroll.length} teachers and ${admins?.length || 0} admin(s) at ${school.name}`);
      }
    } catch (error: any) {
      console.error('[PAYROLL-REMINDER] Fatal error:', error.message);
    }
  }
}

export const feesAutomation = new FeesAutomationService();

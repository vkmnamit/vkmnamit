import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';
import { paymentService } from '../services/payment.service';

// ──────────────────────────────────────────────────────────────────
// 1. Payroll History  (admin sees all; teacher sees own)
// ──────────────────────────────────────────────────────────────────
export const getPayrollHistory = async (req: Request, res: Response) => {
  const { school_id, role, id: userId } = (req as any).user;
  const { teacher_id } = req.query;

  let query = supabase
    .from('teacher_payroll')
    .select('*, teacher:users(id, first_name, last_name, email)')
    .eq('school_id', school_id);

  // Teachers can only see their own payslips
  if (role === 'teacher') {
    query = query.eq('teacher_id', userId);
  } else if (teacher_id) {
    // Profile routes use the teachers table ID, while payroll belongs to the
    // linked users record. Resolve it inside the current school before filtering.
    const { data: teacher } = await supabase
      .from('teachers')
      .select('user_id')
      .eq('id', teacher_id as string)
      .eq('school_id', school_id)
      .maybeSingle();

    query = query.eq('teacher_id', teacher?.user_id || (teacher_id as string));
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

// ──────────────────────────────────────────────────────────────────
// 2. Create single payroll entry
// ──────────────────────────────────────────────────────────────────
export const createPayrollEntry = async (req: Request, res: Response) => {
  const { school_id } = (req as any).user;
  const { teacher_id, amount, month, year, status = 'pending' } = req.body;

  const { data, error } = await supabase
    .from('teacher_payroll')
    .insert([{ school_id, teacher_id, amount, month, year, status, created_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

// ──────────────────────────────────────────────────────────────────
// 3. Pay a teacher (admin only)
// ──────────────────────────────────────────────────────────────────
export const payTeacher = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { school_id, id: userId } = (req as any).user;
  const { accountNumber, paymentMethod } = req.body; // accountNumber from old frontend structure will hold the payment method

  const { data: payroll, error: fetchError } = await supabase
    .from('teacher_payroll')
    .select('*, teacher:users(*)')
    .eq('id', id)
    .eq('school_id', school_id)
    .single();

  if (fetchError || !payroll) return res.status(404).json({ error: 'Payroll record not found' });

  const method = paymentMethod || accountNumber || 'cash';
  const transactionId = `PAY-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  const { data, error } = await supabase
    .from('teacher_payroll')
    .update({ 
      status: 'paid', 
      paid_at: new Date().toISOString() 
    })
    .eq('id', id)
    .eq('school_id', school_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Notify the teacher their salary has been processed
  try {
    const month = payroll.month ? `${payroll.month} ${payroll.year}` : 'this month';
    await supabase.from('notifications').insert([{
      school_id: payroll.school_id,
      user_id: payroll.teacher_id,
      title: '💰 Salary Disbursed',
      message: `Your salary of ₹${Number(payroll.amount).toLocaleString()} for ${month} has been successfully processed. Transaction ID: ${transactionId}`,
      type: 'payroll',
      is_read: false,
      created_at: new Date().toISOString()
    }]);
  } catch { /* non-critical */ }

  // Keep a school-scoped record of this financial operation for administrators.
  await supabase.from('audit_logs').insert({
    school_id,
    user_id: userId,
    action: 'teacher_payroll_paid',
    entity_type: 'teacher_payroll',
    entity_id: id,
    new_data: { teacher_id: payroll.teacher_id, amount: payroll.amount, transaction_id: transactionId }
  });

  res.json({ ...data });
};

// ──────────────────────────────────────────────────────────────────
// 4. Payroll Structures CRUD
// ──────────────────────────────────────────────────────────────────
export const getPayrollStructures = async (req: Request, res: Response) => {
  try {
    const { school_id } = (req as any).user;
    const { data, error } = await supabase
      .from('payroll_structures')
      .select('*')
      .eq('school_id', school_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch payroll structures' });
  }
};

export const createPayrollStructure = async (req: Request, res: Response) => {
  try {
    const { school_id } = (req as any).user;
    const { name, amount, frequency = 'monthly' } = req.body;

    const { data, error } = await supabase
      .from('payroll_structures')
      .insert([{ school_id, name, amount, frequency }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create payroll structure' });
  }
};

export const updatePayrollStructure = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { school_id } = (req as any).user;
    const updates = req.body;

    const { data, error } = await supabase
      .from('payroll_structures')
      .update(updates)
      .eq('id', id)
      .eq('school_id', school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update payroll structure' });
  }
};

export const deletePayrollStructure = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { school_id } = (req as any).user;

    const { error } = await supabase
      .from('payroll_structures')
      .delete()
      .eq('id', id)
      .eq('school_id', school_id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Payroll structure deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete payroll structure' });
  }
};

// ──────────────────────────────────────────────────────────────────
// 5. Assign structure to a teacher (updates teachers.salary + stores structure reference)
// ──────────────────────────────────────────────────────────────────
export const assignStructureToTeacher = async (req: Request, res: Response) => {
  try {
    const { school_id } = (req as any).user;
    const { teacherId, structureId } = req.body;

    // Get structure amount
    const { data: structure, error: sErr } = await supabase
      .from('payroll_structures')
      .select('amount, name')
      .eq('id', structureId)
      .eq('school_id', school_id)
      .single();

    if (sErr || !structure) return res.status(404).json({ error: 'Structure not found' });

    // Update teacher salary + designation + store which structure is assigned
    const { error: tErr } = await supabase
      .from('teachers')
      .update({ salary: structure.amount, payroll_structure_id: structureId, designation: structure.name })
      .eq('user_id', teacherId)
      .eq('school_id', school_id);

    if (tErr) {
      // If payroll_structure_id column doesn't exist, just update salary and designation
      await supabase
        .from('teachers')
        .update({ salary: structure.amount, designation: structure.name })
        .eq('user_id', teacherId)
        .eq('school_id', school_id);
    }

    res.json({ message: `Assigned ${structure.name} (₹${structure.amount}) to teacher` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to assign structure' });
  }
};

// ──────────────────────────────────────────────────────────────────
// 6. Get all staff (teachers) with their salary/structure info
// ──────────────────────────────────────────────────────────────────
export const getStaffForPayroll = async (req: Request, res: Response) => {
  try {
    const { school_id } = (req as any).user;

    const { data, error } = await supabase
      .from('teachers')
      .select('id, user_id, designation, department, salary, date_of_joining, is_class_teacher, user:users(id, first_name, last_name, email)')
      .eq('school_id', school_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
};

// ──────────────────────────────────────────────────────────────────
// 7. Bulk generate payslips (one per teacher based on their salary)
// ──────────────────────────────────────────────────────────────────
export const bulkAssignPayroll = async (req: Request, res: Response) => {
  try {
    const { school_id } = (req as any).user;
    const { teacherIds, structureId, month, year } = req.body;

    if (!teacherIds || teacherIds.length === 0 || !month || !year) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let assignments: any[] = [];

    if (structureId) {
      // Use a specific structure for all selected teachers
      const { data: structure, error: structError } = await supabase
        .from('payroll_structures')
        .select('amount')
        .eq('id', structureId)
        .eq('school_id', school_id)
        .single();

      if (structError || !structure) return res.status(404).json({ error: 'Payroll structure not found' });

      assignments = teacherIds.map((tid: string) => ({
        school_id, teacher_id: tid, payroll_structure_id: structureId,
        amount: structure.amount, month, year, status: 'pending'
      }));
    } else {
      // Use each teacher's own salary from their teacher record
      const { data: teachers, error: tErr } = await supabase
        .from('teachers')
        .select('user_id, salary')
        .eq('school_id', school_id)
        .in('user_id', teacherIds);

      if (tErr) return res.status(400).json({ error: tErr.message });

      assignments = (teachers || [])
        .filter(t => t.salary && t.salary > 0)
        .map(t => ({
          school_id, teacher_id: t.user_id,
          amount: t.salary, month, year, status: 'pending'
        }));
    }

    if (assignments.length === 0) {
      return res.status(400).json({ error: 'No teachers with salary data found. Assign a salary structure first.' });
    }

    const { data, error } = await supabase
      .from('teacher_payroll')
      .insert(assignments)
      .select();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ message: `Generated ${data.length} payslips`, data });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to bulk assign payroll' });
  }
};

// ──────────────────────────────────────────────────────────────────
// 8. Notify admin and teachers about monthly salary due
// ──────────────────────────────────────────────────────────────────
export const notifyMonthlySalaryDue = async (req: Request, res: Response) => {
  try {
    const { school_id, id: requesterId } = (req as any).user;
    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const currentYear = now.getFullYear().toString();

    // Get pending payslips for current month
    const { data: pending, error: pErr } = await supabase
      .from('teacher_payroll')
      .select('id, amount, teacher_id, teacher:users(first_name, last_name)')
      .eq('school_id', school_id)
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .eq('status', 'pending');

    if (pErr) return res.status(400).json({ error: pErr.message });

    if (!pending || pending.length === 0) {
      return res.json({ message: 'No pending salaries for this month', count: 0 });
    }

    const totalOwed = pending.reduce((s: number, p: any) => s + Number(p.amount), 0);
    const teacherNames = pending.map((p: any) => `${(p as any).teacher?.first_name} ${(p as any).teacher?.last_name}`).join(', ');

    // Notify all admins in the school
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('school_id', school_id)
      .eq('role', 'admin');

    const adminNotifs = (admins || []).map((a: any) => ({
      school_id,
      user_id: a.id,
      title: `📋 ${pending.length} Salaries Pending — ${currentMonth} ${currentYear}`,
      message: `Total outstanding: ₹${totalOwed.toLocaleString()}. Staff pending payment: ${teacherNames}. Please clear salaries from Payroll Management.`,
      type: 'payroll',
      is_read: false,
      created_at: new Date().toISOString()
    }));

    if (adminNotifs.length > 0) {
      await supabase.from('notifications').insert(adminNotifs);
    }

    // Notify each pending teacher
    const teacherNotifs = pending.map((p: any) => ({
      school_id,
      user_id: p.teacher_id,
      title: `⏳ Salary Pending — ${currentMonth} ${currentYear}`,
      message: `Your salary of ₹${Number(p.amount).toLocaleString()} for ${currentMonth} ${currentYear} is pending disbursement. It will be cleared shortly.`,
      type: 'payroll',
      is_read: false,
      created_at: new Date().toISOString()
    }));

    if (teacherNotifs.length > 0) {
      await supabase.from('notifications').insert(teacherNotifs);
    }

    res.json({
      message: `Notified admins and ${pending.length} teacher(s) about pending salaries`,
      count: pending.length,
      totalOwed
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to send notifications' });
  }
};

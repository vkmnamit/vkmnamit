import { Response } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export async function getExpenses(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabase
      .from('school_expenses')
      .select('*')
      .eq('school_id', req.user!.school_id)
      .order('date', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch expenses' });
  }
}

export async function createExpense(req: AuthenticatedRequest, res: Response) {
  try {
    const { title, amount, category, date, paymentMethod, remarks } = req.body;

    const { data, error } = await supabase
      .from('school_expenses')
      .insert({
        school_id: req.user!.school_id,
        title,
        amount,
        category,
        date: date || new Date().toISOString().split('T')[0],
        payment_method: paymentMethod || 'cash',
        remarks
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create expense' });
  }
}

export async function getFinancialSummary(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;

    // 1. Get total fees collected
    const { data: fees } = await supabase
      .from('fee_payments')
      .select('paid_amount')
      .eq('school_id', schoolId)
      .eq('status', 'paid');
    
    const totalIncome = fees?.reduce((sum, f) => sum + Number(f.paid_amount || 0), 0) || 0;

    // 2. Get total expenses
    const { data: expenses } = await supabase
      .from('school_expenses')
      .select('amount')
      .eq('school_id', schoolId);
    
    const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

    // 3. Get total payroll (paid)
    const { data: payroll } = await supabase
      .from('teacher_payroll')
      .select('amount')
      .eq('school_id', schoolId)
      .eq('status', 'paid');
    
    const totalSalaries = payroll?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

    const profit = totalIncome - totalExpenses - totalSalaries;

    return res.json({
      income: totalIncome,
      expenses: totalExpenses,
      salaries: totalSalaries,
      profit,
      balance: totalIncome - totalExpenses - totalSalaries
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
}

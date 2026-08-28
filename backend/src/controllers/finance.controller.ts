import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

// Get comprehensive financial summary
export async function getFinancialSummary(req: AuthenticatedRequest, res: Response) {
  try {
    const schoolId = req.user!.school_id;

    // 1. Get total fee collections
    const { data: fees } = await supabaseAdmin
      .from('fee_payments')
      .select('paid_amount')
      .eq('school_id', schoolId)
      .eq('status', 'paid');
    
    const income = fees?.reduce((sum, f) => sum + Number(f.paid_amount || 0), 0) || 0;

    // 2. Get total teacher salaries (approximate from payroll or staff costs)
    // For now, let's look at payroll table if it exists, otherwise use a placeholder
    const { data: payroll } = await supabaseAdmin
      .from('teacher_payroll')
      .select('amount')
      .eq('school_id', schoolId)
      .eq('status', 'paid');
    
    const salaries = payroll?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

    // 3. Get total institutional expenses
    const { data: expRecords } = await supabaseAdmin
      .from('school_expenses')
      .select('amount')
      .eq('school_id', schoolId);
    
    const expenses = expRecords?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

    const profit = income - salaries - expenses;

    return res.json({
      income,
      salaries,
      expenses,
      profit,
      period: 'Year-to-Date'
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
}

// Get all expenditures
export async function getExpenses(req: AuthenticatedRequest, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
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

// Record new expenditure
export async function createExpense(req: AuthenticatedRequest, res: Response) {
  try {
    const { title, amount, category, paymentMethod, remarks } = req.body;

    const { data, error } = await supabaseAdmin
      .from('school_expenses')
      .insert({
        school_id: req.user!.school_id,
        title,
        amount: Number(amount),
        category,
        payment_method: paymentMethod,
        remarks,
        date: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to record expense' });
  }
}

// Get AI Financial Insights
export async function getAIInsights(req: AuthenticatedRequest, res: Response) {
  try {
    // In a real production app, this would call an LLM with financial data
    // Here we generate a smart response based on the actual numbers
    const schoolId = req.user!.school_id;
    
    const { data: fees } = await supabaseAdmin.from('fee_payments').select('status').eq('school_id', schoolId);
    const total = fees?.length || 0;
    const paid = fees?.filter(f => f.status === 'paid').length || 0;
    const rate = total > 0 ? (paid / total) * 100 : 0;

    let insight = "Your institutional health score is strong. ";
    if (rate < 70) {
      insight += "Fee collection is below target (currently " + Math.round(rate) + "%). Recommendation: Automated WhatsApp reminders should be dispatched to overdue nodes.";
    } else {
      insight += "Revenue flow is stable at " + Math.round(rate) + "%. Suggestion: Consider allocating surplus to laboratory upgrades or teacher bonuses.";
    }

    return res.json({
      summary: insight,
      healthScore: Math.round(rate),
      risk: rate < 60 ? 'High' : (rate < 80 ? 'Medium' : 'Low')
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to generate AI insights' });
  }
}

import { supabaseAdmin } from '../config/supabase';
import { notificationService } from './notification.service';

class PaymentService {
  // Record a manual/offline fee payment (Razorpay removed per requirements)
  async processPayment(params: {
    feePaymentId: string;
    transactionId?: string;
    paymentMethod?: string;
    skipSignatureVerify?: boolean;
  }) {
    // Get fee payment details
    const { data: feePayment } = await supabaseAdmin
      .from('fee_payments')
      .select(`
        *,
        student:students(
          *,
          user:users(*),
          section:sections(*, class:classes(*))
        )
      `)
      .eq('id', params.feePaymentId)
      .single();

    if (!feePayment) {
      return { success: false, error: 'Fee payment not found' };
    }

    // Generate receipt number
    const { data: receiptData } = await supabaseAdmin
      .rpc('generate_receipt_number', { p_school_id: feePayment.school_id });

    const receiptNumber = receiptData || `RCP-${Date.now()}`;
    const transactionId = params.transactionId || `OFF-${Date.now()}`;
    const paymentMethod = params.paymentMethod || 'offline';

    // Update fee payment
    const { error: updateError } = await supabaseAdmin
      .from('fee_payments')
      .update({
        status: 'paid',
        paid_amount: feePayment.amount,
        paid_date: new Date().toISOString(),
        payment_method: paymentMethod,
        transaction_id: transactionId,
        receipt_number: receiptNumber,
      })
      .eq('id', params.feePaymentId);

    if (updateError) {
      console.error('[PAYMENT] Error updating fee payment:', updateError);
      return { success: false, error: 'Database update failed' };
    }

    // Record individual transaction in logbook
    await supabaseAdmin
      .from('fee_transactions')
      .insert({
        school_id: feePayment.school_id,
        fee_payment_id: params.feePaymentId,
        amount: feePayment.amount,
        payment_method: paymentMethod,
        transaction_id: transactionId,
        receipt_number: receiptNumber,
        remarks: `Payment (${paymentMethod})`
      });

    // Get parent details for notification
    const { data: parentLink } = await supabaseAdmin
      .from('parent_students')
      .select('parent:parents(*, user:users(*))')
      .eq('student_id', feePayment.student_id)
      .limit(1)
      .single();

    // Send receipt via WhatsApp and Email
    if (parentLink && (parentLink as any).parent && (parentLink as any).parent.user) {
      const parent = (parentLink as any).parent;
      await notificationService.sendPaymentReceipt({
        schoolId: feePayment.school_id,
        parentEmail: parent.user.email,
        parentPhone: parent.user.phone || '',
        parentUserId: parent.user.id,
        studentName: feePayment.student?.user?.first_name + ' ' + (feePayment.student?.user?.last_name || ''),
        rollNumber: feePayment.student?.roll_number,
        amount: feePayment.amount,
        receiptNumber,
        paymentMethod,
        transactionId,
        date: new Date().toLocaleDateString('en-IN'),
      });
    }

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      school_id: feePayment.school_id,
      action: 'payment_received',
      entity_type: 'fee_payment',
      entity_id: params.feePaymentId,
      new_data: {
        amount: feePayment.amount,
        payment_id: transactionId,
        receipt_number: receiptNumber,
      },
    });

    return {
      success: true,
      receiptNumber,
      amount: feePayment.amount,
    };
  }

  // Create payout (simplified — no external gateway)
  async createPayout(params: {
    teacherId: string;
    amount: number;
    accountNumber: string;
    ifsc: string;
    name: string;
  }) {
    return {
      success: true,
      payoutId: 'pout_' + Math.random().toString(36).substring(7),
      status: 'processed'
    };
  }
}

export const paymentService = new PaymentService();
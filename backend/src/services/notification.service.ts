import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { ses } from '../config/ses';
import webpush from 'web-push';

const hasVapidKeys = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (hasVapidKeys) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

const createPushSubscription = (pushSubscription: any) => ({
  endpoint: pushSubscription.endpoint,
  keys: {
    p256dh: pushSubscription.keys?.p256dh,
    auth: pushSubscription.keys?.auth,
  },
  expirationTime: pushSubscription.expirationTime ?? null,
});

// ============================================
// WhatsApp Service (Meta Graph API)
// ============================================
class WhatsAppService {
  constructor() { }

  private formatPhone(phone: string): string {
    let clean = phone.replace(/\D/g, '');
    if (clean.length === 10) return `91${clean}`; // Meta requires country code without +
    if (clean.length === 12 && clean.startsWith('91')) return clean;
    return phone.startsWith('+') ? phone.substring(1) : clean;
  }

  async send(schoolId: string, to: string, message: string, whatsappTemplate?: string): Promise<{ success: boolean; sid?: string }> {
    const formattedTo = this.formatPhone(to);

    try {
      // 1. Fetch connection from DB
      const { data: conn } = await supabaseAdmin
        .from('whatsapp_connections')
        .select('access_token, phone_number_id, status')
        .eq('school_id', schoolId)
        .single();

      if (!conn || conn.status !== 'ACTIVE') {
        console.log(`[WHATSAPP SKIPPED] No active Meta connection for school ${schoolId}`);
        return { success: false, sid: 'no_connection' };
      }

      // 2. Send via Meta Graph API
      const axios = require('axios');

      let payload: any = {
        messaging_product: 'whatsapp',
        to: formattedTo,
      };

      if (whatsappTemplate === 'template_hello_world') {
        payload.type = 'template';
        payload.template = {
          name: 'hello_world',
          language: { code: 'en_US' }
        };
      } else if (whatsappTemplate === 'template_custom') {
        payload.type = 'template';
        payload.template = {
          name: 'kautix_custom',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: (message || ' ').replace(/[\r\n\t]+/g, ' - ').replace(/\s{4,}/g, '   ').trim()
                }
              ]
            }
          ]
        };
      } else {
        payload.type = 'text';
        payload.text = { body: message };
      }

      const response = await axios.post(
        `https://graph.facebook.com/v19.0/${conn.phone_number_id}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${conn.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return { success: true, sid: response.data?.messages?.[0]?.id };
    } catch (e: any) {
      console.error('Meta WhatsApp send error:', e.response?.data || e.message);
      return { success: false };
    }
  }
}

// ============================================
// Notification Log Helper (Standalone for flexibility)
// ============================================
export async function logToCommunication(params: {
  school_id: string;
  user_id?: string;
  channel: 'whatsapp' | 'email' | 'system';
  type: string;
  message: string;
  recipient?: string;
  status: 'sent' | 'failed' | 'pending';
  metadata?: any;
}) {
  try {
    await supabaseAdmin.from('notification_logs').insert({
      school_id: params.school_id,
      user_id: params.user_id,
      channel: params.channel,
      type: params.type,
      message: params.message,
      recipient: params.recipient,
      status: params.status,
      metadata: params.metadata,
      sent_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Background log error:', error);
  }
}

// ============================================
// Email Service
// ============================================
class EmailService {
  constructor() {
    const provider = env.EMAIL_PROVIDER.toLowerCase();
    if (provider === 'resend') console.log(`Email Service: Resend active (From: ${env.RESEND_FROM})`);
    else if (provider === 'ses') console.log(`Email Service: AWS SES active (From: ${env.SES_FROM_EMAIL})`);
    else console.log('Email Service: delivery is on hold; email attempts will be logged as pending.');
  }

  async send(to: string, subject: string, html: string): Promise<{ success: boolean; held?: boolean; messageId?: string; provider: string }> {
    const provider = env.EMAIL_PROVIDER.toLowerCase();
    if (provider === 'hold') {
      return { success: false, held: true, provider };
    }
    if (provider === 'resend') {
      if (!env.RESEND_API_KEY) {
        console.error('Resend email is selected but RESEND_API_KEY is not configured.');
        return { success: false, provider };
      }
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: env.RESEND_FROM, to: [to], subject, html }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error('Resend email error:', payload?.message || response.statusText);
          return { success: false, provider };
        }
        return { success: true, messageId: payload?.id, provider };
      } catch (error: any) {
        console.error('Resend email error:', error.message);
        return { success: false, provider };
      }
    }

    if (provider !== 'ses') {
      console.error(`Unsupported email provider: ${env.EMAIL_PROVIDER}`);
      return { success: false, provider };
    }

    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      console.error('AWS SES is selected but its production credentials are not configured.');
      return { success: false, provider };
    }

    try {
      const command = new SendEmailCommand({
        Source: env.SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
          },
          Body: {
            Html: {
              Data: html,
            },
          },
        },
      });

      const response = await ses.send(command);
      return { success: true, messageId: response.MessageId, provider };
    } catch (error: any) {
      console.error('AWS SES Error:', error.message);
      return { success: false, provider };
    }
  }
}

// ============================================
// Unified Notification Service
// ============================================
class NotificationService {
  public whatsapp: WhatsAppService;
  public email: EmailService;

  constructor() {
    this.whatsapp = new WhatsAppService();
    this.email = new EmailService();
  }

  // Send notification via all specified channels
  async sendMultiChannel(params: {
    schoolId: string;
    userId?: string;
    channels: ('whatsapp' | 'email' | 'push')[];
    type: string;
    title: string;
    message: string;
    phone?: string;
    emailAddress?: string;
    htmlContent?: string;
    sourceId?: string;
    sourceType?: string;
    whatsappTemplate?: string;
  }) {
    const results: Record<string, any> = {};
    let channels = params.userId && !params.channels.includes('push')
      ? [...params.channels, 'push' as const]
      : params.channels;

    // Remove email channel if it's not for auth (credentials/otp)
    if (params.type !== 'credentials' && params.type !== 'otp') {
      channels = channels.filter(c => c !== 'email');
    }

    for (const channel of channels) {
      let status = 'failed';
      let metadata: any = {};

      try {
        switch (channel) {
          case 'whatsapp':
            if (params.phone) {
              const waResult = await this.whatsapp.send(params.schoolId, params.phone, params.message, params.whatsappTemplate);
              status = waResult.success ? 'sent' : 'failed';
              metadata = { sid: waResult.sid };
            }
            break;

          case 'email':
            if (params.emailAddress) {
              const emailResult = await this.email.send(
                params.emailAddress,
                params.title,
                params.htmlContent || `<p>${params.message}</p>`
              );
              status = emailResult.success ? 'sent' : emailResult.held ? 'pending' : 'failed';
              metadata = { messageId: emailResult.messageId, provider: emailResult.provider, held: Boolean(emailResult.held) };
              await this.logEmail({
                schoolId: params.schoolId,
                recipientUserId: params.userId,
                recipientEmail: params.emailAddress,
                subject: params.title,
                bodyHtml: params.htmlContent || `<p>${params.message}</p>`,
                bodyText: params.message,
                templateType: params.type,
                deliveryStatus: status,
                metadata,
              });
            }
            break;

          case 'push':
            if (!params.userId) {
              status = 'skipped';
              break;
            }

            if (!hasVapidKeys) {
              console.warn('[PUSH] Skipped because VAPID keys are missing.');
              status = 'skipped';
              break;
            }

            const { data: pushSubscriptions, error: pushError } = await supabaseAdmin
              .from('push_subscriptions')
              .select('endpoint, p256dh, auth, expiration_time')
              .eq('school_id', params.schoolId)
              .eq('user_id', params.userId);

            if (pushError) throw pushError;
            if (!pushSubscriptions || pushSubscriptions.length === 0) {
              status = 'skipped';
              break;
            }

            const payload = JSON.stringify({
              title: params.title,
              body: params.message,
              url: '/communication',
              type: params.type,
              sourceId: params.sourceId || null,
            });

            let deliveredCount = 0;
            for (const subscriptionRow of pushSubscriptions) {
              try {
                await webpush.sendNotification(createPushSubscription(subscriptionRow), payload);
                deliveredCount += 1;
              } catch (pushSendError: any) {
                const statusCode = pushSendError?.statusCode;
                if (statusCode === 404 || statusCode === 410) {
                  await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', subscriptionRow.endpoint);
                }
                console.error('Push notification error:', pushSendError?.message || pushSendError);
              }
            }

            status = deliveredCount > 0 ? 'sent' : 'failed';
            metadata = { deliveredCount, subscriptionCount: pushSubscriptions.length };
            break;
        }
      } catch (error: any) {
        console.error(`${channel} notification error:`, error.message);
      }

      // Log to database
      await this.logNotification({
        schoolId: params.schoolId,
        userId: params.userId,
        channel,
        type: params.type,
        title: params.title,
        message: params.message,
        recipient: channel === 'email' ? params.emailAddress : params.phone,
        status,
        metadata,
      });

      results[channel] = { status, metadata };
    }

    // Always create in-app notification when we know the recipient user
    if (params.userId) {
      await this.createInAppNotification({
        schoolId: params.schoolId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        sourceType: params.sourceType || 'notification',
        sourceId: params.sourceId,
      });
    }

    return results;
  }

  // Log notification to database
  private async logNotification(params: {
    schoolId: string;
    userId?: string;
    channel: string;
    type: string;
    title: string;
    message: string;
    recipient?: string;
    status: string;
    metadata?: any;
  }) {
    try {
      await supabaseAdmin.from('notification_logs').insert({
        school_id: params.schoolId,
        user_id: params.userId,
        channel: params.channel,
        type: params.type,
        message: params.message,
        subject: params.title,
        recipient: params.recipient,
        status: params.status,
        metadata: {
          title: params.title,
          ...params.metadata
        },
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  async createInAppNotification(params: {
    schoolId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    sourceType?: string;
    sourceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await supabaseAdmin.from('user_notifications').insert({
        school_id: params.schoolId,
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        status: 'unread',
        source_type: params.sourceType || 'notification',
        source_id: params.sourceId || null,
        metadata: params.metadata || {},
      });
    } catch (error) {
      console.error('Failed to create in-app notification:', error);
    }
  }

  async logEmail(params: {
    schoolId: string;
    sentBy?: string;
    recipientUserId?: string;
    recipientEmail: string;
    recipientName?: string;
    recipientType?: string;
    studentId?: string;
    parentId?: string;
    subject: string;
    bodyHtml?: string;
    bodyText?: string;
    templateType?: string;
    deliveryStatus: string;
    attachments?: unknown[];
    metadata?: Record<string, unknown>;
  }) {
    try {
      await supabaseAdmin.from('email_logs').insert({
        school_id: params.schoolId,
        sent_by: params.sentBy || null,
        recipient_user_id: params.recipientUserId || null,
        recipient_email: params.recipientEmail,
        recipient_name: params.recipientName || null,
        recipient_type: params.recipientType || null,
        student_id: params.studentId || null,
        parent_id: params.parentId || null,
        subject: params.subject,
        body_html: params.bodyHtml || null,
        body_text: params.bodyText || null,
        template_type: params.templateType || null,
        delivery_status: params.deliveryStatus,
        attachments: params.attachments || [],
        metadata: params.metadata || {},
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log email:', error);
    }
  }

  // ============================================
  // Pre-built Notification Templates
  // ============================================

  async sendFeeReminder(params: {
    schoolId: string;
    parentPhone: string;
    parentEmail: string;
    parentUserId: string;
    studentName: string;
    amount: number;
    dueDate: string;
    paymentLink?: string;
  }) {
    const message = `Dear Parent, fee of ₹${params.amount} for ${params.studentName} is due on ${params.dueDate}. ${params.paymentLink ? `Pay now: ${params.paymentLink}` : 'Please pay at the school office.'} - Kautix`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0;">Kautix - Fee Reminder</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p>Dear Parent,</p>
          <p>This is a reminder that the fee payment for <strong>${params.studentName}</strong> is due.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">₹${params.amount}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Due Date</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${params.dueDate}</td></tr>
          </table>
          ${params.paymentLink ? `<a href="${params.paymentLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Pay Now</a>` : ''}
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">This is an automated message from Kautix School Management System.</p>
        </div>
      </div>
    `;

    return this.sendMultiChannel({
      schoolId: params.schoolId,
      userId: params.parentUserId,
      channels: ['whatsapp', 'email'],
      type: 'fee_reminder',
      title: 'Fee Payment Reminder',
      message,
      phone: params.parentPhone,
      emailAddress: params.parentEmail,
      htmlContent: html,
    });
  }

  async sendAttendanceAlert(params: {
    schoolId: string;
    parentPhone: string;
    parentEmail: string;
    parentUserId: string;
    studentName: string;
    date: string;
    status: string;
  }) {
    const message = `Dear Parent, ${params.studentName} was marked ${params.status} on ${params.date}. - Kautix`;

    return this.sendMultiChannel({
      schoolId: params.schoolId,
      userId: params.parentUserId,
      channels: ['whatsapp', 'email'],
      type: 'attendance_alert',
      title: `Attendance Alert — ${params.studentName}`,
      message,
      phone: params.parentPhone,
      emailAddress: params.parentEmail,
    });
  }

  async sendExamAbsenceAlert(params: {
    schoolId: string;
    parentPhone: string;
    parentEmail: string;
    parentUserId: string;
    studentName: string;
    examName: string;
  }) {
    const message = `Dear Parent, ${params.studentName} was marked absent for the ${params.examName} exam. Please contact the school for further details. - Kautix`;

    return this.sendMultiChannel({
      schoolId: params.schoolId,
      userId: params.parentUserId,
      channels: ['whatsapp', 'email'],
      type: 'attendance_alert',
      title: `Exam Absence Alert — ${params.studentName}`,
      message,
      phone: params.parentPhone,
      emailAddress: params.parentEmail,
    });
  }

  async sendPaymentReceipt(params: {
    schoolId: string;
    parentEmail: string;
    parentPhone: string;
    parentUserId: string;
    studentName: string;
    rollNumber?: string;
    amount: number;
    receiptNumber: string;
    paymentMethod: string;
    transactionId: string;
    date: string;
  }) {
    const message = `✅ KAUTIX ACADEMY — Payment Receipt

Dear Parent,

Payment of ₹${params.amount} has been received for ${params.studentName}${params.rollNumber ? ` (Roll No: ${params.rollNumber})` : ''}.

Receipt #: ${params.receiptNumber}
Date: ${params.date}
Method: ${params.paymentMethod}
Txn ID: ${params.transactionId}

Thank you for your timely payment! You can download the full PDF receipt from the parent portal.

🌐 Portal: https://kautix.in/fees
— Kautix Academy`;

    const html = `
<div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <div style="background:linear-gradient(135deg,#10b981,#059669);padding:40px;border-radius:20px 20px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:32px;font-weight:900">KAUTIX ACADEMY</h1>
    <p style="color:#d1fae5;margin-top:8px;letter-spacing:3px;font-size:11px;font-weight:700">OFFICIAL PAYMENT RECEIPT</p>
  </div>
  <div style="padding:40px;border:1px solid #e2e8f0;border-top:none;background:white;border-radius:0 0 20px 20px">
    <h2 style="font-size:22px;font-weight:800;margin-bottom:24px;color:#065f46">Payment Successful!</h2>
    <p>Dear Parent,</p>
    <p>We have successfully received the payment for <strong>${params.studentName}</strong>. Details of the transaction are below:</p>
    
    <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
      <tr style="background:#f0fdf4"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Receipt Number</td><td style="padding:12px;border:1px solid #e2e8f0;font-weight:800;color:#059669">${params.receiptNumber}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Student Name</td><td style="padding:12px;border:1px solid #e2e8f0">${params.studentName}</td></tr>
      <tr style="background:#f0fdf4"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Roll No.</td><td style="padding:12px;border:1px solid #e2e8f0">${params.rollNumber || '—'}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Amount Paid</td><td style="padding:12px;border:1px solid #e2e8f0;font-weight:800;color:#059669">₹${params.amount}</td></tr>
      <tr style="background:#f0fdf4"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Payment Method</td><td style="padding:12px;border:1px solid #e2e8f0">${params.paymentMethod}</td></tr>
      <tr><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Transaction ID</td><td style="padding:12px;border:1px solid #e2e8f0;font-size:12px;color:#64748b">${params.transactionId}</td></tr>
      <tr style="background:#f0fdf4"><td style="padding:12px;border:1px solid #e2e8f0;font-weight:700">Date</td><td style="padding:12px;border:1px solid #e2e8f0">${params.date}</td></tr>
    </table>

    <div style="background:#f8fafc;padding:20px;border-radius:12px;margin:24px 0;border:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:13px;color:#64748b">You can access your account to download the digital PDF and track previous payments.</p>
    </div>

    <a href="https://kautix.in/fees" style="display:block;background:#059669;color:white;padding:18px;border-radius:14px;text-decoration:none;text-align:center;font-weight:800;font-size:14px;letter-spacing:1px">VIEW IN PORTAL →</a>
    
    <p style="color:#94a3b8;font-size:11px;margin-top:32px;text-align:center">This is an automated receipt from Kautix Academy. Thank you for your support! © 2026</p>
  </div>
</div>`;

    return this.sendMultiChannel({
      schoolId: params.schoolId,
      userId: params.parentUserId,
      channels: ['whatsapp', 'email'],
      type: 'payment_receipt',
      title: `Payment Receipt — ${params.receiptNumber} | Kautix Academy`,
      message,
      phone: params.parentPhone,
      emailAddress: params.parentEmail,
      htmlContent: html,
    });
  }

  async sendExamResult(params: {
    schoolId: string;
    parentEmail?: string;
    parentPhone?: string;
    parentUserId?: string;
    studentEmail?: string;
    studentUserId?: string;
    studentName: string;
    examName: string;
    results: { subject: string; marks: number; total: number; grade: string }[];
    overallPercentage: number;
    rank?: number;
    assessmentType?: 'Exam' | 'Assignment';
  }) {
    const typeLabel = params.assessmentType || 'Exam';
    const message = `${params.studentName}'s ${params.examName} ${typeLabel.toLowerCase()} results: ${params.overallPercentage}%${params.rank ? `, Rank: ${params.rank}` : ''}. Check portal for details. - Kautix`;

    const subjectRows = params.results.map(r =>
      `<tr><td style="padding: 8px; border: 1px solid #e5e7eb;">${r.subject}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${r.marks}/${r.total}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${r.grade}</td></tr>`
    ).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0;">${typeLabel} Results - ${params.examName}</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p>Dear Parent, here are the ${typeLabel.toLowerCase()} results for <strong>${params.studentName}</strong>:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #f3f4f6;"><th style="padding: 8px; border: 1px solid #e5e7eb;">Subject</th><th style="padding: 8px; border: 1px solid #e5e7eb;">Marks</th><th style="padding: 8px; border: 1px solid #e5e7eb;">Grade</th></tr>
            ${subjectRows}
          </table>
          <p><strong>Overall: ${params.overallPercentage}%</strong>${params.rank ? ` | <strong>Rank: ${params.rank}</strong>` : ''}</p>
        </div>
      </div>
    `;

    if (params.parentUserId && params.parentEmail) {
      await this.sendMultiChannel({
        schoolId: params.schoolId,
        userId: params.parentUserId,
        channels: ['whatsapp', 'email'],
        type: 'exam_result',
        title: `${typeLabel} Results - ${params.examName}`,
        message,
        phone: params.parentPhone,
        emailAddress: params.parentEmail,
        htmlContent: html,
      });
    }

    if (params.studentUserId && params.studentEmail) {
      await this.sendMultiChannel({
        schoolId: params.studentUserId,
        userId: params.studentUserId,
        channels: ['email'],
        type: 'exam_result',
        title: `${typeLabel} Results Published - ${params.examName}`,
        message,
        emailAddress: params.studentEmail,
        htmlContent: html,
      });
    }
  }

  async sendWelcomeMessage(params: {
    schoolId: string;
    userId: string;
    name: string;
    role: string;
    email: string;
    phone?: string;
    channels: ('whatsapp' | 'email')[];
    loginUrl: string;
  }) {
    const message = `Welcome to Kautix! Your account as a ${params.role} has been activated. Login here: ${params.loginUrl}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <div style="background: #2563eb; padding: 40px 20px; border-radius: 24px 24px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px;">EDUMASTER</h1>
          <p style="color: #bfdbfe; margin-top: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; font-size: 12px;">Account Activation Successful</p>
        </div>
        <div style="padding: 40px; border: 1px solid #f1f5f9; border-top: none; border-radius: 0 0 24px 24px; background: white;">
          <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 16px;">Welcome, ${params.name}!</h2>
          <p style="line-height: 1.6; color: #64748b;">Your enterprise school account has been provisioned. You can now access your dashboard, track performance, and manage institution data in real-time.</p>
          <div style="margin: 32px 0; padding: 24px; background: #f8fafc; border-radius: 16px; border: 1px solid #f1f5f9;">
             <p style="margin: 0; font-size: 14px; font-weight: 700; color: #475569;">ROLE: <span style="color: #2563eb;">${params.role.toUpperCase()}</span></p>
             <p style="margin: 8px 0 0 0; font-size: 14px; font-weight: 700; color: #475569;">ID/EMAIL: <span style="color: #2563eb;">${params.email}</span></p>
          </div>
          <a href="${params.loginUrl}" style="display: block; width: 100%; box-sizing: border-box; background: #0f172a; color: white; padding: 18px; border-radius: 16px; text-decoration: none; text-align: center; font-weight: 800; shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">ACCESS DASHBOARD</a>
          <p style="color: #94a3b8; font-size: 11px; margin-top: 32px; text-align: center;">© 2026 Kautix AI Systems. All rights reserved.</p>
        </div>
      </div>
    `;

    return this.sendMultiChannel({
      schoolId: params.schoolId,
      userId: params.userId,
      channels: params.channels,
      type: 'welcome',
      title: 'Welcome to Kautix',
      message: message,
      phone: params.phone,
      emailAddress: params.email,
      htmlContent: html,
    });
  }

  async sendMonthlyReport(params: {
    schoolId: string;
    parentPhone: string;
    parentEmail: string;
    parentUserId: string;
    studentName: string;
    month: string;
    paymentSummary: {
      totalPaid: number;
      pending: number;
      lastPaymentDate?: string;
      receipt_number?: string;
      transaction_id?: string;
    };
    performanceSummary: { avgGrade: string; attendanceRate: number; rank?: number; topSubjects: string[] };
  }) {
    const message = `Monthly Update for ${params.studentName} (${params.month}): Performance: ${params.performanceSummary.avgGrade}, Attendance: ${params.performanceSummary.attendanceRate}%. Fee Paid: ₹${params.paymentSummary.totalPaid}. Check email for PDF report. - Kautix`;

    const html = `
      <div style="font-family: 'Inter', sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; background: #f8fafc; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background: #0f172a; padding: 40px; text-align: center;">
          <h1 style="color: #3b82f6; margin: 0; font-size: 28px; font-weight: 900;">KAUTIX</h1>
          <p style="color: #94a3b8; margin-top: 8px; text-transform: uppercase; letter-spacing: 2px; font-size: 10px; font-weight: 700;">Monthly Academic & Financial Statement</p>
        </div>
        
        <div style="padding: 40px; background: white;">
          <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 24px; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px;">Report for ${params.studentName} - ${params.month}</h2>
          
          <div style="display: flex; gap: 20px; margin-bottom: 32px;">
            <div style="flex: 1; padding: 20px; background: #eff6ff; border-radius: 16px; border: 1px solid #dbeafe;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #1e40af; text-transform: uppercase;">Academic Summary</h3>
              <p style="margin: 4px 0; font-size: 13px;">Grade: <strong style="color: #2563eb;">${params.performanceSummary.avgGrade}</strong></p>
              <p style="margin: 4px 0; font-size: 13px;">Attendance: <strong>${params.performanceSummary.attendanceRate}%</strong></p>
              <p style="margin: 4px 0; font-size: 13px;">Strengths: <strong>${params.performanceSummary.topSubjects.join(', ')}</strong></p>
            </div>
            
            <div style="flex: 1; padding: 20px; background: #f0fdf4; border-radius: 16px; border: 1px solid #dcfce7;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #166534; text-transform: uppercase;">Fee Status</h3>
              <p style="margin: 4px 0; font-size: 13px;">Receipt: <strong>${params.paymentSummary.receipt_number || 'N/A'}</strong></p>
              <p style="margin: 4px 0; font-size: 13px;">Transaction ID: <strong>${params.paymentSummary.transaction_id || 'N/A'}</strong></p>
              <p style="margin: 4px 0; font-size: 13px;">Paid this month: <strong style="color: #16a34a;">₹${params.paymentSummary.totalPaid}</strong></p>
              <p style="margin: 4px 0; font-size: 13px;">Total Pending: <strong style="color: #dc2626;">₹${params.paymentSummary.pending}</strong></p>
            </div>
          </div>
          
          <div style="padding: 24px; background: #f8fafc; border-radius: 16px; border: 1px dashed #cbd5e1;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px;">AI Insight</h4>
            <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #475569;">
              Based on ${params.studentName}'s performance in ${params.performanceSummary.topSubjects[0]}, we recommend focusing on advanced concepts. Attendance is ${params.performanceSummary.attendanceRate < 90 ? 'slightly below target' : 'excellent'}.
            </p>
          </div>
          
          <div style="margin-top: 40px; text-align: center;">
            <a href="#" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 14px;">Download PDF Report</a>
          </div>
        </div>
        
        <div style="padding: 24px; text-align: center; background: #f1f5f9;">
          <p style="margin: 0; font-size: 11px; color: #64748b;">This report is automatically generated by Kautix. For queries, contact your school administrator.</p>
        </div>
      </div>
    `;

    return this.sendMultiChannel({
      schoolId: params.schoolId,
      userId: params.parentUserId,
      channels: ['whatsapp', 'email'],
      type: 'monthly_report',
      title: `Progress Report — ${params.month} | Kautix Academy`,
      message,
      phone: params.parentPhone,
      emailAddress: params.parentEmail,
      htmlContent: html,
    });
  }

  async notifySection(params: {
    schoolId: string;
    sectionId: string;
    type: 'assignment' | 'exam' | 'timetable';
    title: string;
    message: string;
    htmlContent?: string;
    sourceId?: string;
  }) {
    try {
      const { data: studentList, error } = await supabaseAdmin
        .from('students')
        .select(`
          id,
          user:users(
            id,
            email,
            phone,
            first_name,
            last_name
          )
        `)
        .eq('section_id', params.sectionId)
        .eq('school_id', params.schoolId);

      if (error || !studentList) {
        console.error('Error fetching students for section notification:', error);
        return;
      }

      for (const student of studentList) {
        const studentUser = student.user as any;
        if (studentUser) {
          // Always create in-app notification first (guaranteed delivery)
          await this.createInAppNotification({
            schoolId: params.schoolId,
            userId: studentUser.id,
            type: params.type,
            title: params.title,
            message: params.message,
            sourceType: params.type,
            sourceId: params.sourceId,
          });

          // External channels (email/SMS/WhatsApp) - non-blocking, best-effort
          this.sendMultiChannel({
            schoolId: params.schoolId,
            userId: studentUser.id,
            channels: ['email', 'whatsapp'],
            type: params.type,
            title: params.title,
            message: params.message,
            phone: studentUser.phone || undefined,
            emailAddress: studentUser.email || undefined,
            htmlContent: params.htmlContent,
            sourceId: params.sourceId,
            sourceType: params.type,
          }).catch(err => console.error('External notification failed for student:', studentUser.id, err));
        }

        const { data: parentRelations } = await supabaseAdmin
          .from('parent_students')
          .select(`
            parent:parents(
              user:users(
                id,
                email,
                phone,
                first_name,
                last_name
              )
            )
          `)
          .eq('student_id', student.id);

        if (parentRelations) {
          for (const rel of parentRelations) {
            const parentUser = (rel.parent as any)?.user as any;
            if (parentUser) {
              // Guaranteed in-app notification for parent
              await this.createInAppNotification({
                schoolId: params.schoolId,
                userId: parentUser.id,
                type: params.type,
                title: `${params.title} (Parent Alert)`,
                message: `Dear Parent, ${params.message}`,
                sourceType: params.type,
                sourceId: params.sourceId,
              });
              // External channels - non-blocking
              this.sendMultiChannel({
                schoolId: params.schoolId,
                userId: parentUser.id,
                channels: ['email', 'whatsapp'],
                type: params.type,
                title: `${params.title} (Parent Alert)`,
                message: `Dear Parent, ${params.message}`,
                phone: parentUser.phone || undefined,
                emailAddress: parentUser.email || undefined,
                htmlContent: params.htmlContent ? `<p>Dear Parent,</p>${params.htmlContent}` : undefined,
                sourceId: params.sourceId,
                sourceType: params.type,
              }).catch(err => console.error('External notification failed for parent:', parentUser.id, err));
            }
          }
        }
      }
    } catch (e: any) {
      console.error('Failed to notify section:', e.message);
    }
  }

  async sendBulk(params: {
    schoolId: string;
    userIds: string[];
    type: string;
    title: string;
    message: string;
    sourceId?: string;
  }) {
    try {
      const rows = params.userIds.map(userId => ({
        school_id: params.schoolId,
        user_id: userId,
        type: params.type,
        title: params.title,
        message: params.message,
        status: 'unread',
        source_type: 'notification',
        source_id: params.sourceId || null,
        metadata: {},
      }));

      if (rows.length > 0) {
        await supabaseAdmin.from('user_notifications').insert(rows);
      }
    } catch (e: any) {
      console.error('Failed to sendBulk notifications:', e.message);
    }
  }
}

export const notificationService = new NotificationService();

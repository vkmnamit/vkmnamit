import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase';

// Run every 15 minutes to auto-close exams and assignments
cron.schedule('*/15 * * * *', async () => {
  console.log('[Assessment Auto-Close] Running scheduled check...');
  try {
    const now = new Date();
    
    // We compare using IST/local relative dates or UTC directly.
    // Assuming date stored is YYYY-MM-DD
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    
    // 1. Auto-close Exams
    const { data: exams, error: examsErr } = await supabaseAdmin
      .from('exams')
      .select('id, date, end_time')
      .eq('status', 'scheduled')
      .lte('date', todayStr);

    if (examsErr) {
      console.error('[Assessment Auto-Close] Error fetching exams:', examsErr);
    } else if (exams && exams.length > 0) {
      const examsToClose = exams.filter(e => {
        if (e.date < todayStr) return true; // Past date
        if (e.date === todayStr && e.end_time) {
          return e.end_time < currentTimeStr;
        }
        return false;
      }).map(e => e.id);

      if (examsToClose.length > 0) {
        const { error: updateErr } = await supabaseAdmin
          .from('exams')
          .update({ status: 'completed' })
          .in('id', examsToClose);
          
        if (updateErr) {
          console.error('[Assessment Auto-Close] Error closing exams:', updateErr);
        } else {
          console.log(`[Assessment Auto-Close] Successfully auto-closed ${examsToClose.length} exams.`);
        }
      }
    }

    // 2. Auto-close LMS Assignments
    const { data: assignments, error: assignErr } = await supabaseAdmin
      .from('lms_assignments')
      .select('id, due_date')
      .eq('status', 'published')
      .lt('due_date', todayStr); // due_date is past

    if (assignErr) {
      console.error('[Assessment Auto-Close] Error fetching assignments:', assignErr);
    } else if (assignments && assignments.length > 0) {
      const assignsToClose = assignments.map(a => a.id);
      if (assignsToClose.length > 0) {
        const { error: updateErr } = await supabaseAdmin
          .from('lms_assignments')
          .update({ status: 'closed' })
          .in('id', assignsToClose);
          
        if (updateErr) {
          console.error('[Assessment Auto-Close] Error closing assignments:', updateErr);
        } else {
          console.log(`[Assessment Auto-Close] Successfully auto-closed ${assignsToClose.length} assignments.`);
        }
      }
    }
  } catch (error) {
    console.error('[Assessment Auto-Close] Unhandled error in cron:', error);
  }
});

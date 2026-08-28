import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { error: rpcErr } = await sb.rpc('execute_sql', { query: 'SELECT 1' });
console.log('execute_sql RPC:', rpcErr ? 'NO (' + rpcErr.message.slice(0, 80) + ')' : 'YES');

const checks = ['exam_type_id', 'total_marks', 'passing_marks', 'updated_at'];
for (const col of checks) {
  const { error } = await sb.from('exams').select(col).limit(1);
  console.log('exams.' + col + ':', error ? 'MISSING' : 'ok');
}

const { data: cnt, error: cntErr } = await sb.from('exams').select('exam_results(count)').limit(1);
console.log('exam_results(count):', cntErr ? 'ERR ' + cntErr.message.slice(0, 90) : JSON.stringify(cnt));
const { data: mr, error: mrErr } = await sb.from('exams').select('exam_results(marks_obtained)').limit(1);
console.log('exam_results(marks):', mrErr ? 'ERR ' + mrErr.message.slice(0, 90) : JSON.stringify(mr));

const { data: et, error: etErr } = await sb.from('exam_types').select('id, name, weightage').limit(3);
console.log('exam_types:', etErr ? 'ERR' : 'ok, rows=' + (et || []).length);

const { data: ay, error: ayErr } = await sb.from('academic_years').select('id, name, is_current, school_id').limit(5);
console.log('academic_years:', ayErr ? 'ERR ' + ayErr.message.slice(0, 80) : 'ok, rows=' + (ay || []).length);
if (ay) console.table(ay.map(r => ({ name: r.name, current: r.is_current, school: String(r.school_id).slice(0, 8) })));

const { data: stu } = await sb.from('students').select('id, user_id, section_id, school_id, section:sections(class_id, name)').limit(3);
console.log('\nstudents sample:', stu ? stu.length : 0);
if (stu) console.table(stu.map(s => ({ id: String(s.id).slice(0, 8), hasSection: !!s.section_id, classId: s.section ? s.section.class_id : null, secName: s.section ? s.section.name : null })));
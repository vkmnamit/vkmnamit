/**
 * READ-ONLY diagnostic: why do students promoted before the change not show
 * "Back Due" from previous years in the cumulative register?
 *
 * Checks, per student promoted via student_promotions / rollover:
 *  1. prior-year fee_payments exist at all
 *  2. do they have academic_year_id set? (NULL -> register treats them as CURRENT)
 *  3. is there any unpaid balance left (status/paid_amount)?
 *
 * Run: cd backend && npx ts-node --transpile-only scripts/diag_backdue.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: cands } = await supabase.from('schools').select('id').ilike('name', '%Kautix Academy%');
  let schoolId = '', best = -1;
  for (const sc of cands || []) {
    const { count } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', sc.id);
    if ((count ?? 0) > best) { best = count ?? 0; schoolId = sc.id; }
  }
  console.log(`main school id=${schoolId} (${best} students)`);
  const { data: ys } = await supabase.from('academic_years').select('id, name, start_date').eq('school_id', schoolId);
  const y2025 = ys!.find((y: any) => y.name.startsWith('2025'));
  const y2026 = ys!.find((y: any) => y.name === '2026-2027');
  const y2027 = ys!.find((y: any) => y.name === '2027-2028');

  // Live-student counts per year
  for (const [label, yr] of [['2026-27', y2026], ['2027-28', y2027]] as any[]) {
    const { count } = await supabase.from('students').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('academic_year_id', yr.id);
    console.log(`students live in ${label}: ${count}`);
  }

  // Students NOW in 2027-28 (promoted), list their fees by year w/ balances
  const { data: promoted } = await supabase
    .from('students').select('id, user_id, admission_number, roll_number')
    .eq('school_id', schoolId).eq('academic_year_id', y2027.id)
    .limit(50);
  console.log(`\n=== ${promoted?.length ?? 0} students living in 2027-28 ===`);

  const uidMap: Record<string, string> = {};
  if (promoted?.length) {
    const { data: users } = await supabase.from('users').select('id, first_name, last_name')
      .in('id', promoted.map((s: any) => s.user_id));
    for (const u of users || []) uidMap[u.id] = `${u.first_name} ${u.last_name}`;
  }

  for (const s of (promoted || []).slice(0, 12)) {
    const { data: fees } = await supabase
      .from('fee_payments')
      .select('title, amount, late_fee, discount_amount, paid_amount, status, academic_year_id')
      .eq('student_id', s.id);
    const bal = (f: any) => Math.max(0, Number(f.amount || 0) + Number(f.late_fee || 0) - Number(f.discount_amount || 0) - Number(f.paid_amount || 0));
    const byYear: Record<string, any[]> = {};
    for (const f of fees || []) {
      const k = !f.academic_year_id ? 'NULL' : f.academic_year_id === y2026.id ? '2026-27' : f.academic_year_id === y2027.id ? '2027-28' : f.academic_year_id;
      (byYear[k] ||= []).push(f);
    }
    const lines = Object.entries(byYear).map(([k, fs]) => {
      const owed = (fs as any[]).filter((f) => bal(f) > 0);
      return `${k}: ${fs.length} rows, unpaid ${owed.length} (${owed.reduce((t, f) => t + bal(f), 0)})`;
    }).join(' | ');
    console.log(`— ${uidMap[s.user_id] || s.admission_number} → ${lines || 'NO FEES AT ALL'}`);
  }
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
main().catch((e) => { console.error(e); process.exit(1); });
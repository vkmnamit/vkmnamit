/** Scope the cleanup: empty duplicate schools, duplicate year rows, NULL-year fees. BACKUP + DRY_RUN only. */
import { supabaseAdmin } from '../src/config/supabase';

async function main() {
    // 1) Schools with data footprint
    const { data: schools } = await supabaseAdmin.from('schools').select('id, name, created_at');
    console.log('=== SCHOOLS ===');
    for (const s of schools || []) {
        const { count: stu } = await supabaseAdmin.from('students').select('id', { count: 'exact', head: true }).eq('school_id', s.id);
        const { count: pay } = await supabaseAdmin.from('fee_payments').select('id', { count: 'exact', head: true }).eq('school_id', s.id);
        const { count: usr } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('school_id', s.id);
        console.log(`${s.name} | ${s.id.slice(0, 8)} | students=${stu} fee_payments=${pay} users=${usr} created=${s.created_at?.slice(0, 10)}`);
    }

    // 2) Duplicate academic years (same school + same name)
    const { data: ys } = await supabaseAdmin.from('academic_years').select('id, school_id, name, is_current, start_date');
    const groups = new Map<string, any[]>();
    for (const y of ys || []) {
        const k = `${y.school_id}:${y.name}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(y);
    }
    console.log('\n=== DUPLICATE ACADEMIC YEARS ===');
    for (const [k, list] of groups) {
        if (list.length < 2) continue;
        for (const y of list) {
            const { count: stu } = await supabaseAdmin.from('students').select('id', { count: 'exact', head: true }).eq('academic_year_id', y.id);
            const { count: pay } = await supabaseAdmin.from('fee_payments').select('id', { count: 'exact', head: true }).eq('academic_year_id', y.id);
            const { count: st } = await supabaseAdmin.from('fee_structures').select('id', { count: 'exact', head: true }).eq('academic_year_id', y.id);
            console.log(`${y.name} | year=${y.id.slice(0, 8)} | school=${y.school_id.slice(0, 8)} | current=${y.is_current} | students=${stu} payments=${pay} structures=${st}`);
        }
        console.log('---');
    }

    // 3) NULL-year fees — resolvable via their student?
    const { data: orphans } = await supabaseAdmin.from('fee_payments').select('id, student_id, title, amount, status, students(academic_year_id)').is('academic_year_id', null);
    console.log(`\n=== NULL-YEAR FEES: ${orphans?.length || 0} ===`);
    let resolvable = 0, unresolvable = 0;
    for (const o of orphans || []) {
        const stu: any = (o as any).students;
        if (stu?.academic_year_id) resolvable++; else unresolvable++;
    }
    console.log(`resolvable via student's current year: ${resolvable} | unresolvable: ${unresolvable}`);
    for (const o of (orphans || []).slice(0, 5)) {
        const stu: any = (o as any).students;
        console.log(`  e.g. ${o.title} ₹${o.amount} ${o.status} | student_year=${stu?.academic_year_id?.slice(0, 8) || 'NONE'}`);
    }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

/** Diagnose why 2027-28 fee generation covers 0 students, and test-insert one row. */
import { supabaseAdmin } from '../src/config/supabase';

const SCHOOL = 'f1175024-9c55-4ab3-bf6b-6c0a708587bb';

async function main() {
    // 1) fee structures for 2027-28
    const { data: ys } = await supabaseAdmin.from('academic_years').select('id, name').eq('school_id', SCHOOL).order('start_date');
    const y27 = (ys || []).find((y: any) => y.name.includes('2027'));
    const y26 = (ys || []).find((y: any) => y.name.includes('2026'));
    console.log('2027-28 year id:', y27?.id);

    const { data: structs } = await supabaseAdmin.from('fee_structures').select('*').eq('school_id', SCHOOL).eq('academic_year_id', y27.id);
    for (const f of structs || []) console.log('struct:', f.name, '| class:', f.class_id, '| amount:', f.amount, '| applies_to:', (f as any).applies_to);

    // 2) classes for those years
    const { data: classes27 } = await supabaseAdmin.from('classes').select('id, grade, name').eq('school_id', SCHOOL).eq('academic_year_id', y27.id);
    console.log('\n2027-28 classes:', (classes27 || []).map((c: any) => `${c.grade}:${c.id.slice(0, 8)}`).join(', '));

    // 3) students' sections → class ids
    const { data: students } = await supabaseAdmin.from('students').select('id, section:sections(id, class_id)').eq('school_id', SCHOOL).eq('academic_year_id', y27.id).eq('status', 'active');
    const classCount = new Map<string, number>();
    for (const s of students || []) {
        const cid = (s as any).section?.class_id;
        if (!cid) { classCount.set('NO_SECTION', (classCount.get('NO_SECTION') || 0) + 1); continue; }
        classCount.set(cid, (classCount.get(cid) || 0) + 1);
    }
    console.log('students by class:', [...classCount.entries()].map(([k, v]) => `${k.slice(0, 8)}=${v}`).join(', '));

    // 4) test insert one row with FULL columns to see which column fails
    const s0 = (students || [])[0] as any;
    const f0 = (structs || [])[0] as any;
    if (s0 && f0) {
        const { error: eFull } = await supabaseAdmin.from('fee_payments').insert({
            school_id: SCHOOL, student_id: s0.id, fee_structure_id: f0.id, academic_year_id: y27.id,
            title: f0.name, amount: Number(f0.amount), paid_amount: 0, late_fee: 0, discount_amount: 0,
            status: 'pending', payment_method: 'unpaid', due_date: '2027-04-10',
            is_opening_balance: false, transport_route_id: null
        });
        console.log('\nFULL-COLUMN insert error:', eFull ? eFull.message : 'OK');
        if (eFull) {
            const { error: eMin } = await supabaseAdmin.from('fee_payments').insert({
                school_id: SCHOOL, student_id: s0.id, fee_structure_id: f0.id, academic_year_id: y27.id,
                amount: Number(f0.amount), due_date: '2027-04-10', status: 'pending', is_opening_balance: false
            });
            console.log('MIN-COLUMN insert error:', eMin ? eMin.message : 'OK');
        }
    }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

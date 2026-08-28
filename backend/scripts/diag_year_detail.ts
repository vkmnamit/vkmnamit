/** Deep diag: every year row for school f1175024 — students, structures, class overlap, existing payments. */
import { supabaseAdmin } from '../src/config/supabase';

const SCHOOL = 'f1175024-9c55-4ab3-bf6b-6c0a708587bb';

async function main() {
    const { data: ys } = await supabaseAdmin
        .from('academic_years')
        .select('id, name, is_current, start_date, end_date')
        .eq('school_id', SCHOOL)
        .order('start_date');

    for (const y of ys || []) {
        const { count: stu } = await supabaseAdmin.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL).eq('academic_year_id', y.id).eq('status', 'active');
        const { count: st } = await supabaseAdmin.from('fee_structures').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL).eq('academic_year_id', y.id);
        const { count: pay } = await supabaseAdmin.from('fee_payments').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL).eq('academic_year_id', y.id);
        console.log(`\n📘 ${y.name} | id=${y.id.slice(0, 8)} | current=${y.is_current} | ${y.start_date}→${y.end_date}`);
        console.log(`   students=${stu} fee_structures=${st} fee_payments=${pay}`);

        if ((stu || 0) > 0 && (st || 0) > 0) {
            const { data: structs } = await supabaseAdmin.from('fee_structures').select('id, name, class_id, amount').eq('school_id', SCHOOL).eq('academic_year_id', y.id);
            const { data: students } = await supabaseAdmin.from('students').select('id, section:sections(class_id)').eq('school_id', SCHOOL).eq('academic_year_id', y.id).eq('status', 'active');
            const stuClasses = new Set<string>();
            let noSection = 0;
            for (const s of students || []) {
                const cid = (s as any).section?.class_id;
                if (cid) stuClasses.add(cid); else noSection++;
            }
            console.log(`   student classes: ${[...stuClasses].map(c => c.slice(0, 8)).join(',')}${noSection ? ` (+${noSection} no section)` : ''}`);
            for (const f of structs || []) {
                const matches = stuClasses.has(f.class_id);
                // existing payments for this structure
                const { count: ep } = await supabaseAdmin.from('fee_payments').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL).eq('academic_year_id', y.id).eq('fee_structure_id', f.id);
                console.log(`   struct "${f.name}" class=${f.class_id.slice(0, 8)} ₹${f.amount} → matchesStudents=${matches} existingPayments=${ep}`);
            }
        }
    }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

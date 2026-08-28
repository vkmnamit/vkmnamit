/** Diagnostic: which schools have a 2027-* academic year and student counts per year. */
import { supabaseAdmin } from '../src/config/supabase';

async function main() {
    const { data: ys } = await supabaseAdmin
        .from('academic_years')
        .select('school_id, id, name, is_current, start_date')
        .order('start_date');

    for (const y of ys || [] as any[]) {
        const { count } = await supabaseAdmin
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', y.school_id)
            .eq('academic_year_id', y.id)
            .eq('status', 'active');
        const { count: fc } = await supabaseAdmin
            .from('fee_structures')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', y.school_id)
            .eq('academic_year_id', y.id);
        console.log(`${y.name} | current=${y.is_current} | school=${y.school_id} | students=${count} | fee_structures=${fc}`);
    }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

/** Check for duplicate fee_payments per student+structure within a year. */
import { supabaseAdmin } from '../src/config/supabase';

const YEAR = '3254ebe5';

async function main() {
    // resolve full id (uuid `like` can be finicky — match in JS)
    const { data: ys } = await supabaseAdmin.from('academic_years').select('id, name');
    const y = (ys || []).find((x: any) => x.id.startsWith(YEAR));
    if (!y) { console.log('year not found among', ys?.length); return; }
    console.log('Year:', y.name, y.id);

    const { data: pays } = await supabaseAdmin
        .from('fee_payments')
        .select('id, student_id, fee_structure_id, title, amount, status, due_date, created_at')
        .eq('academic_year_id', y.id)
        .order('created_at');

    const combo = new Map<string, any[]>();
    for (const p of pays || []) {
        const k = `${p.student_id}:${p.fee_structure_id}`;
        if (!combo.has(k)) combo.set(k, []);
        combo.get(k)!.push(p);
    }

    let dupGroups = 0, dupRows = 0;
    for (const [k, rows] of combo) {
        if (rows.length > 1) {
            dupGroups++;
            dupRows += rows.length - 1;
            if (dupGroups <= 5) {
                console.log(`\nDUP ${k.slice(0, 13)}… ×${rows.length}:`, rows.map((r: any) => `${r.title} ₹${r.amount} ${r.status} due=${r.due_date} at=${r.created_at?.slice(0, 16)}`));
            }
        }
    }
    console.log(`\nTotal payments: ${pays?.length} | distinct student+structure combos: ${combo.size} | dup groups: ${dupGroups} | extra rows: ${dupRows}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

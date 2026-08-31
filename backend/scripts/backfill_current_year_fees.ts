/**
 * ONE-TIME BACKFILL: push the current academic year's fee structures onto
 * students who were promoted BEFORE auto-fee-generation existed.
 * Dedup-safe — safe to run multiple times.
 *
 * Usage:  npx ts-node --transpile-only scripts/backfill_current_year_fees.ts
 * Set DRY_RUN=false to actually write.
 */
import { supabaseAdmin } from '../src/config/supabase';
import { generateFeesForAcademicYear } from '../src/services/fee_promotion.service';

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
    console.log(`🔎 Backfill fees — DRY_RUN=${DRY_RUN}`);

    // Target ANY year that has active students AND fee structures —
    // not just is_current (2027-28 may not be flagged current yet).
    const { data: years, error } = await supabaseAdmin
        .from('academic_years')
        .select('school_id, id, name');
    if (error) throw error;
    if (!years || years.length === 0) { console.log('No academic years found. Nothing to do.'); return; }

    for (const y of years) {
        const { count } = await supabaseAdmin
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', y.school_id)
            .eq('academic_year_id', y.id)
            .eq('status', 'active');
        if (!count) continue;

        const { count: sc } = await supabaseAdmin
            .from('fee_structures')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', y.school_id)
            .eq('academic_year_id', y.id);
        if (!sc) continue;

        console.log(`→ ${y.name} · school ${y.school_id}: ${count} students, ${sc} fee structures`);
        if (DRY_RUN) { console.log('   DRY_RUN: generation skipped'); continue; }
        const res = await generateFeesForAcademicYear(y.school_id, y.id, undefined);
        console.log(`   ✅ generated ${res.generated} fee payments (${res.skipped} already billed, month=${res.monthLabel})`);
    }
    console.log('Done.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

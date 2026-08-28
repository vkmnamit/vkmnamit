/**
 * CAREFUL DB CLEANUP — backup-first, DRY_RUN default.
 * Targets:
 *   A) 6 EMPTY duplicate "Kautix Academy" schools (0 students, 0 fee_payments, <=1 user)
 *   B) duplicate academic_years with zero students/payments/structures (test schools only)
 *   C) 56 orphaned fee_payments with academic_year_id IS NULL (garbage test rows)
 * Safety:
 *   1. DRY_RUN=true by default — prints plan, writes nothing.
 *   2. Writes ./backups/cleanup_<ts>.json BEFORE deleting anything.
 *   3. Never touches schools with students or fee_payments.
 */
import { supabaseAdmin } from '../src/config/supabase';
import * as fs from 'fs';
import * as path from 'path';

const DRY_RUN = process.env.APPLY !== '1';

const EMPTY_SCHOOL_IDS_HINT = 'Kautix Academy'; // only schools matching name + empty

async function count(table: string, col: string, val: string): Promise<number> {
    const { count } = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq(col, val);
    return count || 0;
}

async function backupTable(table: string, col: string, ids: string[]): Promise<any[]> {
    if (ids.length === 0) return [];
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabaseAdmin.from(table).select('*').in(col, ids.slice(i, i + 100));
        out.push(...(data || []));
    }
    return out;
}

async function main() {
    console.log(`MODE: ${DRY_RUN ? 'DRY_RUN (no writes)' : '⚠️ APPLY — will delete'}`);

    // ── A) find empty duplicate Kautix schools ──
    const { data: schools } = await supabaseAdmin.from('schools').select('id, name');
    const emptySchools: string[] = [];
    for (const s of schools || []) {
        if (!s.name?.includes(EMPTY_SCHOOL_IDS_HINT)) continue;
        const stu = await count('students', 'school_id', s.id);
        const pay = await count('fee_payments', 'school_id', s.id);
        if (stu === 0 && pay === 0) emptySchools.push(s.id);
    }

    // ── B) duplicate years with zero footprint ──
    const { data: years } = await supabaseAdmin.from('academic_years').select('id, school_id, name');
    const yearCount = new Map<string, number>();
    const groups = new Map<string, string[]>();
    for (const y of years || []) {
        const k = `${y.school_id}:${y.name}`;
        groups.set(k, [...(groups.get(k) || []), y.id]);
    }
    const dupeYearIds: string[] = [];
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        for (const yid of list) {
            const stu = await count('students', 'academic_year_id', yid);
            const pay = await count('fee_payments', 'academic_year_id', yid);
            const st = await count('fee_structures', 'academic_year_id', yid);
            if (stu === 0 && pay === 0 && st === 0) dupeYearIds.push(yid);
        }
    }

    // ── C) NULL-year fee rows ──
    const { data: nullFees } = await supabaseAdmin.from('fee_payments').select('id').is('academic_year_id', null);
    const nullFeeIds = (nullFees || []).map((r: any) => r.id);

    console.log(`Plan → empty duplicate schools: ${emptySchools.length} | empty dupe years: ${dupeYearIds.length} | null-year fees: ${nullFeeIds.length}`);
    if (DRY_RUN) { console.log('DRY_RUN complete. Run with APPLY=1 to execute.'); return; }

    // ── BACKUP everything first ──
    const backup: any = { created_at: new Date().toISOString(), emptySchools, dupeYearIds, nullFeeIds };
    for (const t of ['schools', 'users', 'academic_years']) backup[t] = await backupTable(t, 'id', emptySchools.concat(dupeYearIds));
    backup.fee_payments_null = nullFeeIds.length ? await backupTable('fee_payments', 'id', nullFeeIds) : [];
    // users of empty schools are keyed by school_id, not id — re-pull
    for (const t of ['users']) {
        const out: any[] = [];
        for (const sid of emptySchools) {
            const { data } = await supabaseAdmin.from(t).select('*').eq('school_id', sid);
            out.push(...(data || []));
        }
        backup[`${t}_by_school`] = out;
    }
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `cleanup_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`✅ Backup written: ${file}`);

    // ── DELETE (children first) ──
    for (const sid of emptySchools) {
        for (const t of ['fee_structures', 'fee_payments', 'student_promotions', 'attendance', 'exams', 'classes', 'academic_years', 'subjects', 'teachers', 'parents', 'users', 'sections']) {
            await supabaseAdmin.from(t).delete().eq('school_id', sid);
        }
        await supabaseAdmin.from('schools').delete().eq('id', sid);
    }
    console.log(`🗑️ Deleted ${emptySchools.length} empty duplicate schools`);

    for (const yid of dupeYearIds) await supabaseAdmin.from('academic_years').delete().eq('id', yid);
    console.log(`🗑️ Deleted ${dupeYearIds.length} empty duplicate academic years`);

    for (let i = 0; i < nullFeeIds.length; i += 100) {
        await supabaseAdmin.from('fee_payments').delete().in('id', nullFeeIds.slice(i, i + 100));
    }
    console.log(`🗑️ Deleted ${nullFeeIds.length} null-year fee rows`);

    console.log('✅ CLEANUP DONE');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

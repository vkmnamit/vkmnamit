/**
 * Backfill migration — creates MISSING `student_promotions` history rows for
 * students promoted via the OLD switch-year auto-rollover path.
 *
 * Why: rollover.controller.ts always wrote `student_promotions`, but the OLD
 * switch-year path in academic-years.controller.ts (auto_rollover) moved
 * students WITHOUT writing them. Those students are missing from the
 * "historical roster" feature (Class 9 2026-27 no longer lists a student now
 * in Class 10 2027-28).
 *
 * This rebuilds those records from the audit trail in `rollover_logs`:
 *  - for each COMPLETED rollover (from → to),
 *  - every current student in `to` lacking an existing promotion for that pair
 *    gets a `promoted` (or `passed_out`) record;
 *  - from_section_id is recovered as the FROM-year section whose class grade is
 *    (current grade − 1) and whose name matches the student's current section.
 *
 * Usage (from backend/): npx ts-node scripts/backfill_promotions.ts
 * DRY_RUN=true previews counts; set false to actually insert.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DRY_RUN = true; // <-- set to false to actually write
const BATCH = 400;

// Load a table filtered by equal-columns, chunked via .range() to avoid
// PostgREST URL/header limits on very large result sets.
async function loadTable(table: string, eq: Record<string, unknown>): Promise<any[]> {
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true });
  const total = count ?? 0;
  const rows: any[] = [];
  for (let from = 0; from < total; from += BATCH) {
    let q: any = supabase.from(table).select('*').range(from, from + (BATCH - 1));
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    if (data) rows.push(...data);
    if ((data?.length || 0) < BATCH) break;
  }
  return rows;
}

// Build caches of classes + sections for a given academic year.
const yearCache = new Map<string, {
  classMap: Map<string, any>;
  sectionByGradeName: Map<string, any>; // key `${grade}|${name}` -> section
  sectionById: Map<string, any>;
}>();

async function cacheYear(yearId: string) {
  if (yearCache.has(yearId)) return yearCache.get(yearId)!;
  const classes = await loadTable('classes', { academic_year_id: yearId });
  const classMap = new Map(classes.map((c: any) => [c.id, c]));
  const classIds = classes.map((c: any) => c.id);
  const sections: any[] = [];
  for (let i = 0; i < classIds.length; i += BATCH) {
    const chunk = classIds.slice(i, i + BATCH);
    const { data, error } = await supabase.from('sections').select('*').in('class_id', chunk);
    if (error) throw new Error(`sections fetch failed: ${error.message}`);
    sections.push(...(data || []));
  }
  const sectionById = new Map(sections.map((s: any) => [s.id, s]));
  const sectionByGradeName = new Map<string, any>();
  for (const s of sections) {
    const cls = classMap.get(s.class_id);
    if (cls) sectionByGradeName.set(`${cls.grade}|${s.name}`, s);
  }
  const cache = { classMap, sectionByGradeName, sectionById };
  yearCache.set(yearId, cache);
  return cache;
}

async function main() {
  console.log(`\n📦 Backfill missing student_promotions... (DRY_RUN: ${DRY_RUN ? 'YES (preview)' : 'NO (will write)'})\n`);

  const logs = await loadTable('rollover_logs', { status: 'completed' });
  if (logs.length === 0) { console.log('No completed rollover_logs found. Nothing to backfill.'); return; }
  console.log(`Found ${logs.length} completed rollover log(s).`);

  let newPromotions = 0;
  let skippedExisting = 0;

  for (const log of logs) {
    const fromId = log.from_academic_year_id;
    const toId = log.to_academic_year_id;
    if (!fromId || !toId) continue;

    // Existing promotions for this exact from→to pair → dedupe by student.
    const existing = await loadTable('student_promotions', { from_academic_year_id: fromId, to_academic_year_id: toId });
    const existingByStudent = new Set(existing.map((e: any) => e.student_id));

    const fromCache = await cacheYear(fromId);
    const toCache = await cacheYear(toId);

    // Students who currently live in the TO year (they were moved by the rollover).
    const students = await loadTable('students', { academic_year_id: toId });
    console.log(`  • rollover ${fromId}→${toId}: ${students.length} student(s) in target year`);

    const toInsert: any[] = [];
    for (const st of students) {
      if (existingByStudent.has(st.id)) { skippedExisting++; continue; }

      let promoType = 'promoted';
      let fromSectionId: string | null = null;
      let toSectionId: string | null = st.section_id || null;

      if (st.status === 'passed_out' || st.passed_out_year) {
        promoType = 'passed_out';
        toSectionId = null;
      } else if (st.section_id) {
        // Recover old section: current class grade − 1 in the from-year, same name.
        const curSec = toCache.sectionById.get(st.section_id);
        const curClass = curSec ? toCache.classMap.get(curSec.class_id) : null;
        if (curSec && curClass) {
          fromSectionId = fromCache.sectionByGradeName.get(`${curClass.grade - 1}|${curSec.name}`)?.id || null;
        }
      }

      toInsert.push({
        school_id: st.school_id,
        student_id: st.id,
        from_section_id: fromSectionId,
        to_section_id: toSectionId,
        from_academic_year_id: fromId,
        to_academic_year_id: toId,
        promotion_type: promoType,
        promoted_at: log.created_at || new Date().toISOString(),
        created_by: null,
      });
    }

    // Insert in batches.
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH);
      if (chunk.length === 0) continue;
      if (DRY_RUN) { newPromotions += chunk.length; continue; }
      const { error } = await supabase.from('student_promotions').insert(chunk);
      if (error) { console.error(`  ✗ Insert failed for ${log.id}: ${error.message}`); }
      else newPromotions += chunk.length;
    }

    if (toInsert.length > 0) {
      const kinds = toInsert.reduce<Record<string, number>>((a, r) => { a[r.promotion_type] = (a[r.promotion_type] || 0) + 1; return a; }, {});
      console.log(`  → would add ${toInsert.length} record(s) (${JSON.stringify(kinds)})`);
    }
  }

  console.log(`\n✅ Done. ${skippedExisting} existing skipped, ${newPromotions} new ${DRY_RUN ? 'WOULD be created' : 'created'}.\n`);
  if (DRY_RUN) console.log('🔁 Run with DRY_RUN=false to actually write these records.');
}

main().catch((e) => { console.error(e); process.exit(1); });
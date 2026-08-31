import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { notificationService } from '../services/notification.service';
import { generateFeesForAcademicYear } from '../services/fee_promotion.service';
import { fetchAllRows } from '../utils/supabasePagination';

/**
 * ROLLOVER CONTROLLER — BATCH-OPTIMIZED for 1k-2k+ students
 * - Groups students by target class/section → ONE bulk update per group
 * - Bulk inserts all promotions at once
 * - Runs async (fire-and-forget) so HTTP request returns immediately
 * - Pollable status via rollover_logs
 */

const SENIOR_GRADES = [13, 15]; // Class 10 (13), Class 12 (15)
const BATCH_SIZE = 500; // Supabase insert/update chunk size

export async function getRolloverPreview(req: AuthenticatedRequest, res: Response) {
    try {
        const schoolId = req.user!.school_id;
        const { fromAcademicYearId, toAcademicYearId } = req.query;
        if (!fromAcademicYearId || !toAcademicYearId) {
            return res.status(400).json({ error: 'fromAcademicYearId and toAcademicYearId are required' });
        }

        const { data: years } = await supabaseAdmin
            .from('academic_years').select('id, name, start_date, end_date')
            .in('id', [fromAcademicYearId, toAcademicYearId]).eq('school_id', schoolId);
        if (!years || years.length !== 2) return res.status(400).json({ error: 'Invalid academic years' });

        const fromYear = years.find(y => y.id === fromAcademicYearId);
        const toYear = years.find(y => y.id === toAcademicYearId);

        const { data: fromClasses } = await supabaseAdmin
            .from('classes').select('*, sections(*)')
            .eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId)
            .order('grade', { ascending: true });

        const { data: toClasses } = await supabaseAdmin
            .from('classes').select('id, name, grade')
            .eq('school_id', schoolId).eq('academic_year_id', toAcademicYearId);

        const { count: totalStudents } = await supabaseAdmin
            .from('students').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId).eq('status', 'active');

        // Paginated — a school with >1000 active students would otherwise
        // report wrong per-class counts in the rollover preview.
        const classCounts = await fetchAllRows<any>(
            supabaseAdmin
                .from('students').select('section:sections(class_id)')
                .eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId).eq('status', 'active')
        );

        const counts: Record<string, number> = {};
        (classCounts || []).forEach((s: any) => {
            const cid = s.section?.class_id;
            if (cid) counts[cid] = (counts[cid] || 0) + 1;
        });

        const toClassByGrade = new Map<number, any>();
        (toClasses || []).forEach((c: any) => toClassByGrade.set(c.grade, c));

        const preview = (fromClasses || []).map((cls: any) => {
            const grade = cls.grade;
            const nextClass = toClassByGrade.get((grade || 0) + 1);
            const isSenior = SENIOR_GRADES.includes(grade);
            return {
                classId: cls.id, className: cls.name,
                studentCount: counts[cls.id] || 0,
                nextClassName: nextClass?.name || null,
                toClassId: nextClass?.id || null,
                isSenior, sections: (cls.sections || []).length,
                action: isSenior ? 'passed_out' : (nextClass ? 'promoted' : 'needs_class_creation')
            };
        });

        const { count: fromFeesCount } = await supabaseAdmin
            .from('fee_structures').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId);

        const { count: existingToFees } = await supabaseAdmin
            .from('fee_structures').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('academic_year_id', toAcademicYearId);

        const promotedCount = preview.filter(p => p.action === 'promoted').reduce((s, p) => s + p.studentCount, 0);
        const passedOutCount = preview.filter(p => p.action === 'passed_out').reduce((s, p) => s + p.studentCount, 0);

        return res.json({
            fromYear, toYear,
            summary: {
                totalStudents: totalStudents || 0,
                willPromote: promotedCount,
                willPassOut: passedOutCount,
                classesNeedingCreation: preview.filter(p => p.action === 'needs_class_creation').length,
                feeStructuresToCopy: fromFeesCount || 0,
                existingToYearFees: existingToFees || 0
            },
            classPreview: preview
        });
    } catch (error: any) {
        console.error('Rollover preview error:', error);
        return res.status(500).json({ error: 'Failed to generate rollover preview' });
    }
}

// ── BATCH-OPTIMIZED EXECUTION ──────────────────────────────────────────
export async function executeRollover(req: AuthenticatedRequest, res: Response) {
    try {
        const schoolId = req.user!.school_id;
        const userId = req.user!.id;
        const {
            fromAcademicYearId, toAcademicYearId,
            feeIncreasePercent = 0, copyFeeStructures = true,
            copyTransport = true, promoteStudents = true, finalGradeIds = []
        } = req.body;

        if (!fromAcademicYearId || !toAcademicYearId) {
            return res.status(400).json({ error: 'fromAcademicYearId and toAcademicYearId are required' });
        }

        // Create rollover log (pending) — this is the job ID for polling
        const { data: rolloverLog, error: logErr } = await supabaseAdmin
            .from('rollover_logs')
            .insert({
                school_id: schoolId, from_academic_year_id: fromAcademicYearId,
                to_academic_year_id: toAcademicYearId, status: 'pending',
                fee_increase_percent: feeIncreasePercent, created_by: userId
            }).select().single();

        if (logErr) return res.status(400).json({ error: `Failed to create rollover log: ${logErr.message}` });
        const rolloverId = rolloverLog.id;

        // Respond immediately — run in background
        res.json({
            message: 'Rollover started in background',
            rolloverId,
            statusUrl: `/rollover/logs/${rolloverId}`
        });

        // ── BACKGROUND EXECUTION (fire-and-forget) ──
        setImmediate(async () => {
            try {
                const result = await runBatchRollover({
                    schoolId, userId, fromAcademicYearId, toAcademicYearId,
                    feeIncreasePercent, copyFeeStructures, copyTransport, promoteStudents, finalGradeIds
                });

                // ── AUTO-GENERATE FEES ON DAY 1 for all promoted students ──
                let feeGenCount = 0;
                if (copyFeeStructures && result.promoted > 0) {
                    try {
                        feeGenCount = await autoGenerateFeesOnDay1(schoolId, toAcademicYearId, userId);
                    } catch (feeErr: any) {
                        console.warn(`[ROLLOVER] Fee generation warning: ${feeErr.message}`);
                    }
                }

                await supabaseAdmin.from('rollover_logs').update({
                    status: 'completed',
                    students_promoted: result.promoted,
                    students_passed_out: result.passedOut,
                    students_repeated: result.repeated,
                    fee_structures_copied: result.feeCopied,
                    transport_assignments_copied: result.transportCopied,
                    fees_generated: feeGenCount
                }).eq('id', rolloverId);

                console.log(`[ROLLOVER] ✅ ${rolloverId}: ${result.promoted} promoted, ${result.passedOut} passed out, ${result.feeCopied} fees copied, ${feeGenCount} fee payments generated`);
            } catch (err: any) {
                console.error(`[ROLLOVER] ❌ ${rolloverId}:`, err.message);
                await supabaseAdmin.from('rollover_logs').update({
                    status: 'failed', error_message: err.message
                }).eq('id', rolloverId);
            }
        });

    } catch (error: any) {
        console.error('Rollover execution error:', error);
        return res.status(500).json({ error: 'Failed to start rollover' });
    }
}

interface RolloverJob {
    schoolId: string;
    userId: string;
    fromAcademicYearId: string;
    toAcademicYearId: string;
    feeIncreasePercent: number;
    copyFeeStructures: boolean;
    copyTransport: boolean;
    promoteStudents: boolean;
    finalGradeIds: string[];
}

async function autoGenerateFeesOnDay1(schoolId: string, academicYearId: string, userId: string): Promise<number> {
    // Delegates to the shared promotion-fee service (dedup + exemptions aware)
    const { generated } = await generateFeesForAcademicYear(schoolId, academicYearId, userId);
    return generated;
}

async function runBatchRollover(job: RolloverJob): Promise<{ promoted: number; passedOut: number; repeated: number; feeCopied: number; transportCopied: number }> {
    const { schoolId, fromAcademicYearId, toAcademicYearId, feeIncreasePercent, copyFeeStructures, copyTransport, promoteStudents, finalGradeIds } = job;

    // ── STEP 1: Load all classes (from + to) ──
    const [{ data: fromClasses }, { data: toClasses }] = await Promise.all([
        supabaseAdmin.from('classes').select('*, sections(*)').eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId),
        supabaseAdmin.from('classes').select('*, sections(*)').eq('school_id', schoolId).eq('academic_year_id', toAcademicYearId)
    ]);

    const toClassByGrade = new Map<number, any>();
    (toClasses || []).forEach((c: any) => toClassByGrade.set(c.grade || 0, c));

    // ── STEP 2: Fetch ALL students in ONE query (no per-student calls) ──
    // Paginated — Supabase caps un-paged queries at 1000 rows, so a school
    // with >1000 active students would silently skip everyone past #1000
    // during rollover (they'd never be promoted or passed out).
    const students = await fetchAllRows<any>(
        supabaseAdmin
            .from('students')
            .select('id, section_id, section:sections(id, class_id, class:classes(grade))')
            .eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId)
            .eq('status', 'active')
    );

    if (!students || students.length === 0) {
        return { promoted: 0, passedOut: 0, repeated: 0, feeCopied: 0, transportCopied: 0 };
    }

    // ── STEP 3: Group students by action (promote / pass-out / repeat) ──
    const toPromote: Array<{ id: string; fromSectionId: string; fromClassId: string; targetClass: any; sectionName: string }> = [];
    const toPassOut: Array<{ id: string; fromSectionId: string }> = [];
    const toRepeat: Array<{ id: string; fromSectionId: string; fromClassId: string }> = [];

    for (const raw of students) {
        const s: any = raw;
        const classId = s.section?.class_id;
        const gradeIdx = s.section?.class?.grade;
        const sectionId = s.section?.id;
        if (!classId || gradeIdx === undefined) continue;

        // Senior batch → pass out
        if (SENIOR_GRADES.includes(gradeIdx) || finalGradeIds.includes(classId)) {
            toPassOut.push({ id: s.id, fromSectionId: sectionId });
            continue;
        }

        // Promote to next grade
        const nextClass = toClassByGrade.get(gradeIdx + 1);
        if (!nextClass) {
            console.warn(`[ROLLOVER] No class for grade ${gradeIdx + 1}; student ${s.id} stays`);
            continue;
        }

        const sectionName = s.section?.name || 'A';
        toPromote.push({ id: s.id, fromSectionId: sectionId, fromClassId: classId, targetClass: nextClass, sectionName });
    }

    // ── STEP 4: BATCH pass-out (ONE update for all) ──
    let passedOut = 0;
    if (toPassOut.length > 0) {
        const yearObj = (await supabaseAdmin.from('academic_years').select('name').eq('id', fromAcademicYearId).single()).data;
        for (let i = 0; i < toPassOut.length; i += BATCH_SIZE) {
            const chunk = toPassOut.slice(i, i + BATCH_SIZE);
            const ids = chunk.map(c => c.id);
            await supabaseAdmin.from('students')
                .update({ status: 'passed_out', passed_out_year: yearObj?.name || String(fromAcademicYearId), section_id: null, academic_year_id: toAcademicYearId })
                .eq('school_id', schoolId).in('id', ids);
        }
        passedOut = toPassOut.length;
    }

    // ── STEP 5: BATCH promote — group by target section, ONE update per group ──
    let promoted = 0;
    if (promoteStudents && toPromote.length > 0) {
        // Group by target class + section name
        const groups = new Map<string, { classId: string; sectionName: string; studentIds: string[]; fromSectionIds: string[]; fromClassIds: string[] }>();

        for (const p of toPromote) {
            const key = `${p.targetClass.id}|${p.sectionName}`;
            if (!groups.has(key)) {
                groups.set(key, { classId: p.targetClass.id, sectionName: p.sectionName, studentIds: [], fromSectionIds: [], fromClassIds: [] });
            }
            const g = groups.get(key)!;
            g.studentIds.push(p.id);
            g.fromSectionIds.push(p.fromSectionId);
            g.fromClassIds.push(p.fromClassId);
        }

        // Resolve/create target sections in bulk
        const sectionCache = new Map<string, string>(); // key → section_id
        for (const [key, g] of groups) {
            const targetClass = toClassByGrade.get(g.classId ? (toClasses || []).find((c: any) => c.id === g.classId)?.grade : 0);
            const classObj = (toClasses || []).find((c: any) => c.id === g.classId);
            if (!classObj) continue;

            // Find existing section
            let section = classObj.sections?.find((s: any) => s.name === g.sectionName) || classObj.sections?.[0];
            if (!section) {
                const { data: ns } = await supabaseAdmin.from('sections')
                    .insert({ class_id: g.classId, name: g.sectionName, capacity: 60 }).select().single();
                section = ns;
            }
            sectionCache.set(key, section.id);
        }

        // Bulk update students per group (chunked)
        for (const [key, g] of groups) {
            const targetSectionId = sectionCache.get(key);
            if (!targetSectionId) continue;
            for (let i = 0; i < g.studentIds.length; i += BATCH_SIZE) {
                const chunk = g.studentIds.slice(i, i + BATCH_SIZE);
                await supabaseAdmin.from('students')
                    .update({ section_id: targetSectionId, academic_year_id: toAcademicYearId, status: 'active' })
                    .eq('school_id', schoolId).in('id', chunk);
            }
            promoted += g.studentIds.length;
        }

        // Bulk insert promotions (chunked)
        const promoRows = toPromote.map(p => ({
            school_id: schoolId, student_id: p.id,
            from_section_id: p.fromSectionId, to_section_id: sectionCache.get(`${p.targetClass.id}|${p.sectionName}`) || null,
            from_academic_year_id: fromAcademicYearId, to_academic_year_id: toAcademicYearId,
            promotion_type: 'promoted', created_by: job.userId
        }));
        for (let i = 0; i < promoRows.length; i += BATCH_SIZE) {
            await supabaseAdmin.from('student_promotions').insert(promoRows.slice(i, i + BATCH_SIZE));
        }
    }

    // ── STEP 6: BATCH copy fee structures ──
    let feeCopied = 0;
    if (copyFeeStructures) {
        const { data: fromFees } = await supabaseAdmin
            .from('fee_structures').select('*')
            .eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId);

        const { data: existingFees } = await supabaseAdmin
            .from('fee_structures').select('class_id, name')
            .eq('school_id', schoolId).eq('academic_year_id', toAcademicYearId);

        const existingSet = new Set((existingFees || []).map((f: any) => `${f.class_id}|${f.name}`));

        const newFees: any[] = [];
        for (const fee of fromFees || []) {
            const { data: oldClass } = await supabaseAdmin.from('classes').select('grade').eq('id', fee.class_id).single();
            if (!oldClass || SENIOR_GRADES.includes(oldClass.grade)) continue;
            const toClass = toClassByGrade.get((oldClass.grade || 0) + 1);
            if (!toClass) continue;
            if (existingSet.has(`${toClass.id}|${fee.name}`)) continue;

            const newAmount = feeIncreasePercent > 0
                ? Math.round(Number(fee.amount) * (1 + feeIncreasePercent / 100) * 100) / 100 : fee.amount;

            newFees.push({
                school_id: schoolId, academic_year_id: toAcademicYearId, class_id: toClass.id,
                name: fee.name, amount: newAmount, frequency: fee.frequency,
                due_day: fee.due_day, is_mandatory: fee.is_mandatory
            });
        }

        for (let i = 0; i < newFees.length; i += BATCH_SIZE) {
            await supabaseAdmin.from('fee_structures').insert(newFees.slice(i, i + BATCH_SIZE));
        }
        feeCopied = newFees.length;
    }

    // ── STEP 7: BATCH copy transport assignments ──
    let transportCopied = 0;
    if (copyTransport) {
        try {
            const { data: assignments } = await supabaseAdmin
                .from('transport_assignments').select('*')
                .eq('school_id', schoolId).eq('academic_year_id', fromAcademicYearId);

            const { data: existingAssignments } = await supabaseAdmin
                .from('transport_assignments').select('student_id')
                .eq('school_id', schoolId).eq('academic_year_id', toAcademicYearId);

            const existingSet = new Set((existingAssignments || []).map((a: any) => a.student_id));

            const newAssignments = (assignments || [])
                .filter((a: any) => !existingSet.has(a.student_id))
                .map((a: any) => ({
                    school_id: schoolId, academic_year_id: toAcademicYearId, student_id: a.student_id,
                    route_id: a.route_id, stop_id: a.stop_id, pickup_time: a.pickup_time,
                    drop_time: a.drop_time, monthly_fee: a.monthly_fee
                }));

            for (let i = 0; i < newAssignments.length; i += BATCH_SIZE) {
                await supabaseAdmin.from('transport_assignments').insert(newAssignments.slice(i, i + BATCH_SIZE));
            }
            transportCopied = newAssignments.length;
        } catch { console.warn('[ROLLOVER] transport_assignments may not exist, skipping'); }
    }

    return { promoted, passedOut, repeated: 0, feeCopied, transportCopied };
}

export async function revertRollover(req: AuthenticatedRequest, res: Response) {
    try {
        const schoolId = req.user!.school_id;
        const { rolloverId } = req.params;

        const { data: log } = await supabaseAdmin.from('rollover_logs').select('*').eq('id', rolloverId).eq('school_id', schoolId).single();
        if (!log) return res.status(404).json({ error: 'Rollover log not found' });
        if (log.status === 'reverted') return res.status(400).json({ error: 'Rollover already reverted' });

        const { to_academic_year_id: toYearId, from_academic_year_id: fromYearId } = log;

        // Batch revert: restore all students from promotions (paginated — a
        // whole-school rollover creates >1000 promotion rows)
        const promotions = await fetchAllRows<any>(
            supabaseAdmin
                .from('student_promotions').select('*')
                .eq('school_id', schoolId).eq('to_academic_year_id', toYearId).eq('from_academic_year_id', fromYearId)
        );

        // Group by from_section_id for batch update
        const bySection = new Map<string, string[]>();
        const passedOutIds: string[] = [];
        for (const promo of promotions || []) {
            if (promo.promotion_type === 'passed_out') {
                passedOutIds.push(promo.student_id);
            } else if (promo.from_section_id) {
                if (!bySection.has(promo.from_section_id)) bySection.set(promo.from_section_id, []);
                bySection.get(promo.from_section_id)!.push(promo.student_id);
            }
        }

        // Restore passed-out students
        for (let i = 0; i < passedOutIds.length; i += BATCH_SIZE) {
            const chunk = passedOutIds.slice(i, i + BATCH_SIZE);
            await supabaseAdmin.from('students')
                .update({ status: 'active', passed_out_year: null, academic_year_id: fromYearId })
                .eq('school_id', schoolId).in('id', chunk);
        }

        // Restore promoted students by section
        for (const [sectionId, ids] of bySection) {
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const chunk = ids.slice(i, i + BATCH_SIZE);
                await supabaseAdmin.from('students')
                    .update({ section_id: sectionId, academic_year_id: fromYearId })
                    .eq('school_id', schoolId).in('id', chunk);
            }
        }

        // Delete copied fee structures + transport in to-year
        if (log.fee_structures_copied > 0) {
            await supabaseAdmin.from('fee_structures').delete().eq('school_id', schoolId).eq('academic_year_id', toYearId);
        }
        if (log.transport_assignments_copied > 0) {
            await supabaseAdmin.from('transport_assignments').delete().eq('school_id', schoolId).eq('academic_year_id', toYearId);
        }

        // Delete promotion records
        await supabaseAdmin.from('student_promotions').delete()
            .eq('school_id', schoolId).eq('to_academic_year_id', toYearId).eq('from_academic_year_id', fromYearId);

        await supabaseAdmin.from('rollover_logs').update({ status: 'reverted', reverted_at: new Date().toISOString() }).eq('id', rolloverId);

        return res.json({ message: 'Rollover reverted successfully', studentsRestored: (promotions || []).length });
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to revert rollover' });
    }
}

export async function getRolloverLogs(req: AuthenticatedRequest, res: Response) {
    try {
        const { data, error } = await supabaseAdmin
            .from('rollover_logs').select('*, from_year:from_academic_year_id(name), to_year:to_academic_year_id(name)')
            .eq('school_id', req.user!.school_id).order('created_at', { ascending: false });
        if (error) return res.status(400).json({ error: error.message });
        return res.json(data || []);
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to fetch rollover logs' });
    }
}

export async function getRolloverStatus(req: AuthenticatedRequest, res: Response) {
    try {
        const { rolloverId } = req.params;
        const { data, error } = await supabaseAdmin
            .from('rollover_logs').select('*')
            .eq('id', rolloverId).eq('school_id', req.user!.school_id).single();
        if (error) return res.status(404).json({ error: 'Rollover not found' });
        return res.json(data);
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to fetch rollover status' });
    }
}

export async function markStudentsRepeating(req: AuthenticatedRequest, res: Response) {
    try {
        const { studentIds } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: 'studentIds must be a non-empty array' });
        }
        const { data, error } = await supabaseAdmin
            .from('students').update({ repeat_class: true })
            .eq('school_id', req.user!.school_id).in('id', studentIds).select();
        if (error) return res.status(400).json({ error: error.message });
        return res.json({ message: `${data?.length || 0} student(s) marked as repeating`, students: data });
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to mark students as repeating' });
    }
}
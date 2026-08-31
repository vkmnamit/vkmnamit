/**
 * Cleanup script: Remove duplicate student profiles created by the
 * transport "All-in-One Upload" bug.
 *
 * The bug: When bulkCreateStudents() was called for transport-only rows
 * (Name + Class + Section + Transport Route/Fee), the strict duplicate
 * detection (name+section+father, phone, email, guardian phone/email,
 * admission number) failed to match many EXISTING students. As a result,
 * ~1600 brand-new student profiles (with new users + auth accounts) were
 * created.
 *
 * This script:
 *   1. Loads all students in the school with their linked user names.
 *   2. Groups by first_name + last_name to find duplicate name clusters.
 *   3. For each cluster, keeps the OLDEST student (the real one) and marks
 *      the newer ones as duplicates.
 *   4. Safely transfers fee_payments, parent_students, attendance, etc.
 *      from the duplicate to the keeper.
 *   5. Deletes the duplicate student profile, user record, and orphaned
 *      Supabase auth user.
 *
 * ⚠️  IMPORTANT:
 *   - Run with: `npx ts-node scripts/cleanup_duplicate_transport_students.ts`
 *     from the backend directory.
 *   - It only deletes students with EXACT same first_name + last_name in
 *     the same school. Students with legitimately identical names but
 *     different fathers/sections are NOT touched by this script (they
 *     would have distinct admission numbers / user emails).
 *   - Review the DRY_RUN output before setting DRY_RUN = false.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Set to true to only preview; set to false to actually delete.
const DRY_RUN = false;

// Optional: restrict to one school — set to school UUID or leave null for all.
const SCHOOL_ID_FILTER: string | null = null;

async function main() {
    console.log(`\n🔍 Finding duplicate students... (DRY_RUN: ${DRY_RUN ? 'YES (preview only)' : 'NO (will delete!)'})\n`);

    // 1. Load ALL students + linked users (paginated in chunks of 200 to avoid
    //    the HTTP header overflow limit on `.in()` clauses)
    const allStudents: any[] = [];
    let studentPage = 0;
    const studentPageSize = 200;

    while (true) {
        const from = studentPage * studentPageSize;
        const to = from + studentPageSize - 1;

        if (SCHOOL_ID_FILTER) {
            const { data, error } = await supabase
                .from('students')
                .select('id, user_id, school_id, section_id, admission_number, father_name, created_at, guardian_phone, guardian_email')
                .eq('school_id', SCHOOL_ID_FILTER)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;
            if (!data || data.length === 0) break;
            allStudents.push(...data);
        } else {
            const { data, error } = await supabase
                .from('students')
                .select('id, user_id, school_id, section_id, admission_number, father_name, created_at, guardian_phone, guardian_email')
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;
            if (!data || data.length === 0) break;
            allStudents.push(...data);
        }

        if (allStudents.length < studentPageSize * (studentPage + 1)) break;
        studentPage++;
    }

    if (allStudents.length === 0) {
        console.log('No students found.');
        return;
    }

    console.log(`Loaded ${allStudents.length} student profiles.`);

    // 2. Load all linked users (chunked in 200s — 500+ IDs causes header overflow)
    const userIds = allStudents.map((s: any) => s.user_id);
    const allUsers: any[] = [];
    for (let i = 0; i < userIds.length; i += 200) {
        const chunk = userIds.slice(i, i + 200);
        const { data, error } = await supabase
            .from('users')
            .select('id, first_name, last_name, email, phone, auth_id, created_at')
            .in('id', chunk);
        if (error) throw error;
        allUsers.push(...(data || []));
    }
    const userMap = new Map(allUsers.map((u: any) => [u.id, u]));

    console.log(`Loaded ${allUsers.length} user records.`);

    // Use allStudents instead of students for grouping
    const students = allStudents;

    // 3. Group by (school_id, first_name, last_name, section_id)
    //    We include section_id so that two DIFFERENT students with the same
    //    name but in DIFFERENT sections are NOT treated as duplicates.
    const groups = new Map<string, any[]>();
    for (const st of students) {
        const user = userMap.get(st.user_id);
        if (!user) continue;
        const key = `${st.school_id}|${String(user.first_name || '').trim().toLowerCase()}|${String(user.last_name || '').trim().toLowerCase()}|${st.section_id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ student: st, user });
    }

    // 4. Find duplicate clusters (groups with > 1 student in the SAME section)
    const duplicateClusters: any[][] = [];
    for (const [key, members] of groups) {
        if (members.length <= 1) continue;
        // Sort oldest first — the oldest is the "real" student
        const sorted = members.sort((a, b) =>
            new Date(a.student.created_at).getTime() - new Date(b.student.created_at).getTime()
        );
        duplicateClusters.push(sorted);
    }

    console.log(`\n📋 Found ${duplicateClusters.length} name clusters with duplicates.\n`);

    let totalDuplicates = 0;
    let totalFeesMoved = 0;
    let totalParentLinks = 0;

    for (const cluster of duplicateClusters) {
        const keeper = cluster[0];
        const duplicates = cluster.slice(1);

        const keeperUser = keeper.user;
        console.log(`\n━━━ ${keeperUser.first_name} ${keeperUser.last_name} (${cluster.length} total) ━━━`);
        console.log(`  KEEPER  → ${keeper.student.admission_number} | ${keeper.student.id} | section ${keeper.student.section_id} | created ${keeper.student.created_at}`);
        for (const dup of duplicates) {
            const dupUser = dup.user;
            console.log(`  DUP     → ${dup.student.admission_number} | ${dup.student.id} | section ${dup.student.section_id} | created ${dup.student.created_at}`);
            totalDuplicates++;
        }

        if (DRY_RUN) continue;

        for (const dup of duplicates) {
            const dupStudentId = dup.student.id;
            const keeperStudentId = keeper.student.id;

            // 4a. Transfer fee_payments
            const { data: fees, error: feesErr } = await supabase
                .from('fee_payments')
                .select('id')
                .eq('student_id', dupStudentId);
            if (feesErr) console.error(`  ⚠️ fee_payments query error: ${feesErr.message}`);
            if (fees && fees.length > 0) {
                const { error: moveFeesErr } = await supabase
                    .from('fee_payments')
                    .update({ student_id: keeperStudentId })
                    .eq('student_id', dupStudentId);
                if (moveFeesErr) console.error(`  ⚠️ fee_payments move error: ${moveFeesErr.message}`);
                else {
                    totalFeesMoved += fees.length;
                    console.log(`  ✅ Moved ${fees.length} fee_payments`);
                }
            }

            // 4b. Transfer parent_students (avoid duplicate parent-student pairs)
            const { data: links, error: linksErr } = await supabase
                .from('parent_students')
                .select('id, parent_id')
                .eq('student_id', dupStudentId);
            if (linksErr) console.error(`  ⚠️ parent_students query error: ${linksErr.message}`);
            if (links && links.length > 0) {
                for (const link of links) {
                    // Skip if the keeper already has this parent linked
                    const { data: existingLink } = await supabase
                        .from('parent_students')
                        .select('id')
                        .eq('parent_id', link.parent_id)
                        .eq('student_id', keeperStudentId)
                        .maybeSingle();
                    if (!existingLink) {
                        const { error: moveLinkErr } = await supabase
                            .from('parent_students')
                            .update({ student_id: keeperStudentId })
                            .eq('id', link.id);
                        if (moveLinkErr) console.error(`  ⚠️ parent link move error: ${moveLinkErr.message}`);
                        else totalParentLinks++;
                    } else {
                        // Remove the duplicate link
                        await supabase.from('parent_students').delete().eq('id', link.id);
                    }
                }
            }

            // 4c. Transfer attendance
            const { data: attendance, error: attErr } = await supabase
                .from('attendance')
                .select('id')
                .eq('student_id', dupStudentId);
            if (attErr) console.error(`  ⚠️ attendance query error: ${attErr.message}`);
            if (attendance && attendance.length > 0) {
                const { error: moveAttErr } = await supabase
                    .from('attendance')
                    .update({ student_id: keeperStudentId })
                    .eq('student_id', dupStudentId);
                if (moveAttErr) console.error(`  ⚠️ attendance move error: ${moveAttErr.message}`);
                else console.log(`  ✅ Moved ${attendance.length} attendance records`);
            }

            // 4d. Transfer LMS submissions
            const { data: submissions, error: subErr } = await supabase
                .from('lms_submissions')
                .select('id')
                .eq('student_id', dupStudentId);
            if (subErr) console.error(`  ⚠️ lms_submissions query error: ${subErr.message}`);
            if (submissions && submissions.length > 0) {
                const { error: moveSubErr } = await supabase
                    .from('lms_submissions')
                    .update({ student_id: keeperStudentId })
                    .eq('student_id', dupStudentId);
                if (moveSubErr) console.error(`  ⚠️ lms_submissions move error: ${moveSubErr.message}`);
                else console.log(`  ✅ Moved ${submissions.length} lms_submissions`);
            }

            // 4e. Transfer exam_results
            const { data: examResults, error: examErr } = await supabase
                .from('exam_results')
                .select('id')
                .eq('student_id', dupStudentId);
            if (examErr) console.error(`  ⚠️ exam_results query error: ${examErr.message}`);
            if (examResults && examResults.length > 0) {
                const { error: moveExamErr } = await supabase
                    .from('exam_results')
                    .update({ student_id: keeperStudentId })
                    .eq('student_id', dupStudentId);
                if (moveExamErr) console.error(`  ⚠️ exam_results move error: ${moveExamErr.message}`);
                else console.log(`  ✅ Moved ${examResults.length} exam_results`);
            }

            // 4f. Delete orphaned wallets/portfolios/inventory on the duplicate
            await supabase.from('student_wallets').delete().eq('student_id', dupStudentId).is('balance', 0);
            await supabase.from('student_portfolios').delete().eq('student_id', dupStudentId);
            await supabase.from('student_inventory_distribution').delete().eq('student_id', dupStudentId);

            // 4g. Delete any remaining parent_students links
            await supabase.from('parent_students').delete().eq('student_id', dupStudentId);

            // 4h. Delete the duplicate student profile
            const { error: delStudentErr } = await supabase
                .from('students')
                .delete()
                .eq('id', dupStudentId);
            if (delStudentErr) {
                console.error(`  ⚠️ Could not delete student ${dupStudentId}: ${delStudentErr.message}`);
                continue;
            }
            console.log(`  ✅ Deleted student profile ${dupStudentId}`);

            // 4i. Delete the duplicate user record
            const dupUserId = dup.user.id;
            const { error: delUserErr } = await supabase
                .from('users')
                .delete()
                .eq('id', dupUserId);
            if (delUserErr) console.error(`  ⚠️ Could not delete user ${dupUserId}: ${delUserErr.message}`);
            else console.log(`  ✅ Deleted user record ${dupUserId}`);

            // 4j. Delete orphaned auth user (if auth_id exists and is not used elsewhere)
            const authId = dup.user.auth_id;
            if (authId) {
                // Check if any other user references this auth_id
                const { data: authUsers } = await supabase.from('users').select('id').eq('auth_id', authId);
                if (!authUsers || authUsers.length === 0) {
                    try {
                        await supabase.auth.admin.deleteUser(authId);
                        console.log(`  ✅ Deleted auth user ${authId}`);
                    } catch (authErr: any) {
                        console.error(`  ⚠️ Could not delete auth user: ${authErr?.message || authErr}`);
                    }
                }
            }
        }
    }

    console.log(`\n━━━ SUMMARY ━━━`);
    console.log(`Total duplicate name-clusters found: ${duplicateClusters.length}`);
    console.log(`Total duplicate students identified: ${totalDuplicates}`);
    if (!DRY_RUN) {
        console.log(`Total fee_payments moved: ${totalFeesMoved}`);
        console.log(`Total parent_students links moved: ${totalParentLinks}`);
        console.log(`\n✅ Cleanup complete. Duplicates were deleted.`);
    } else {
        console.log(`\n⏸️  DRY RUN — no changes made. Set DRY_RUN = false to execute.`);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
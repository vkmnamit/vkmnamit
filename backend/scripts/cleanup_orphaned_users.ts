/**
 * Cleanup script: Delete orphaned user records left behind by the
 * duplicate-student cleanup. These users couldn't be deleted because
 * of the `notification_logs_user_id_fkey` foreign key constraint.
 *
 * This script:
 *   1. Finds users with role='student' that have NO student profile.
 *   2. Deletes their notification_logs, user_notifications, and other
 *      FK-linked records.
 *   3. Deletes the user record itself.
 *   4. Deletes the orphaned Supabase auth user (if auth_id exists).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('\n🧹 Cleaning up orphaned user records...\n');

    // 1. Find orphaned student users (users with role='student' but no student profile)
    const { data: orphanedUsers, error: findErr } = await supabase
        .from('users')
        .select('id, email, auth_id, role, created_at')
        .eq('role', 'student');

    if (findErr) throw findErr;
    if (!orphanedUsers || orphanedUsers.length === 0) {
        console.log('No student users found.');
        return;
    }

    // Check which ones have no student profile
    const userIds = orphanedUsers.map(u => u.id);
    const existingStudentUserIds = new Set<string>();

    for (let i = 0; i < userIds.length; i += 200) {
        const chunk = userIds.slice(i, i + 200);
        const { data: students } = await supabase
            .from('students')
            .select('user_id')
            .in('user_id', chunk);
        (students || []).forEach((s: any) => existingStudentUserIds.add(s.user_id));
    }

    const orphans = orphanedUsers.filter(u => !existingStudentUserIds.has(u.id));
    console.log(`Found ${orphans.length} orphaned student user records.\n`);

    if (orphans.length === 0) return;

    let deletedCount = 0;
    let authDeletedCount = 0;

    for (const user of orphans) {
        const userId = user.id;

        // 2. Delete FK-linked records
        await supabase.from('notification_logs').delete().eq('user_id', userId);
        await supabase.from('user_notifications').delete().eq('user_id', userId);
        await supabase.from('audit_logs').delete().eq('user_id', userId);

        // 3. Delete the user record
        const { error: delUserErr } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (delUserErr) {
            console.error(`  ⚠️ Could not delete user ${userId} (${user.email}): ${delUserErr.message}`);
            continue;
        }

        deletedCount++;
        console.log(`  ✅ Deleted user ${userId} (${user.email})`);

        // 4. Delete the auth user
        if (user.auth_id) {
            try {
                await supabase.auth.admin.deleteUser(user.auth_id);
                authDeletedCount++;
                console.log(`  ✅ Deleted auth user ${user.auth_id}`);
            } catch (authErr: any) {
                console.error(`  ⚠️ Could not delete auth user: ${authErr?.message || authErr}`);
            }
        }
    }

    console.log(`\n━━━ SUMMARY ━━━`);
    console.log(`Orphaned users found: ${orphans.length}`);
    console.log(`Users deleted: ${deletedCount}`);
    console.log(`Auth users deleted: ${authDeletedCount}`);
    console.log('\n✅ Orphaned user cleanup complete.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
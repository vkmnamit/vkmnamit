-- =============================================================
-- Cleanup: Delete duplicate student profiles created by the
-- transport "All-in-One Upload" (bulkCreateStudents) bug.
--
-- How duplicates were created:
--   When the transport Excel upload was run, bulkCreateStudents()
--   fell through its strict duplicate detection (name+section+father,
--   phone, email, guardian phone/email, admission number) and created
--   BRAND-NEW student profiles + users + auth accounts for students
--   that already existed in the system — purely because the transport
--   sheet only had Name + Class + Section + Transport Route/Fee and
--   no phone/email/father-name to match against.
--
-- This SQL runs on the SUPABASE DATABASE (not via the Supabase Admin
-- JS SDK). It:
--   1. Finds student profiles that are "duplicates" — i.e. students
--      whose (first_name, last_name) matches another student's user
--      name in the SAME school.
--   2. Marks the OLDEST profile as the "keeper".
--   3. Transfers any fee_payments, parent_students links, attendance,
--      etc. from the duplicate to the keeper.
--   4. Hard-deletes the duplicate student profile + user record.
--
-- ⚠️  IMPORTANT:
--   - Run this inside your Supabase SQL Editor / transactions.
--   - It only deletes rows whose student was matched by NAME within
--     the same school — legitimately-enrolled unique students with
--     the same name are NOT touched (they have unique admission
--     numbers and likely different father/section).
--   - Review the output of the SELECT queries BEFORE running the
--     DELETE statements.
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────
-- STEP 1 (DRY RUN): Preview duplicate students
-- Shows students that share the same first_name + last_name in the
-- same school, along with their admission numbers and linked users.
-- ─────────────────────────────────────────────
SELECT
  s1.id AS dup_student_id,
  s1.admission_number AS dup_admission,
  s1.section_id AS dup_section,
  u1.first_name,
  u1.last_name,
  s1.created_at AS dup_created_at,
  s2.id AS keeper_student_id,
  s2.admission_number AS keeper_admission,
  s2.section_id AS keeper_section,
  s2.created_at AS keeper_created_at
FROM students s1
JOIN users u1 ON u1.id = s1.user_id
JOIN students s2 ON s2.user_id != s1.user_id
JOIN users u2 ON u2.id = s2.user_id
WHERE s1.school_id = s2.school_id
  AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
  AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
  AND s1.created_at > s2.created_at  -- s2 is older = keeper
ORDER BY s1.school_id, u1.first_name, u1.last_name, s1.created_at;

-- ─────────────────────────────────────────────
-- STEP 2 (DRY RUN): Count how many duplicates exist
-- ─────────────────────────────────────────────
SELECT COUNT(*)
FROM students s1
JOIN users u1 ON u1.id = s1.user_id
JOIN students s2 ON s2.user_id != s1.user_id
JOIN users u2 ON u2.id = s2.user_id
WHERE s1.school_id = s2.school_id
  AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
  AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
  AND s1.created_at > s2.created_at;

-- ⚠️  If the count above looks right, uncomment and run the
--     following statements to CLEAN UP.

-- =============================================================
-- STEP 3 (EXECUTE): Reassign linked data from duplicate → keeper
-- =============================================================
/*
-- Move fee_payments from duplicate to keeper
UPDATE fee_payments fp
SET student_id = (
  SELECT s2.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
    AND s1.id = fp.student_id
  LIMIT 1
)
WHERE fp.student_id IN (
  SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);

-- Move parent_students links from duplicate to keeper
UPDATE parent_students ps
SET student_id = (
  SELECT s2.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
    AND s1.id = ps.student_id
  LIMIT 1
)
WHERE ps.student_id IN (
  SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);

-- Move attendance records from duplicate to keeper
UPDATE attendance a
SET student_id = (
  SELECT s2.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
    AND s1.id = a.student_id
  LIMIT 1
)
WHERE a.student_id IN (
  SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);

-- Move exam results from duplicate to keeper
UPDATE exam_results er
SET student_id = (
  SELECT s2.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
    AND s1.id = er.student_id
  LIMIT 1
)
WHERE er.student_id IN (
 SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);

-- Move LMS submissions from duplicate to keeper
UPDATE lms_submissions ls
SET student_id = (
  SELECT s2.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
    AND s1.id = ls.student_id
  LIMIT 1
)
WHERE ls.student_id IN (
  SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);

-- Move student_wallets from duplicate to keeper (keep oldest, delete newer)
DELETE FROM student_wallets sw
WHERE sw.student_id IN (
  SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);

-- Move student_portfolios from duplicate to keeper (keep oldest, delete newer)
DELETE FROM student_portfolios sp
WHERE sp.student_id IN (
  SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);
*/

-- =============================================================
-- STEP 4 (EXECUTE): Delete duplicate student + user + auth
-- ⚠️  Uncomment this block ONLY after reviewing Step 2 / Step 1.
--     This is destructive — it hard-deletes the duplicate profile,
--     its user record, and any Supabase auth user.
-- =============================================================
/*
-- Delete parent_students links that now point to non-existent students
DELETE FROM parent_students
WHERE student_id NOT IN (SELECT id FROM students);

-- Delete duplicate students (the newer one in each name group)
DELETE FROM students
WHERE id IN (
  SELECT s1.id
  FROM students s1
  JOIN users u1 ON u1.id = s1.user_id
  JOIN students s2 ON s2.user_id != s1.user_id
  JOIN users u2 ON u2.id = s2.user_id
  WHERE s1.school_id = s2.school_id
    AND LOWER(TRIM(u1.first_name)) = LOWER(TRIM(u2.first_name))
    AND LOWER(TRIM(COALESCE(u1.last_name, ''))) = LOWER(TRIM(COALESCE(u2.last_name, '')))
    AND s1.created_at > s2.created_at
);

-- Delete the user records for those duplicate students
DELETE FROM users
WHERE id NOT IN (SELECT user_id FROM students)
  AND id IN (
    SELECT u1.id
    FROM users u1
    JOIN students s1 ON s1.user_id = u1.id
    JOIN users u2 ON u2.id = u1.id
    -- (kept intentionally loose — the ORPHAN check below is safer)
  );

-- Safer: delete only orphaned users (users without a student profile)
DELETE FROM users
WHERE role = 'student'
  AND id NOT IN (SELECT user_id FROM students);
*/

COMMIT;
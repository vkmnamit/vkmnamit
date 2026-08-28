-- ============================================================
-- DUPLICATE STUDENT CLEANUP  (run each STEP separately)
-- ============================================================

-- STEP 1: PREVIEW — see duplicate groups
SELECT
  st.school_id,
  lower(trim(usr.first_name)) AS first_name,
  lower(trim(usr.last_name))  AS last_name,
  st.date_of_birth,
  COUNT(*) AS duplicate_count,
  array_agg(st.id            ORDER BY st.created_at ASC) AS student_ids,
  array_agg(st.admission_number ORDER BY st.created_at ASC) AS admission_numbers
FROM students st
JOIN users usr ON usr.id = st.user_id
WHERE st.date_of_birth IS NOT NULL
GROUP BY st.school_id,
         lower(trim(usr.first_name)),
         lower(trim(usr.last_name)),
         st.date_of_birth
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- ============================================================
-- STEP 2: DRY RUN — list the exact rows that WOULD be deleted
-- rn = 1 is kept (oldest); rn >= 2 are duplicates to remove
-- ============================================================
WITH ranked AS (
  SELECT
    st.id,
    usr.first_name,
    usr.last_name,
    st.date_of_birth,
    st.admission_number,
    st.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY st.school_id,
                   lower(trim(usr.first_name)),
                   lower(trim(usr.last_name)),
                   st.date_of_birth
      ORDER BY st.created_at ASC
    ) AS rn
  FROM students st
  JOIN users usr ON usr.id = st.user_id
  WHERE st.date_of_birth IS NOT NULL
)
SELECT id, first_name, last_name, date_of_birth, admission_number, created_at, rn
FROM ranked
WHERE rn >= 2
ORDER BY last_name, first_name;

-- ============================================================
-- STEP 3: DELETE — only run after confirming STEP 2 is correct
-- ============================================================

-- 3a. Remove parent_students links for duplicates
WITH ranked AS (
  SELECT
    st.id,
    ROW_NUMBER() OVER (
      PARTITION BY st.school_id,
                   lower(trim(usr.first_name)),
                   lower(trim(usr.last_name)),
                   st.date_of_birth
      ORDER BY st.created_at ASC
    ) AS rn
  FROM students st
  JOIN users usr ON usr.id = st.user_id
  WHERE st.date_of_birth IS NOT NULL
)
DELETE FROM parent_students
WHERE student_id IN (SELECT id FROM ranked WHERE rn >= 2);

-- 3b. Delete duplicate student records (oldest record kept)
WITH ranked AS (
  SELECT
    st.id,
    ROW_NUMBER() OVER (
      PARTITION BY st.school_id,
                   lower(trim(usr.first_name)),
                   lower(trim(usr.last_name)),
                   st.date_of_birth
      ORDER BY st.created_at ASC
    ) AS rn
  FROM students st
  JOIN users usr ON usr.id = st.user_id
  WHERE st.date_of_birth IS NOT NULL
)
DELETE FROM students
WHERE id IN (SELECT id FROM ranked WHERE rn >= 2);

-- VERIFY
SELECT COUNT(*) AS total_students_remaining FROM students;

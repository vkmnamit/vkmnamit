-- Prevent Duplicate Transport Route Names
-- 1. Merge students/fees into the oldest route when duplicates exist
-- 2. Delete orphan duplicates
-- 3. Add a case-insensitive unique index on (school_id, LOWER(name))

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Build a mapping from every duplicate route id -> its canonical (oldest) route id
--    Groups by (school_id, LOWER(COALESCE(name, route_name, ''))) so that
--    "North Route" and "north route" are treated as the same route.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE route_dedup_map AS
WITH grouped AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY school_id, LOWER(COALESCE(name, route_name, ''))
      ORDER BY created_at ASC, id ASC
    ) AS canonical_route_id
  FROM transport_routes
)
SELECT id AS dup_route_id, canonical_route_id
FROM grouped
WHERE id <> canonical_route_id;

-- Reassign students from duplicate routes to the canonical route
UPDATE students s
SET transport_route_id = m.canonical_route_id
FROM route_dedup_map m
WHERE s.transport_route_id = m.dup_route_id;

-- Reassign fee_payments from duplicate routes to the canonical route
UPDATE fee_payments fp
SET transport_route_id = m.canonical_route_id
FROM route_dedup_map m
WHERE fp.transport_route_id = m.dup_route_id;

-- Reassign fee_structures from duplicate routes to the canonical route
UPDATE fee_structures fs
SET transport_route_id = m.canonical_route_id
FROM route_dedup_map m
WHERE fs.transport_route_id = m.dup_route_id;

-- ---------------------------------------------------------------------------
-- 2. Delete the orphaned duplicate routes
-- ---------------------------------------------------------------------------
DELETE FROM transport_routes r
USING route_dedup_map m
WHERE r.id = m.dup_route_id;

DROP TABLE route_dedup_map;

-- ---------------------------------------------------------------------------
-- 3. Prevent future duplicates at the database level (case-insensitive)
--    "North Route" and "north route" are treated as the same route.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_transport_routes_school;
CREATE UNIQUE INDEX idx_transport_routes_school_name_unique
ON transport_routes (school_id, LOWER(COALESCE(name, route_name, '')));

COMMIT;
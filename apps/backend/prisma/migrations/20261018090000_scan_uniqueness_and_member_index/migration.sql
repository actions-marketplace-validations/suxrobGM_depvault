-- Ownership and plan-limit filters look members up by user, not by project.
CREATE INDEX IF NOT EXISTS "project_members_user_id_role_idx" ON "project_members"("user_id", "role");

-- At most one active scan per project: older duplicates were never going to finish.
UPDATE "secret_scans" s
SET "status" = 'FAILED', "completed_at" = NOW(), "error_message" = 'Superseded by a newer scan'
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "created_at" DESC, "id" DESC) AS rn
  FROM "secret_scans"
  WHERE "status" IN ('PENDING', 'RUNNING')
) ranked
WHERE s."id" = ranked."id" AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "secret_scans_one_active_per_project" ON "secret_scans"("project_id") WHERE status IN ('PENDING', 'RUNNING');

-- Concurrent syncs could insert a built-in twice. Keep the oldest row per name and move the
-- duplicates' detections onto it, dropping any the kept row already has.
-- Not ON COMMIT DROP: Prisma doesn't wrap the script in one transaction, so it would vanish at once.
CREATE TEMP TABLE "built_in_dupes" AS
SELECT p."id" AS "dupe_id", keep."id" AS "keep_id"
FROM "scan_patterns" p
JOIN (
  SELECT DISTINCT ON ("name") "id", "name"
  FROM "scan_patterns"
  WHERE "is_built_in"
  ORDER BY "name", "created_at" ASC, "id" ASC
) keep ON keep."name" = p."name" AND keep."id" <> p."id"
WHERE p."is_built_in";

DELETE FROM "secret_detections" d
USING "built_in_dupes" m
WHERE d."scan_pattern_id" = m."dupe_id"
  AND EXISTS (
    SELECT 1 FROM "secret_detections" k
    WHERE k."scan_pattern_id" = m."keep_id"
      AND k."project_id" = d."project_id"
      AND k."commit_hash" = d."commit_hash"
      AND k."file_path" = d."file_path"
      AND k."line_number" = d."line_number"
  );

UPDATE "secret_detections" d
SET "scan_pattern_id" = m."keep_id"
FROM "built_in_dupes" m
WHERE d."scan_pattern_id" = m."dupe_id";

DELETE FROM "scan_patterns" p USING "built_in_dupes" m WHERE p."id" = m."dupe_id";

DROP TABLE "built_in_dupes";

CREATE UNIQUE INDEX "scan_patterns_built_in_name_key" ON "scan_patterns"("name") WHERE is_built_in;

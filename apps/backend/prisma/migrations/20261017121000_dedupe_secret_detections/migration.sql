-- Line numbers always come from a diff hunk; older rows never lacked one, but be safe.
UPDATE "secret_detections" SET "line_number" = 0 WHERE "line_number" IS NULL;

-- Rescans re-inserted every finding. Keep one row per finding: a triaged row wins over an OPEN
-- one, then the oldest.
DELETE FROM "secret_detections" d
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "project_id", "commit_hash", "file_path", "line_number", "scan_pattern_id"
    ORDER BY ("status" <> 'OPEN') DESC, "created_at" ASC, "id" ASC
  ) AS rn
  FROM "secret_detections"
) ranked
WHERE d."id" = ranked."id" AND ranked.rn > 1;

-- DropForeignKey
ALTER TABLE "secret_detections" DROP CONSTRAINT "secret_detections_scan_pattern_id_fkey";

-- AlterTable
ALTER TABLE "secret_detections" ALTER COLUMN "line_number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "secret_detections_dedupe_key" ON "secret_detections"("project_id", "commit_hash", "file_path", "line_number", "scan_pattern_id");

-- AddForeignKey
ALTER TABLE "secret_detections" ADD CONSTRAINT "secret_detections_scan_pattern_id_fkey" FOREIGN KEY ("scan_pattern_id") REFERENCES "scan_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

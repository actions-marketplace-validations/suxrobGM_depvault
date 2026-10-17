-- Ownership lives on the OWNER membership only. Make sure every project has one before the
-- duplicate column goes away.
INSERT INTO "project_members" ("id", "project_id", "user_id", "role", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", p."owner_id", 'OWNER', NOW(), NOW()
FROM "projects" p
WHERE NOT EXISTS (
  SELECT 1 FROM "project_members" m WHERE m."project_id" = p."id" AND m."role" = 'OWNER'
)
ON CONFLICT ("project_id", "user_id") DO UPDATE SET "role" = 'OWNER', "updated_at" = NOW();

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_owner_id_fkey";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "owner_id";

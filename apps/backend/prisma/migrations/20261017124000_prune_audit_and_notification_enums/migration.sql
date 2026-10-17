-- UPLOAD/CLONE/SYNC and SECRET_ROTATION/TEAM_INVITE were never written; drop any stray rows so
-- the enum swap cannot fail.
DELETE FROM "audit_logs" WHERE "action" IN ('UPLOAD', 'CLONE', 'SYNC');
DELETE FROM "notifications" WHERE "type" IN ('SECRET_ROTATION', 'TEAM_INVITE');

-- AlterEnum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'DOWNLOAD', 'SHARE');
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";
COMMIT;

-- AlterEnum
ALTER TYPE "AuditResourceType" ADD VALUE 'PROJECT';
ALTER TYPE "AuditResourceType" ADD VALUE 'PROJECT_MEMBER';
ALTER TYPE "AuditResourceType" ADD VALUE 'INVITATION';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('VULNERABILITY_FOUND', 'ROLE_CHANGE', 'GIT_SECRET_DETECTION', 'INVITATION_RECEIVED', 'MEMBER_REMOVED');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

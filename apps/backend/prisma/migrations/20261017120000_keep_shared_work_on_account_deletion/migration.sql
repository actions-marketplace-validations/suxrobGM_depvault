-- Deleting a user keeps their work in other users' projects (author cleared) and drops what only
-- they could use: CI tokens they hold the key part of, their share links, invitations they sent.

-- DropForeignKey
ALTER TABLE "analyses" DROP CONSTRAINT "analyses_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ci_tokens" DROP CONSTRAINT "ci_tokens_created_by_fkey";

-- DropForeignKey
ALTER TABLE "project_invitations" DROP CONSTRAINT "project_invitations_invited_by_id_fkey";

-- DropForeignKey
ALTER TABLE "repo_files" DROP CONSTRAINT "repo_files_created_by_fkey";

-- DropForeignKey
ALTER TABLE "secret_scans" DROP CONSTRAINT "secret_scans_triggered_by_id_fkey";

-- DropForeignKey
ALTER TABLE "share_links" DROP CONSTRAINT "share_links_creator_id_fkey";

-- AlterTable
ALTER TABLE "analyses" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "repo_files" ALTER COLUMN "created_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "secret_scans" ALTER COLUMN "triggered_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ci_tokens" ADD CONSTRAINT "ci_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_files" ADD CONSTRAINT "repo_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_scans" ADD CONSTRAINT "secret_scans_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

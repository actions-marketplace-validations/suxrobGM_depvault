-- Clean cutover to path-only repo files: existing files, history and CI tokens are dropped
-- (agreed: no active users). Clients must re-push and re-create CI tokens.
DELETE FROM "repo_file_versions";
DELETE FROM "repo_files";
DELETE FROM "ci_tokens";

-- DropForeignKey
ALTER TABLE "apps" DROP CONSTRAINT "apps_project_id_fkey";

-- DropForeignKey
ALTER TABLE "ci_tokens" DROP CONSTRAINT "ci_tokens_app_id_fkey";

-- DropForeignKey
ALTER TABLE "repo_files" DROP CONSTRAINT "repo_files_app_id_fkey";

-- DropIndex
DROP INDEX "ci_tokens_app_id_environment_slug_idx";

-- DropIndex
DROP INDEX "repo_file_versions_repo_file_id_idx";

-- DropIndex
DROP INDEX "repo_files_app_id_idx";

-- DropIndex
DROP INDEX "repo_files_app_id_kind_idx";

-- DropIndex
DROP INDEX "repo_files_project_id_environment_slug_idx";

-- DropIndex
DROP INDEX "repo_files_project_id_relative_path_key";

-- AlterTable
ALTER TABLE "ci_tokens" DROP COLUMN "app_id",
DROP COLUMN "environment_slug",
DROP COLUMN "revoked_at",
DROP COLUMN "token_version",
ADD COLUMN     "paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "wrapped_dek" SET NOT NULL,
ALTER COLUMN "wrapped_dek_iv" SET NOT NULL,
ALTER COLUMN "wrapped_dek_tag" SET NOT NULL;

-- AlterTable
ALTER TABLE "repo_file_versions" ADD COLUMN     "content_hash" TEXT NOT NULL,
ADD COLUMN     "path" TEXT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "repo_files" DROP COLUMN "app_id",
DROP COLUMN "description",
DROP COLUMN "environment_slug",
DROP COLUMN "format",
DROP COLUMN "kind",
DROP COLUMN "mime_type",
DROP COLUMN "relative_path",
ADD COLUMN     "path" TEXT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "content_hash" SET NOT NULL;

-- DropTable
DROP TABLE "apps";

-- DropEnum
DROP TYPE "RepoFileKind";

-- CreateIndex
CREATE UNIQUE INDEX "repo_file_versions_repo_file_id_version_key" ON "repo_file_versions"("repo_file_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "repo_files_project_id_path_key" ON "repo_files"("project_id", "path");


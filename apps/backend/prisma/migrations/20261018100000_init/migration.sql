-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Ecosystem" AS ENUM ('NODEJS', 'PYTHON', 'RUST', 'DOTNET', 'GO', 'JAVA', 'KOTLIN', 'RUBY', 'PHP');

-- CreateEnum
CREATE TYPE "DependencyStatus" AS ENUM ('UP_TO_DATE', 'PATCH_UPDATE', 'MINOR_UPDATE', 'MAJOR_UPDATE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "VulnerabilitySeverity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LicensePolicy" AS ENUM ('ALLOW', 'WARN', 'BLOCK');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'DOWNLOAD', 'SHARE');

-- CreateEnum
CREATE TYPE "AuditResourceType" AS ENUM ('REPO_FILE', 'SHARE_LINK', 'CI_TOKEN', 'PROJECT', 'PROJECT_MEMBER', 'INVITATION');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VULNERABILITY_FOUND', 'ROLE_CHANGE', 'GIT_SECRET_DETECTION', 'INVITATION_RECEIVED', 'MEMBER_REMOVED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DetectionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DetectionStatus" AS ENUM ('OPEN', 'RESOLVED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShareLinkStatus" AS ENUM ('PENDING', 'VIEWED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'TEAM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'UNPAID', 'PAUSED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GITHUB');

-- CreateEnum
CREATE TYPE "DeviceCodeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "KeyGrantType" AS ENUM ('SELF', 'ECDH', 'RECOVERY');

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT,
    "ecosystem" "Ecosystem" NOT NULL,
    "health_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencies" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "current_version" TEXT NOT NULL,
    "latest_version" TEXT,
    "status" "DependencyStatus" NOT NULL DEFAULT 'UP_TO_DATE',
    "license" TEXT,
    "license_policy" "LicensePolicy" NOT NULL DEFAULT 'ALLOW',
    "is_direct" BOOLEAN NOT NULL DEFAULT true,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerabilities" (
    "id" UUID NOT NULL,
    "dependency_id" UUID NOT NULL,
    "cve_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "VulnerabilitySeverity" NOT NULL DEFAULT 'NONE',
    "fixed_in" TEXT,
    "url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "project_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource_type" "AuditResourceType" NOT NULL,
    "resource_id" UUID NOT NULL,
    "ip_address" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ci_tokens" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ip_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wrapped_dek" TEXT NOT NULL,
    "wrapped_dek_iv" TEXT NOT NULL,
    "wrapped_dek_tag" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ci_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repository_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_rules" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "license_id" TEXT NOT NULL,
    "policy" "LicensePolicy" NOT NULL DEFAULT 'WARN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_invitations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "user_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_files" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "encrypted_content" BYTEA NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "is_binary" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repo_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_file_versions" (
    "id" UUID NOT NULL,
    "repo_file_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "encrypted_content" BYTEA NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "is_binary" BOOLEAN NOT NULL DEFAULT false,
    "changed_by" UUID NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repo_file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_patterns" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "regex" TEXT NOT NULL,
    "severity" "DetectionSeverity" NOT NULL,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_scans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "triggered_by_id" UUID,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "commits_scanned" INTEGER NOT NULL DEFAULT 0,
    "detections_found" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_detections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "scan_pattern_id" UUID NOT NULL,
    "commit_hash" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "match_snippet" TEXT NOT NULL,
    "status" "DetectionStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "remediation_steps" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "encrypted_payload" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "password_hash" TEXT,
    "file_name" TEXT,
    "mime_type" TEXT,
    "status" "ShareLinkStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "viewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "is_comp" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_plans" (
    "id" UUID NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "product_id" TEXT NOT NULL,
    "price_id" TEXT NOT NULL,
    "price_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "avatar_url" TEXT,
    "github_id" TEXT,
    "github_username" TEXT,
    "github_access_token" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" TEXT,
    "password_reset_token" TEXT,
    "password_reset_expires_at" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_codes" (
    "id" UUID NOT NULL,
    "device_code" TEXT NOT NULL,
    "user_code" TEXT NOT NULL,
    "status" "DeviceCodeStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vaults" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kek_salt" TEXT NOT NULL,
    "kek_iterations" INTEGER NOT NULL DEFAULT 600000,
    "public_key" TEXT NOT NULL,
    "wrapped_private_key" TEXT NOT NULL,
    "wrapped_private_key_iv" TEXT NOT NULL,
    "wrapped_private_key_tag" TEXT NOT NULL,
    "recovery_key_hash" TEXT NOT NULL,
    "wrapped_recovery_key" TEXT NOT NULL,
    "wrapped_recovery_key_iv" TEXT NOT NULL,
    "wrapped_recovery_key_tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_key_grants" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wrapped_dek" TEXT NOT NULL,
    "wrapped_dek_iv" TEXT NOT NULL,
    "wrapped_dek_tag" TEXT NOT NULL,
    "granter_public_key" TEXT,
    "grant_type" "KeyGrantType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_key_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_project_id_created_at_idx" ON "audit_logs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "ci_tokens_token_hash_key" ON "ci_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "ci_tokens_project_id_idx" ON "ci_tokens"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_rules_project_id_license_id_key" ON "license_rules"("project_id", "license_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_role_idx" ON "project_members"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_invitations_token_key" ON "project_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "project_invitations_project_id_email_status_key" ON "project_invitations"("project_id", "email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "repo_files_project_id_path_key" ON "repo_files"("project_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "repo_file_versions_repo_file_id_version_key" ON "repo_file_versions"("repo_file_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "scan_patterns_built_in_name_key" ON "scan_patterns"("name") WHERE (is_built_in);

-- CreateIndex
CREATE UNIQUE INDEX "secret_scans_one_active_per_project" ON "secret_scans"("project_id") WHERE (status IN ('PENDING', 'RUNNING'));

-- CreateIndex
CREATE INDEX "secret_detections_project_id_status_idx" ON "secret_detections"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "secret_detections_dedupe_key" ON "secret_detections"("project_id", "commit_hash", "file_path", "line_number", "scan_pattern_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_plans_plan_key" ON "stripe_plans"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_plans_product_id_key" ON "stripe_plans"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_plans_price_id_key" ON "stripe_plans"("price_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_codes_device_code_key" ON "device_codes"("device_code");

-- CreateIndex
CREATE UNIQUE INDEX "device_codes_user_code_key" ON "device_codes"("user_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_vaults_user_id_key" ON "user_vaults"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_key_grants_project_id_user_id_grant_type_key" ON "project_key_grants"("project_id", "user_id", "grant_type");

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "dependencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_dependency_id_fkey" FOREIGN KEY ("dependency_id") REFERENCES "dependencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ci_tokens" ADD CONSTRAINT "ci_tokens_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ci_tokens" ADD CONSTRAINT "ci_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_rules" ADD CONSTRAINT "license_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_files" ADD CONSTRAINT "repo_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_files" ADD CONSTRAINT "repo_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_file_versions" ADD CONSTRAINT "repo_file_versions_repo_file_id_fkey" FOREIGN KEY ("repo_file_id") REFERENCES "repo_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_patterns" ADD CONSTRAINT "scan_patterns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_scans" ADD CONSTRAINT "secret_scans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_scans" ADD CONSTRAINT "secret_scans_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_detections" ADD CONSTRAINT "secret_detections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_detections" ADD CONSTRAINT "secret_detections_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "secret_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_detections" ADD CONSTRAINT "secret_detections_scan_pattern_id_fkey" FOREIGN KEY ("scan_pattern_id") REFERENCES "scan_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_detections" ADD CONSTRAINT "secret_detections_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vaults" ADD CONSTRAINT "user_vaults_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_key_grants" ADD CONSTRAINT "project_key_grants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_key_grants" ADD CONSTRAINT "project_key_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

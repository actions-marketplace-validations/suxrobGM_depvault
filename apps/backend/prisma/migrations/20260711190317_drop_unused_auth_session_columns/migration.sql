/*
  Warnings:

  - You are about to drop the column `last_used_at` on the `auth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `provider` on the `auth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `provider_account_id` on the `auth_sessions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "auth_sessions" DROP COLUMN "last_used_at",
DROP COLUMN "provider",
DROP COLUMN "provider_account_id";

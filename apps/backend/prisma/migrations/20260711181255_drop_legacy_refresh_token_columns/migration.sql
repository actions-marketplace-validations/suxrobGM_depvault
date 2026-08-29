/*
  Warnings:

  - You are about to drop the column `refresh_token` on the `accounts` table. All data in the column will be lost.
  - You are about to drop the column `token_family` on the `accounts` table. All data in the column will be lost.
  - Sessions issued before per-session refresh tokens are not migrated; affected users must sign in again.

*/
-- AlterTable
ALTER TABLE "accounts" DROP COLUMN "refresh_token",
DROP COLUMN "token_family";

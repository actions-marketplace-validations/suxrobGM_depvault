-- Expiry is derived from expires_at; only PENDING and VIEWED are stored. Rows moved back to
-- PENDING are past expires_at, so they still read as expired.
UPDATE "share_links" SET "status" = 'PENDING' WHERE "status" = 'EXPIRED';

CREATE TYPE "ShareLinkStatus_new" AS ENUM ('PENDING', 'VIEWED');
ALTER TABLE "share_links" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "share_links"
  ALTER COLUMN "status" TYPE "ShareLinkStatus_new" USING ("status"::text::"ShareLinkStatus_new");
ALTER TYPE "ShareLinkStatus" RENAME TO "ShareLinkStatus_old";
ALTER TYPE "ShareLinkStatus_new" RENAME TO "ShareLinkStatus";
DROP TYPE "ShareLinkStatus_old";
ALTER TABLE "share_links" ALTER COLUMN "status" SET DEFAULT 'PENDING';

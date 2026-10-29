import { cron, Patterns } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { logger } from "@/common/logger/logger";
import { PrismaClient } from "@/generated/prisma";

const UNVERIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Deletes accounts that never verified their email within the TTL. An email change also unsets
 * `emailVerified`, so accounts holding anything (projects, a vault, a subscription) are kept.
 */
export async function deleteStaleUnverifiedUsers(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - UNVERIFIED_TTL_MS);
  const { count } = await prisma.user.deleteMany({
    where: {
      emailVerified: false,
      role: "USER",
      createdAt: { lt: cutoff },
      updatedAt: { lt: cutoff },
      projectMemberships: { none: {} },
      vault: { is: null },
      subscription: { is: null },
    },
  });
  return count;
}

async function runCleanup(): Promise<void> {
  try {
    const count = await deleteStaleUnverifiedUsers(container.resolve(PrismaClient));
    if (count > 0) {
      logger.info({ count }, "Deleted stale unverified users");
    }
  } catch (error) {
    logger.error({ error }, "Unverified user cleanup job failed");
  }
}

/** Elysia plugin that purges stale unverified (mostly bot) signups daily at midnight. */
export const unverifiedUserCleanupCron = new Elysia({ name: "unverified-user-cleanup-cron" }).use(
  cron({
    name: "unverified-user-cleanup",
    pattern: Patterns.EVERY_DAY_AT_MIDNIGHT,
    catch: true,
    run: () => {
      void runCleanup();
    },
  }),
) as unknown as Elysia;

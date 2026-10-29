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

/** Job entry point for {@link deleteStaleUnverifiedUsers}. */
export async function cleanUpUnverifiedUsers(): Promise<void> {
  const count = await deleteStaleUnverifiedUsers(container.get(PrismaClient));
  if (count > 0) {
    logger.info({ count }, "Deleted stale unverified users");
  }
}

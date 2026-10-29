import { container } from "@/common/di/container";
import { logger } from "@/common/logger/logger";
import { PrismaClient } from "@/generated/prisma";

/** Purges expired auth sessions. */
export async function deleteExpiredSessions(): Promise<void> {
  const { count } = await container.get(PrismaClient).authSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  if (count > 0) {
    logger.info({ count }, "Deleted expired auth sessions");
  }
}

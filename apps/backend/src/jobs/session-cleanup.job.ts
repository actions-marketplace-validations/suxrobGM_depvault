import { cron, Patterns } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { logger } from "@/common/logger/logger";
import { PrismaClient } from "@/generated/prisma";

async function deleteExpiredSessions(): Promise<void> {
  const prisma = container.resolve(PrismaClient);

  try {
    const { count } = await prisma.authSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) {
      logger.info({ count }, "Deleted expired auth sessions");
    }
  } catch (error) {
    logger.error({ error }, "Auth session cleanup job failed");
  }
}

/** Elysia plugin that purges expired auth sessions daily at midnight. */
export const sessionCleanupCron = new Elysia({ name: "session-cleanup-cron" }).use(
  cron({
    name: "session-cleanup",
    pattern: Patterns.EVERY_DAY_AT_MIDNIGHT,
    catch: true,
    run: () => {
      void deleteExpiredSessions();
    },
  }),
) as unknown as Elysia;

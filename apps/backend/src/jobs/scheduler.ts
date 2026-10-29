import { cron, Patterns } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { logger } from "@/common/logger/logger";
import { runScheduledScans } from "./secret-scan.job";
import { deleteExpiredSessions } from "./session-cleanup.job";
import { cleanUpUnverifiedUsers } from "./unverified-user-cleanup.job";

/** Runs `job` daily at midnight; a failure is logged and never reaches the scheduler. */
function daily(name: string, job: () => Promise<void>) {
  return cron({
    name,
    pattern: Patterns.EVERY_DAY_AT_MIDNIGHT,
    catch: true,
    run: () => {
      logger.info({ job: name }, "Running scheduled job");
      job().catch((error: unknown) => logger.error({ error, job: name }, "Scheduled job failed"));
    },
  });
}

/**
 * Elysia plugin registering every background job. Cast to a bare `Elysia` because the inferred
 * type names croner's `Cron`, which the emitted declarations (Eden types) can't reference.
 */
export const scheduledJobs = new Elysia({ name: "scheduled-jobs" })
  .use(daily("secret-scan", runScheduledScans))
  .use(daily("session-cleanup", deleteExpiredSessions))
  .use(daily("unverified-user-cleanup", cleanUpUnverifiedUsers)) as unknown as Elysia;

import { sleep } from "bun";
import { cron, Patterns } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { logger } from "@/common/logger/logger";
import { PrismaClient, ProjectRole } from "@/generated/prisma";
import { SecretScanService } from "@/modules/secret-scan";
import { effectivePlan, getPlanLimits } from "@/modules/subscription/plan-limits";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DELAY_BETWEEN_SCANS_MS = 5000;

/** Projects with a repository, whose owner's plan includes scanning, not scanned in the last day. */
async function findDueProjects(prisma: PrismaClient) {
  const projects = await prisma.project.findMany({
    where: { repositoryUrl: { not: null } },
    select: {
      id: true,
      name: true,
      repositoryUrl: true,
      members: {
        where: { role: ProjectRole.OWNER },
        select: { userId: true, user: { select: { subscription: true } } },
        take: 1,
      },
      secretScans: {
        orderBy: { createdAt: "desc" },
        select: { completedAt: true },
        take: 1,
      },
    },
  });

  const oneDayAgo = new Date(Date.now() - ONE_DAY_MS);

  return projects.flatMap((project) => {
    const owner = project.members[0];
    const lastCompletedAt = project.secretScans[0]?.completedAt;
    const due = !lastCompletedAt || lastCompletedAt <= oneDayAgo;
    const plan = effectivePlan(owner?.user.subscription ?? null);

    return owner && due && getPlanLimits(plan).gitSecretScanning
      ? [
          {
            id: project.id,
            name: project.name,
            ownerId: owner.userId,
            repositoryUrl: project.repositoryUrl,
          },
        ]
      : [];
  });
}

async function runScheduledScans(): Promise<void> {
  const prisma = container.resolve(PrismaClient);
  const secretScanService = container.resolve(SecretScanService);

  try {
    for (const project of await findDueProjects(prisma)) {
      try {
        await secretScanService.startScan(project.id, project.ownerId, project.repositoryUrl);
        logger.info({ projectId: project.id, projectName: project.name }, "Scheduled scan started");
      } catch (error) {
        logger.warn({ error, projectId: project.id }, "Scheduled scan failed to start");
      }

      await sleep(DELAY_BETWEEN_SCANS_MS);
    }
  } catch (error) {
    logger.error({ error }, "Scheduled secret scan job failed");
  }
}

/** Elysia plugin that schedules daily secret scans at midnight. */
export const secretScanCron = new Elysia({ name: "secret-scan-cron" }).use(
  cron({
    name: "secret-scan",
    pattern: Patterns.EVERY_DAY_AT_MIDNIGHT,
    catch: true,
    run: () => {
      logger.info("Running scheduled secret scan job");
      void runScheduledScans();
    },
  }),
) as unknown as Elysia;

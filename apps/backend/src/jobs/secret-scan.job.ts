import { sleep } from "bun";
import { container } from "@/common/di/container";
import { logger } from "@/common/logger/logger";
import { PrismaClient, ProjectRole } from "@/generated/prisma";
import { SecretScanService } from "@/modules/secret-scan/secret-scan.service";
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

/** Starts a scan for every due project, spaced out so they don't hit GitHub at once. */
export async function runScheduledScans(): Promise<void> {
  const prisma = container.get(PrismaClient);
  const secretScanService = container.get(SecretScanService);

  for (const project of await findDueProjects(prisma)) {
    try {
      await secretScanService.startScan(project.id, project.ownerId, project.repositoryUrl);
      logger.info({ projectId: project.id, projectName: project.name }, "Scheduled scan started");
    } catch (error) {
      logger.warn({ error, projectId: project.id }, "Scheduled scan failed to start");
    }

    await sleep(DELAY_BETWEEN_SCANS_MS);
  }
}

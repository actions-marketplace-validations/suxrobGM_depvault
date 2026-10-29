import { inject, injectable } from "@needle-di/core";
import { countBySeverity } from "@/common/utils/severity";
import { DetectionStatus, PrismaClient } from "@/generated/prisma";
import type { SecurityOverviewResponse } from "./security.schema";

@injectable()
export class SecurityService {
  constructor(private readonly prisma = inject(PrismaClient)) {}

  /** Aggregate vulnerability and secret scan stats across all user's projects */
  async getOverview(userId: string): Promise<SecurityOverviewResponse> {
    const inMyProjects = { project: { members: { some: { userId } } } };

    const [projectCount, vulnCounts, totalScans, openDetections, resolvedDetections] =
      await Promise.all([
        this.prisma.projectMember.count({ where: { userId } }),
        this.prisma.vulnerability.groupBy({
          by: ["severity"],
          where: { dependency: { analysis: inMyProjects } },
          _count: true,
        }),
        this.prisma.secretScan.count({ where: inMyProjects }),
        this.prisma.secretDetection.count({
          where: { ...inMyProjects, status: DetectionStatus.OPEN },
        }),
        this.prisma.secretDetection.count({
          where: {
            ...inMyProjects,
            status: { in: [DetectionStatus.RESOLVED, DetectionStatus.FALSE_POSITIVE] },
          },
        }),
      ]);

    const severities = countBySeverity(
      vulnCounts.map((g) => ({ severity: g.severity, count: g._count })),
    );
    const total = vulnCounts.reduce((sum, g) => sum + g._count, 0);

    return {
      vulnerabilities: { ...severities, total },
      secretScans: { totalScans, openDetections, resolvedDetections },
      projectCount,
    };
  }
}

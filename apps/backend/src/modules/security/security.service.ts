import { inject, injectable } from "@needle-di/core";
import { countBySeverity } from "@/common/utils/severity";
import { DetectionStatus, PrismaClient } from "@/generated/prisma";
import type { SecurityOverviewResponse } from "./security.schema";

@injectable()
export class SecurityService {
  constructor(private readonly prisma = inject(PrismaClient)) {}

  /** Aggregate vulnerability and secret scan stats across all user's projects */
  async getOverview(userId: string): Promise<SecurityOverviewResponse> {
    const memberProjects = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });

    const projectIds = memberProjects.map((m) => m.projectId);

    if (projectIds.length === 0) {
      return {
        vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, none: 0, total: 0 },
        secretScans: { totalScans: 0, openDetections: 0, resolvedDetections: 0 },
        projectCount: 0,
      };
    }

    const [vulnCounts, totalScans, openDetections, resolvedDetections] = await Promise.all([
      this.prisma.vulnerability.groupBy({
        by: ["severity"],
        where: { dependency: { analysis: { projectId: { in: projectIds } } } },
        _count: true,
      }),
      this.prisma.secretScan.count({
        where: { projectId: { in: projectIds } },
      }),
      this.prisma.secretDetection.count({
        where: { projectId: { in: projectIds }, status: DetectionStatus.OPEN },
      }),
      this.prisma.secretDetection.count({
        where: {
          projectId: { in: projectIds },
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
      projectCount: projectIds.length,
    };
  }
}

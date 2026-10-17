import { singleton } from "tsyringe";
import { logger } from "@/common/logger/logger";
import { countBySeverity } from "@/common/utils/severity";
import { type DetectionSeverity, PrismaClient, ScanStatus } from "@/generated/prisma";
import { GitHubApiService } from "@/modules/github/github-api.service";
import { NotificationService } from "@/modules/notification/notification.service";
import { findProjectOwner } from "@/modules/project/project-ownership";
import { ScanPatternService } from "@/modules/scan-pattern/scan-pattern.service";
import { scanCommitHistory } from "./secret-scan.engine";
import { BUILT_IN_PATTERNS } from "./secret-scan.patterns";

const BUILT_IN_REMEDIATION = new Map(BUILT_IN_PATTERNS.map((p) => [p.name, p.remediation]));

/** What a background scan needs to know about the scan row and the repository. */
export interface ScanJob {
  scanId: string;
  projectId: string;
  userId: string;
  owner: string;
  repo: string;
}

/** Runs secret scans in the background and persists their findings. */
@singleton()
export class SecretScanExecutor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly githubApi: GitHubApiService,
    private readonly notificationService: NotificationService,
    private readonly scanPatterns: ScanPatternService,
  ) {}

  /**
   * Scans recent commits and stores new findings. A finding already stored for the project
   * (same commit, file, line, and pattern) is skipped, so triage decisions survive rescans and
   * only new findings notify the owner.
   */
  async execute(job: ScanJob): Promise<void> {
    const { scanId, projectId } = job;
    try {
      await this.prisma.secretScan.update({
        where: { id: scanId },
        data: { status: ScanStatus.RUNNING, startedAt: new Date() },
      });

      const patterns = await this.scanPatterns.listForProject(projectId);
      const result = await scanCommitHistory(
        this.githubApi,
        job.userId,
        job.owner,
        job.repo,
        patterns.map((p) => ({
          ...p,
          remediation: p.isBuiltIn ? (BUILT_IN_REMEDIATION.get(p.name) ?? null) : null,
        })),
      );

      const inserted = await this.prisma.secretDetection.createManyAndReturn({
        data: result.detections.map((d) => ({
          projectId,
          scanId,
          scanPatternId: d.patternId,
          commitHash: d.commitHash,
          filePath: d.filePath,
          lineNumber: d.lineNumber,
          matchSnippet: d.matchSnippet,
          remediationSteps: d.remediationSteps,
        })),
        skipDuplicates: true,
        select: { filePath: true, scanPatternId: true },
      });

      await this.prisma.secretScan.update({
        where: { id: scanId },
        data: {
          status: ScanStatus.COMPLETED,
          completedAt: new Date(),
          commitsScanned: result.commitsScanned,
          detectionsFound: inserted.length,
        },
      });

      if (inserted.length > 0) {
        const severityById = new Map(patterns.map((p) => [p.id, p.severity]));
        await this.notifyOwner(
          projectId,
          inserted.map((d) => ({
            filePath: d.filePath,
            severity: severityById.get(d.scanPatternId) ?? null,
          })),
        );
      }
    } catch (error) {
      logger.error({ error, scanId }, "Secret scan failed");
      await this.prisma.secretScan.update({
        where: { id: scanId },
        data: {
          status: ScanStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  private async notifyOwner(
    projectId: string,
    detections: { filePath: string; severity: DetectionSeverity | null }[],
  ): Promise<void> {
    const ownerId = await findProjectOwner(this.prisma, projectId);

    if (!ownerId) return;

    const { none: _, ...severityBreakdown } = countBySeverity(detections);
    void this.notificationService.notify({
      type: "GIT_SECRET_DETECTION",
      userId: ownerId,
      projectId,
      fileName: detections[0]!.filePath,
      count: detections.length,
      severityBreakdown,
    });
  }
}

import { inject, injectable } from "@needle-di/core";
import { isUniqueViolation } from "@/common/database/prisma-errors";
import { BadRequestError, ConflictError, NotFoundError } from "@/common/errors/http.error";
import { parseGitHubUrl } from "@/common/utils/github";
import { countBySeverity } from "@/common/utils/severity";
import { DetectionStatus, type Prisma, PrismaClient, ScanStatus } from "@/generated/prisma";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import { paginate, toPage } from "@/types/pagination";
import type { PaginatedResponse } from "@/types/response";
import { SecretScanExecutor } from "./secret-scan.executor";
import { DETECTION_INCLUDE, toDetectionResponse, toScanResponse } from "./secret-scan.mapper";
import type {
  BatchUpdateDetectionsBody,
  BatchUpdateDetectionsResponse,
  DetectionListQuery,
  DetectionResponse,
  ScanResponse,
  ScanSummaryResponse,
  UpdateDetectionBody,
} from "./secret-scan.schema";

/** A PENDING/RUNNING scan older than this is treated as abandoned (e.g. the server restarted). */
const STALE_SCAN_MS = 60 * 60 * 1000;

@injectable()
export class SecretScanService {
  constructor(
    private readonly prisma = inject(PrismaClient),
    private readonly executor = inject(SecretScanExecutor),
    private readonly planEnforcement = inject(PlanEnforcementService),
  ) {}

  /** Starts a background scan; rejects with 409 while another scan of the project is active. */
  async triggerScan(projectId: string, userId: string): Promise<ScanResponse> {
    const [, project] = await Promise.all([
      this.planEnforcement.enforceFeatureForProject(projectId, "gitSecretScanning"),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { repositoryUrl: true },
      }),
    ]);

    return this.startScan(projectId, userId, project?.repositoryUrl ?? null);
  }

  /**
   * Starts a scan without the plan check, for callers that have already applied it (the daily
   * job filters by plan in one query). The partial unique index on active scans is the guard
   * against concurrent starts.
   */
  async startScan(
    projectId: string,
    userId: string,
    repositoryUrl: string | null,
  ): Promise<ScanResponse> {
    if (!repositoryUrl) {
      throw new BadRequestError("Project has no connected GitHub repository");
    }

    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) {
      throw new BadRequestError("Invalid GitHub repository URL");
    }

    // A scan orphaned by a restart would otherwise hold the active-scan slot forever.
    await this.prisma.secretScan.updateMany({
      where: {
        projectId,
        status: { in: [ScanStatus.PENDING, ScanStatus.RUNNING] },
        createdAt: { lte: new Date(Date.now() - STALE_SCAN_MS) },
      },
      data: {
        status: ScanStatus.FAILED,
        completedAt: new Date(),
        errorMessage: "Scan was abandoned",
      },
    });

    const scan = await this.prisma.secretScan
      .create({ data: { projectId, triggeredById: userId, status: ScanStatus.PENDING } })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A scan is already in progress for this project");
        }
        throw error;
      });

    void this.executor.execute({
      scanId: scan.id,
      projectId,
      userId,
      owner: parsed.owner,
      repo: parsed.repo,
    });

    return toScanResponse(scan);
  }

  async listScans(
    projectId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<ScanResponse>> {
    const where = { projectId };
    const [rows, total] = await Promise.all([
      this.prisma.secretScan.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.secretScan.count({ where }),
    ]);

    return toPage(rows.map(toScanResponse), total, page, limit);
  }

  async listDetections(
    projectId: string,
    filters: DetectionListQuery,
  ): Promise<PaginatedResponse<DetectionResponse>> {
    const { page, limit, status, severity } = filters;

    const where: Prisma.SecretDetectionWhereInput = {
      projectId,
      ...(status && { status }),
      ...(severity && { scanPattern: { severity } }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.secretDetection.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
        include: DETECTION_INCLUDE,
      }),
      this.prisma.secretDetection.count({ where }),
    ]);

    return toPage(rows.map(toDetectionResponse), total, page, limit);
  }

  async updateDetectionStatus(
    projectId: string,
    detectionId: string,
    body: UpdateDetectionBody,
    userId: string,
  ): Promise<DetectionResponse> {
    const detection = await this.prisma.secretDetection.findFirst({
      where: { id: detectionId, projectId },
    });

    if (!detection) {
      throw new NotFoundError("Detection not found");
    }

    const updated = await this.prisma.secretDetection.update({
      where: { id: detectionId },
      data: {
        status: body.status,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
      include: DETECTION_INCLUDE,
    });

    return toDetectionResponse(updated);
  }

  async batchUpdateDetections(
    projectId: string,
    body: BatchUpdateDetectionsBody,
    userId: string,
  ): Promise<BatchUpdateDetectionsResponse> {
    const { count } = await this.prisma.secretDetection.updateMany({
      where: {
        id: { in: body.detectionIds },
        projectId,
        status: DetectionStatus.OPEN,
      },
      data: {
        status: body.status,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });

    return { updatedCount: count };
  }

  async getScanSummary(projectId: string): Promise<ScanSummaryResponse> {
    const [lastScan, openCounts, totalResolved] = await Promise.all([
      this.prisma.secretScan.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.secretDetection.groupBy({
        by: ["scanPatternId"],
        where: { projectId, status: DetectionStatus.OPEN },
        _count: true,
      }),
      this.prisma.secretDetection.count({
        where: {
          projectId,
          status: { in: [DetectionStatus.RESOLVED, DetectionStatus.FALSE_POSITIVE] },
        },
      }),
    ]);

    const patterns =
      openCounts.length > 0
        ? await this.prisma.scanPattern.findMany({
            where: { id: { in: openCounts.map((c) => c.scanPatternId) } },
            select: { id: true, severity: true },
          })
        : [];
    const severityById = new Map(patterns.map((p) => [p.id, p.severity]));
    const { none: _, ...severityCounts } = countBySeverity(
      openCounts.map((g) => ({
        severity: severityById.get(g.scanPatternId) ?? null,
        count: g._count,
      })),
    );

    return {
      lastScan: lastScan ? toScanResponse(lastScan) : null,
      openDetections: severityCounts,
      totalResolved,
    };
  }
}

import { singleton } from "tsyringe";
import { BadRequestError, NotFoundError } from "@/common/errors/http.error";
import { logger } from "@/common/logger/logger";
import {
  DependencyStatus,
  type Ecosystem,
  type LicensePolicy,
  type Prisma,
  PrismaClient,
} from "@/generated/prisma";
import { NotificationService } from "@/modules/notification/notification.service";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import { paginate, toPage } from "@/types/pagination";
import type { PaginatedResponse } from "@/types/response";
import type {
  AnalysisResponse,
  AnalysisSummaryResponse,
  CreateAnalysisBody,
  UpdateAnalysisBody,
} from "./analysis.schema";
import { calculateHealthScore } from "./analysis.utils";
import { resolveLicensePolicy } from "./checkers/license-utils";
import { checkVersions } from "./checkers/version-checker";
import { scanVulnerabilities, type VulnerabilityResult } from "./checkers/vulnerability-scanner";
import {
  type DependencyParser,
  dotnetParser,
  goParser,
  javaParser,
  kotlinParser,
  nodejsParser,
  phpParser,
  pythonParser,
  rubyParser,
  rustParser,
} from "./parsers";

const PARSERS: Record<Ecosystem, DependencyParser> = {
  NODEJS: nodejsParser,
  PYTHON: pythonParser,
  DOTNET: dotnetParser,
  KOTLIN: kotlinParser,
  RUST: rustParser,
  GO: goParser,
  JAVA: javaParser,
  RUBY: rubyParser,
  PHP: phpParser,
};

const INCLUDE_DEPS_WITH_VULNS = {
  dependencies: { include: { vulnerabilities: true } },
} as const;

interface DependencySource {
  name: string;
  currentVersion: string;
  isDirect: boolean;
}

/** A dependency with its check results, shaped as a nested Prisma create. */
interface CheckedDependency extends DependencySource {
  latestVersion: string | null;
  status: DependencyStatus;
  license: string | null;
  licensePolicy: LicensePolicy;
  vulnerabilities: { create: Omit<VulnerabilityResult, "packageName">[] };
}

@singleton()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationService: NotificationService,
    private readonly planEnforcement: PlanEnforcementService,
  ) {}

  /**
   * Parses a dependency file, checks versions/vulnerabilities/licenses, and stores the result,
   * replacing an earlier analysis of the same file.
   */
  async create(
    body: CreateAnalysisBody & { projectId: string },
    userId: string,
  ): Promise<AnalysisResponse> {
    await this.planEnforcement.enforceForProject(body.projectId, "analysis");

    const parser = PARSERS[body.ecosystem];
    const fileBaseName = body.fileName.split("/").pop() ?? body.fileName;

    if (!parser.canParse(fileBaseName)) {
      throw new BadRequestError(
        `Unsupported file "${body.fileName}" for ${body.ecosystem} ecosystem`,
      );
    }

    const { dependencies } = parser.parse(body.content, fileBaseName);
    const checked = await this.checkDependencies(
      dependencies.map((d) => ({ name: d.name, currentVersion: d.version, isDirect: d.isDirect })),
      body.ecosystem,
      body.projectId,
    );
    const healthScore = scoreOf(checked);

    const duplicateWhere: Prisma.AnalysisWhereInput = {
      projectId: body.projectId,
      ecosystem: body.ecosystem,
      ...(body.filePath ? { filePath: body.filePath } : { fileName: fileBaseName, filePath: null }),
    };

    const [, analysis] = await this.prisma.$transaction([
      this.prisma.analysis.deleteMany({ where: duplicateWhere }),
      this.prisma.analysis.create({
        data: {
          projectId: body.projectId,
          userId,
          fileName: fileBaseName,
          filePath: body.filePath ?? null,
          ecosystem: body.ecosystem,
          healthScore,
          dependencies: { create: checked },
        },
        include: INCLUDE_DEPS_WITH_VULNS,
      }),
    ]);

    this.notifyVulnerabilities(analysis, userId);
    return analysis;
  }

  async list(
    projectId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<AnalysisSummaryResponse>> {
    const where = { projectId };

    const [rows, total] = await Promise.all([
      this.prisma.analysis.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { dependencies: true } } },
      }),
      this.prisma.analysis.count({ where }),
    ]);

    const items = rows.map(({ _count, ...rest }) => ({
      ...rest,
      dependencyCount: _count.dependencies,
    }));
    return toPage(items, total, page, limit);
  }

  async getById(projectId: string, analysisId: string): Promise<AnalysisResponse> {
    const analysis = await this.prisma.analysis.findFirst({
      where: { id: analysisId, projectId },
      include: INCLUDE_DEPS_WITH_VULNS,
    });

    if (!analysis) {
      throw new NotFoundError("Analysis not found");
    }

    return analysis;
  }

  async delete(projectId: string, analysisId: string): Promise<{ message: string }> {
    const { count } = await this.prisma.analysis.deleteMany({
      where: { id: analysisId, projectId },
    });

    if (count === 0) {
      throw new NotFoundError("Analysis not found");
    }

    return { message: "Analysis deleted successfully" };
  }

  async updateFilePath(
    projectId: string,
    analysisId: string,
    body: UpdateAnalysisBody,
  ): Promise<AnalysisResponse> {
    const { count } = await this.prisma.analysis.updateMany({
      where: { id: analysisId, projectId },
      data: { filePath: body.filePath },
    });

    if (count === 0) {
      throw new NotFoundError("Analysis not found");
    }

    return this.getById(projectId, analysisId);
  }

  /**
   * Re-checks every dependency. Registry lookups run first; the stored dependencies are only
   * replaced once fresh results exist, in one write.
   */
  async rescan(projectId: string, analysisId: string, userId: string): Promise<AnalysisResponse> {
    const existing = await this.prisma.analysis.findFirst({
      where: { id: analysisId, projectId },
      select: {
        ecosystem: true,
        dependencies: { select: { name: true, currentVersion: true, isDirect: true } },
      },
    });

    if (!existing) {
      throw new NotFoundError("Analysis not found");
    }

    const checked = await this.checkDependencies(
      existing.dependencies,
      existing.ecosystem,
      projectId,
    );

    const analysis = await this.prisma.analysis.update({
      where: { id: analysisId },
      data: {
        healthScore: scoreOf(checked),
        dependencies: { deleteMany: {}, create: checked },
      },
      include: INCLUDE_DEPS_WITH_VULNS,
    });

    this.notifyVulnerabilities(analysis, userId);
    return analysis;
  }

  /** Runs version, vulnerability, and license checks and returns ready-to-insert rows. */
  private async checkDependencies(
    dependencies: DependencySource[],
    ecosystem: Ecosystem,
    projectId: string,
  ): Promise<CheckedDependency[]> {
    const depInputs = dependencies.map((d) => ({
      name: d.name,
      currentVersion: d.currentVersion,
    }));

    const [versionResults, vulnResults, licenseRules] = await Promise.all([
      checkVersions(depInputs, ecosystem).catch((err) => {
        logger.warn(`Version check failed: ${err}`);
        return [];
      }),
      scanVulnerabilities(depInputs, ecosystem).catch((err) => {
        logger.warn(`Vulnerability scan failed: ${err}`);
        return [];
      }),
      this.prisma.licenseRule.findMany({ where: { projectId } }),
    ]);

    const versionByName = new Map(versionResults.map((v) => [v.name, v]));
    const vulnsByName = Map.groupBy(vulnResults, (v) => v.packageName);

    return dependencies.map((dep) => {
      const version = versionByName.get(dep.name);
      const license = version?.license ?? null;

      return {
        name: dep.name,
        currentVersion: dep.currentVersion,
        isDirect: dep.isDirect,
        latestVersion: version?.latestVersion ?? null,
        status: version?.status ?? DependencyStatus.UP_TO_DATE,
        license,
        licensePolicy: resolveLicensePolicy(license, licenseRules),
        vulnerabilities: {
          create: (vulnsByName.get(dep.name) ?? []).map(({ packageName: _, ...v }) => v),
        },
      };
    });
  }

  private notifyVulnerabilities(analysis: AnalysisResponse, userId: string): void {
    const count = analysis.dependencies.reduce((n, d) => n + d.vulnerabilities.length, 0);
    if (count > 0) {
      void this.notificationService.notify({
        type: "VULNERABILITY_FOUND",
        userId,
        projectId: analysis.projectId,
        count,
      });
    }
  }
}

const scoreOf = (checked: CheckedDependency[]): number | null =>
  calculateHealthScore(checked.map((d) => ({ ...d, vulnerabilities: d.vulnerabilities.create })));

import { singleton } from "tsyringe";
import { ConflictError, NotFoundError } from "@/common/errors/http.error";
import { type LicensePolicy, type Prisma, PrismaClient } from "@/generated/prisma";
import { paginate, toPage } from "@/types/pagination";
import type {
  CreateLicenseRuleBody,
  ExportFormat,
  LicenseComplianceSummary,
  LicenseRuleResponse,
  UpdateLicenseRuleBody,
} from "./license-rule.schema";

const DEPENDENCY_SELECT = {
  name: true,
  license: true,
  licensePolicy: true,
  analysis: { select: { fileName: true } },
} as const;

type DependencyRow = Prisma.DependencyGetPayload<{ select: typeof DEPENDENCY_SELECT }>;

type PolicyCounts = Pick<
  LicenseComplianceSummary,
  "total" | "allowed" | "warned" | "blocked" | "unknown"
>;

type ComplianceReport = Omit<LicenseComplianceSummary, "pagination">;

interface LicenseReport {
  content: string;
  contentType: string;
  fileName: string;
}

const toComplianceItem = (dep: DependencyRow) => ({
  name: dep.name,
  license: dep.license,
  licensePolicy: dep.licensePolicy,
  analysisFileName: dep.analysis.fileName,
});

@singleton()
export class LicenseRuleService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(projectId: string): Promise<{ items: LicenseRuleResponse[] }> {
    const rules = await this.prisma.licenseRule.findMany({
      where: { projectId },
      orderBy: { licenseId: "asc" },
    });

    return { items: rules };
  }

  async create(projectId: string, body: CreateLicenseRuleBody): Promise<LicenseRuleResponse> {
    const existing = await this.prisma.licenseRule.findUnique({
      where: { projectId_licenseId: { projectId, licenseId: body.licenseId } },
    });

    if (existing) {
      throw new ConflictError(`Rule for license "${body.licenseId}" already exists`);
    }

    return this.prisma.licenseRule.create({
      data: { projectId, licenseId: body.licenseId, policy: body.policy },
    });
  }

  async update(
    projectId: string,
    ruleId: string,
    body: UpdateLicenseRuleBody,
  ): Promise<LicenseRuleResponse> {
    const rule = await this.prisma.licenseRule.findFirst({
      where: { id: ruleId, projectId },
    });

    if (!rule) throw new NotFoundError("License rule not found");

    return this.prisma.licenseRule.update({
      where: { id: ruleId },
      data: { policy: body.policy },
    });
  }

  async delete(projectId: string, ruleId: string): Promise<{ message: string }> {
    const rule = await this.prisma.licenseRule.findFirst({
      where: { id: ruleId, projectId },
    });

    if (!rule) throw new NotFoundError("License rule not found");

    await this.prisma.licenseRule.delete({ where: { id: ruleId } });

    return { message: "License rule deleted successfully" };
  }

  async getComplianceSummary(
    projectId: string,
    page = 1,
    limit = 25,
    search?: string,
  ): Promise<LicenseComplianceSummary> {
    const where: Prisma.DependencyWhereInput = {
      analysis: { projectId },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { license: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [counts, filteredTotal, dependencies] = await Promise.all([
      this.countByPolicy(projectId),
      this.prisma.dependency.count({ where }),
      this.prisma.dependency.findMany({
        where,
        select: DEPENDENCY_SELECT,
        orderBy: { name: "asc" },
        ...paginate(page, limit),
      }),
    ]);

    const { pagination } = toPage([], filteredTotal, page, limit);
    return { ...counts, dependencies: dependencies.map(toComplianceItem), pagination };
  }

  /** Builds a report of every dependency in the project (not just one page). */
  async exportReport(projectId: string, format: ExportFormat): Promise<LicenseReport> {
    const [counts, dependencies] = await Promise.all([
      this.countByPolicy(projectId),
      this.prisma.dependency.findMany({
        where: { analysis: { projectId } },
        select: DEPENDENCY_SELECT,
        orderBy: { name: "asc" },
      }),
    ]);

    const report = { ...counts, dependencies: dependencies.map(toComplianceItem) };
    return format === "csv" ? this.generateCsvReport(report) : this.generateTextReport(report);
  }

  /** Totals per policy; a dependency without a detected license counts as unknown. */
  private async countByPolicy(projectId: string): Promise<PolicyCounts> {
    const [groups, unknown] = await Promise.all([
      this.prisma.dependency.groupBy({
        by: ["licensePolicy"],
        where: { analysis: { projectId }, license: { not: null } },
        _count: true,
      }),
      this.prisma.dependency.count({ where: { analysis: { projectId }, license: null } }),
    ]);

    const countOf = (policy: LicensePolicy) =>
      groups.find((g) => g.licensePolicy === policy)?._count ?? 0;
    const allowed = countOf("ALLOW");
    const warned = countOf("WARN");
    const blocked = countOf("BLOCK");

    return { total: allowed + warned + blocked + unknown, allowed, warned, blocked, unknown };
  }

  private generateCsvReport(summary: ComplianceReport): LicenseReport {
    const header = "Dependency,License,Policy,Analysis File";
    const rows = summary.dependencies.map(
      (d) =>
        `"${this.escapeCsv(d.name)}","${this.escapeCsv(d.license ?? "Unknown")}","${d.licensePolicy}","${this.escapeCsv(d.analysisFileName)}"`,
    );

    const summaryRows = [
      "",
      "Summary",
      `Total Dependencies,${summary.total}`,
      `Allowed,${summary.allowed}`,
      `Warned,${summary.warned}`,
      `Blocked,${summary.blocked}`,
      `Unknown License,${summary.unknown}`,
    ];

    const content = [header, ...rows, ...summaryRows].join("\n");

    return {
      content,
      contentType: "text/csv",
      fileName: "license-audit-report.csv",
    };
  }

  private generateTextReport(summary: ComplianceReport): LicenseReport {
    const lines = [
      "LICENSE AUDIT REPORT",
      "=".repeat(60),
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "SUMMARY",
      "-".repeat(40),
      `Total Dependencies: ${summary.total}`,
      `Allowed:            ${summary.allowed}`,
      `Warned:             ${summary.warned}`,
      `Blocked:            ${summary.blocked}`,
      `Unknown License:    ${summary.unknown}`,
      "",
      "DEPENDENCIES",
      "-".repeat(40),
      "",
    ];

    for (const dep of summary.dependencies) {
      lines.push(
        `${dep.name} | ${dep.license ?? "Unknown"} | ${dep.licensePolicy} | ${dep.analysisFileName}`,
      );
    }

    return {
      content: lines.join("\n"),
      contentType: "text/plain",
      fileName: "license-audit-report.txt",
    };
  }

  private escapeCsv(value: string): string {
    return value.replace(/"/g, '""');
  }
}

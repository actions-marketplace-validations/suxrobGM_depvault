import { singleton } from "tsyringe";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/common/errors/http.error";
import { PrismaClient, type ScanPattern } from "@/generated/prisma";
import { BUILT_IN_PATTERNS } from "@/modules/secret-scan/secret-scan.patterns";
import type { CreatePatternBody, PatternResponse, UpdatePatternBody } from "./scan-pattern.schema";

const toResponse = (p: ScanPattern): PatternResponse => ({
  id: p.id,
  projectId: p.projectId,
  name: p.name,
  regex: p.regex,
  severity: p.severity,
  isBuiltIn: p.isBuiltIn,
  createdAt: p.createdAt,
});

@singleton()
export class ScanPatternService {
  private builtInsSynced: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Built-in and custom patterns that apply to a project, as stored rows: built-ins are real
   * `scan_patterns` rows so detections can reference them.
   */
  async listForProject(projectId: string): Promise<ScanPattern[]> {
    await this.syncBuiltIns();
    return this.prisma.scanPattern.findMany({
      where: { OR: [{ isBuiltIn: true }, { projectId }] },
      orderBy: [{ isBuiltIn: "desc" }, { createdAt: "desc" }, { name: "asc" }],
    });
  }

  async list(projectId: string): Promise<{ items: PatternResponse[] }> {
    const patterns = await this.listForProject(projectId);
    return { items: patterns.map(toResponse) };
  }

  async create(projectId: string, body: CreatePatternBody): Promise<PatternResponse> {
    this.validateRegex(body.regex);

    const pattern = await this.prisma.scanPattern.create({
      data: {
        projectId,
        name: body.name,
        regex: body.regex,
        severity: body.severity,
        isBuiltIn: false,
      },
    });

    return toResponse(pattern);
  }

  async update(
    projectId: string,
    patternId: string,
    body: UpdatePatternBody,
  ): Promise<PatternResponse> {
    await this.findCustomPattern(projectId, patternId, "modify");

    if (body.regex) this.validateRegex(body.regex);

    const updated = await this.prisma.scanPattern.update({
      where: { id: patternId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.regex !== undefined && { regex: body.regex }),
        ...(body.severity !== undefined && { severity: body.severity }),
      },
    });

    return toResponse(updated);
  }

  /** Deletes a custom pattern together with the detections it produced. */
  async delete(projectId: string, patternId: string): Promise<{ message: string }> {
    await this.findCustomPattern(projectId, patternId, "delete");
    await this.prisma.scanPattern.delete({ where: { id: patternId } });
    return { message: "Pattern deleted successfully" };
  }

  /** Brings the stored built-ins in line with `BUILT_IN_PATTERNS`, once per process. */
  private syncBuiltIns(): Promise<void> {
    this.builtInsSynced ??= this.writeBuiltIns().catch((error: unknown) => {
      this.builtInsSynced = null;
      throw error;
    });
    return this.builtInsSynced;
  }

  private async writeBuiltIns(): Promise<void> {
    const stored = await this.prisma.scanPattern.findMany({ where: { isBuiltIn: true } });
    const byName = new Map(stored.map((p) => [p.name, p]));

    const missing = BUILT_IN_PATTERNS.filter((p) => !byName.has(p.name));
    const changed = BUILT_IN_PATTERNS.flatMap((p) => {
      const row = byName.get(p.name);
      return row && (row.regex !== p.regex || row.severity !== p.severity)
        ? [{ id: row.id, regex: p.regex, severity: p.severity }]
        : [];
    });

    await this.prisma.$transaction([
      this.prisma.scanPattern.createMany({
        data: missing.map((p) => ({
          name: p.name,
          regex: p.regex,
          severity: p.severity,
          isBuiltIn: true,
        })),
        // Another instance may insert the same built-ins first; the partial unique index on names
        // turns that race into a no-op.
        skipDuplicates: true,
      }),
      ...changed.map(({ id, ...data }) => this.prisma.scanPattern.update({ where: { id }, data })),
    ]);
  }

  private async findCustomPattern(
    projectId: string,
    patternId: string,
    action: "modify" | "delete",
  ): Promise<ScanPattern> {
    const pattern = await this.prisma.scanPattern.findFirst({
      where: { id: patternId, projectId },
    });

    if (!pattern) throw new NotFoundError("Pattern not found");
    if (pattern.isBuiltIn) throw new ForbiddenError(`Cannot ${action} built-in patterns`);

    return pattern;
  }

  private validateRegex(regex: string): void {
    try {
      new RegExp(regex);
    } catch {
      throw new BadRequestError("Invalid regular expression");
    }
  }
}

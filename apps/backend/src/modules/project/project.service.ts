import { singleton } from "tsyringe";
import { PrismaClient, type ProjectRole } from "@/generated/prisma";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import { paginate, toPage } from "@/types/pagination";
import type { PaginatedResponse } from "@/types/response";
import type {
  CreateProjectBody,
  ProjectResponse,
  ProjectStatsResponse,
  UpdateProjectBody,
} from "./project.schema";

const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  repositoryUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Project CRUD; role checks happen in the route's `projectRole` option. */
@singleton()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly planEnforcement: PlanEnforcementService,
  ) {}

  async create(body: CreateProjectBody, userId: string): Promise<ProjectResponse> {
    await this.planEnforcement.enforce(userId, "project");

    const project = await this.prisma.project.create({
      data: {
        name: body.name,
        description: body.description,
        repositoryUrl: body.repositoryUrl,
        members: { create: { userId, role: "OWNER" } },
      },
      select: PROJECT_SELECT,
    });

    return { ...project, currentUserRole: "OWNER" };
  }

  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<ProjectResponse>> {
    const where = { members: { some: { userId } } };

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: { ...PROJECT_SELECT, members: { where: { userId }, select: { role: true } } },
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.project.count({ where }),
    ]);

    const items = projects.map(({ members, ...rest }) => ({
      ...rest,
      currentUserRole: members[0]!.role,
    }));
    return toPage(items, total, page, limit);
  }

  async getById(projectId: string, role: ProjectRole): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: PROJECT_SELECT,
    });
    return { ...project, currentUserRole: role };
  }

  async update(
    projectId: string,
    body: UpdateProjectBody,
    role: ProjectRole,
  ): Promise<ProjectResponse> {
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.repositoryUrl !== undefined && { repositoryUrl: body.repositoryUrl }),
      },
      select: PROJECT_SELECT,
    });

    return { ...project, currentUserRole: role };
  }

  async delete(projectId: string): Promise<{ message: string }> {
    await this.prisma.project.delete({ where: { id: projectId } });
    return { message: "Project deleted successfully" };
  }

  async getStats(userId: string): Promise<ProjectStatsResponse> {
    const memberFilter = { members: { some: { userId } } };

    const [projectCount, dependencyCount, vulnerabilityCount, repoFileCount] = await Promise.all([
      this.prisma.project.count({ where: memberFilter }),
      this.prisma.dependency.count({
        where: { analysis: { project: memberFilter } },
      }),
      this.prisma.vulnerability.count({
        where: { dependency: { analysis: { project: memberFilter } } },
      }),
      this.prisma.repoFile.count({
        where: { project: memberFilter },
      }),
    ]);

    return { projectCount, dependencyCount, vulnerabilityCount, repoFileCount };
  }
}

import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { StringIdParamSchema } from "@/types/request";
import { MessageResponseSchema } from "@/types/response";
import {
  MemberListQuerySchema,
  MemberListResponseSchema,
  MemberParamsSchema,
  MemberResponseSchema,
  TransferOwnershipBodySchema,
  UpdateMemberRoleBodySchema,
} from "./member.schema";
import { MemberService } from "./member.service";
import {
  CreateProjectBodySchema,
  ProjectListQuerySchema,
  ProjectListResponseSchema,
  ProjectResponseSchema,
  ProjectStatsResponseSchema,
  UpdateProjectBodySchema,
} from "./project.schema";
import { ProjectService } from "./project.service";

const projectService = container.get(ProjectService);
const memberService = container.get(MemberService);

export const projectController = new Elysia({
  prefix: "/projects",
  detail: { tags: ["Projects"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .post("/", ({ body, user }) => projectService.create(body, user.id), {
    body: CreateProjectBodySchema,
    response: ProjectResponseSchema,
    detail: {
      operationId: "createProject",
      summary: "Create a new project",
      description:
        "Create a project and add the authenticated user as the owner. A project is one repository: it holds dependency analyses and encrypted repo files.",
    },
  })
  .get("/", ({ query, user }) => projectService.list(user.id, query.page, query.limit), {
    query: ProjectListQuerySchema,
    response: ProjectListResponseSchema,
    detail: {
      operationId: "listProjects",
      summary: "List projects",
      description:
        "Return a paginated list of projects where the authenticated user is a member (owner, editor, or viewer).",
    },
  })
  .get("/stats", ({ user }) => projectService.getStats(user.id), {
    response: ProjectStatsResponseSchema,
    detail: {
      operationId: "getDashboardStats",
      summary: "Get dashboard stats",
      description:
        "Return aggregate statistics across all projects the authenticated user is a member of.",
    },
  })
  .get(
    "/:id",
    ({ params, projectMember }) => projectService.getById(params.id, projectMember.role),
    {
      params: StringIdParamSchema,
      response: ProjectResponseSchema,
      projectRole: "VIEWER",
      detail: {
        operationId: "getProject",
        summary: "Get project details",
        description:
          "Return details of a specific project. The authenticated user must be a member of the project.",
      },
    },
  )
  .put(
    "/:id",
    ({ params, body, projectMember }) => projectService.update(params.id, body, projectMember.role),
    {
      params: StringIdParamSchema,
      body: UpdateProjectBodySchema,
      response: ProjectResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "updateProject",
        summary: "Update project",
        description:
          "Update project name and/or description. Only owners and editors are allowed to update.",
      },
    },
  )
  .delete("/:id", ({ params }) => projectService.delete(params.id), {
    params: StringIdParamSchema,
    response: MessageResponseSchema,
    projectRole: "OWNER",
    detail: {
      operationId: "deleteProject",
      summary: "Delete project",
      description:
        "Permanently delete a project and all associated data (analyses, files, CI tokens). Only the project owner can delete.",
    },
  })
  .get(
    "/:id/members",
    ({ params, query }) => memberService.list(params.id, query.page, query.limit),
    {
      params: StringIdParamSchema,
      query: MemberListQuerySchema,
      response: MemberListResponseSchema,
      projectRole: "VIEWER",
      detail: {
        operationId: "listMembers",
        tags: ["Members"],
        summary: "List project members",
        description:
          "Return a paginated list of all members in the project with their roles. Any project member can view the member list.",
      },
    },
  )
  .put(
    "/:id/members/:memberId",
    ({ params, body, user, clientIp }) =>
      memberService.updateRole(params.id, params.memberId, body, {
        userId: user.id,
        ipAddress: clientIp,
      }),
    {
      params: MemberParamsSchema,
      body: UpdateMemberRoleBodySchema,
      response: MemberResponseSchema,
      projectRole: "OWNER",
      detail: {
        operationId: "updateMemberRole",
        tags: ["Members"],
        summary: "Update member role",
        description:
          "Update the role of a project member. Only the project owner can change member roles.",
      },
    },
  )
  .delete(
    "/:id/members/:memberId",
    ({ params, user, clientIp }) =>
      memberService.remove(params.id, params.memberId, {
        userId: user.id,
        ipAddress: clientIp,
      }),
    {
      params: MemberParamsSchema,
      response: MessageResponseSchema,
      projectRole: "OWNER",
      detail: {
        operationId: "removeMember",
        tags: ["Members"],
        summary: "Remove member from project",
        description:
          "Remove a member from the project. Only the project owner can remove members. The owner cannot be removed.",
      },
    },
  )
  .post(
    "/:id/transfer",
    ({ params, body, projectMember, clientIp }) =>
      memberService.transferOwnership(params.id, body, projectMember.id, {
        userId: projectMember.userId,
        ipAddress: clientIp,
      }),
    {
      params: StringIdParamSchema,
      body: TransferOwnershipBodySchema,
      response: MessageResponseSchema,
      projectRole: "OWNER",
      detail: {
        operationId: "transferProjectOwnership",
        tags: ["Members"],
        summary: "Transfer project ownership",
        description:
          "Transfer project ownership to another member. The current owner becomes an editor. Only the current owner can transfer ownership.",
      },
    },
  );

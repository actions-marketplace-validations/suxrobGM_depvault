import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { ProjectIdParamSchema } from "@/types/request";
import { MessageResponseSchema } from "@/types/response";
import {
  AnalysisItemParamsSchema,
  AnalysisListQuerySchema,
  AnalysisListResponseSchema,
  AnalysisResponseSchema,
  CreateAnalysisBodySchema,
  UpdateAnalysisBodySchema,
} from "./analysis.schema";
import { AnalysisService } from "./analysis.service";

const analysisService = container.get(AnalysisService);

export const analysisController = new Elysia({
  prefix: "/projects/:id/analyses",
  detail: { tags: ["Analyses"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get("/", ({ params, query }) => analysisService.list(params.id, query.page, query.limit), {
    params: ProjectIdParamSchema,
    query: AnalysisListQuerySchema,
    response: AnalysisListResponseSchema,
    projectRole: "VIEWER",
    detail: {
      operationId: "listAnalyses",
      summary: "List project analyses",
      description:
        "Return a paginated list of analyses for a specific project. The authenticated user must be a member of the project.",
    },
  })
  .get("/:analysisId", ({ params }) => analysisService.getById(params.id, params.analysisId), {
    params: AnalysisItemParamsSchema,
    response: AnalysisResponseSchema,
    projectRole: "VIEWER",
    detail: {
      operationId: "getAnalysis",
      summary: "Get analysis details",
      description:
        "Return analysis details with all parsed dependencies. The authenticated user must be a member of the project.",
    },
  })
  .post(
    "/",
    ({ params, body, projectMember }) =>
      analysisService.create({ ...body, projectId: params.id }, projectMember.userId),
    {
      params: ProjectIdParamSchema,
      body: CreateAnalysisBodySchema,
      response: AnalysisResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "createAnalysis",
        summary: "Create analysis",
        description:
          "Parse a dependency file and store the analysis results. Accepts file content, ecosystem type, and project ID. Supports Node.js (package.json, package-lock.json) and Python (requirements.txt, pyproject.toml).",
      },
    },
  )
  .patch(
    "/:analysisId",
    ({ params, body }) => analysisService.updateFilePath(params.id, params.analysisId, body),
    {
      params: AnalysisItemParamsSchema,
      body: UpdateAnalysisBodySchema,
      response: AnalysisResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "updateAnalysis",
        summary: "Update analysis",
        description:
          "Update analysis metadata such as file path. Only owners and editors can update.",
      },
    },
  )
  .post(
    "/:analysisId/rescan",
    ({ params, projectMember }) =>
      analysisService.rescan(params.id, params.analysisId, projectMember.userId),
    {
      params: AnalysisItemParamsSchema,
      response: AnalysisResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "rescanAnalysis",
        summary: "Rescan analysis",
        description:
          "Re-check version updates and vulnerabilities for all dependencies in an existing analysis.",
      },
    },
  )
  .delete("/:analysisId", ({ params }) => analysisService.delete(params.id, params.analysisId), {
    params: AnalysisItemParamsSchema,
    response: MessageResponseSchema,
    projectRole: "EDITOR",
    detail: {
      operationId: "deleteAnalysis",
      summary: "Delete analysis",
      description:
        "Delete an analysis and all its dependencies. Only owners and editors can delete analyses.",
    },
  });

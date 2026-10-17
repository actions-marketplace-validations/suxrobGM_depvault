import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { getClientIp } from "@/common/utils/ip";
import { StringIdParamSchema } from "@/types/request";
import {
  ApplyRepoFileChangesBodySchema,
  ApplyRepoFileChangesResponseSchema,
  DownloadRepoFilesBodySchema,
  RepoFileContentListResponseSchema,
  RepoFileContentResponseSchema,
  RepoFileListResponseSchema,
  RepoFileParamsSchema,
  RepoFileVersionContentResponseSchema,
  RepoFileVersionListResponseSchema,
  RepoFileVersionParamsSchema,
} from "./repo-file.schema";
import { RepoFileService } from "./repo-file.service";

const repoFileService = container.resolve(RepoFileService);

export const repoFileController = new Elysia({
  prefix: "/projects/:id/files",
  detail: { tags: ["Files"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get("/", ({ params }) => repoFileService.list(params.id), {
    params: StringIdParamSchema,
    response: RepoFileListResponseSchema,
    projectRole: "VIEWER",
    detail: {
      operationId: "listRepoFiles",
      summary: "List repo files",
      description:
        "List metadata of every file in a project, sorted by path. Includes `version` and the keyed `contentHash`, so clients can detect changes and renames without downloading content.",
    },
  })
  .post(
    "/download",
    ({ params, body, projectMember, request, server }) =>
      repoFileService.download(
        params.id,
        body.fileIds,
        projectMember.userId,
        getClientIp(request, server),
      ),
    {
      params: StringIdParamSchema,
      body: DownloadRepoFilesBodySchema,
      response: RepoFileContentListResponseSchema,
      projectRole: "VIEWER",
      detail: {
        operationId: "downloadRepoFiles",
        summary: "Download repo files",
        description:
          "Return the client-encrypted content of several files in one request. Unknown ids are skipped.",
      },
    },
  )
  .get(
    "/:fileId",
    ({ params, projectMember, request, server }) =>
      repoFileService.getContent(
        params.id,
        params.fileId,
        projectMember.userId,
        getClientIp(request, server),
      ),
    {
      params: RepoFileParamsSchema,
      response: RepoFileContentResponseSchema,
      projectRole: "VIEWER",
      detail: {
        operationId: "getRepoFile",
        summary: "Get a repo file",
        description: "Return a file's client-encrypted content. Decryption happens client-side.",
      },
    },
  )
  .get(
    "/:fileId/versions",
    ({ params }) => repoFileService.listVersions(params.id, params.fileId),
    {
      params: RepoFileParamsSchema,
      response: RepoFileVersionListResponseSchema,
      projectRole: "VIEWER",
      detail: {
        operationId: "listRepoFileVersions",
        summary: "List repo file versions",
        description:
          "List every version of a file, newest first. The first item is the current one.",
      },
    },
  )
  .get(
    "/:fileId/versions/:version",
    ({ params }) => repoFileService.getVersionContent(params.id, params.fileId, params.version),
    {
      params: RepoFileVersionParamsSchema,
      response: RepoFileVersionContentResponseSchema,
      projectRole: "VIEWER",
      detail: {
        operationId: "getRepoFileVersion",
        summary: "Get a repo file version",
        description:
          "Return the client-encrypted content of one version. To restore it, send it back as a normal change.",
      },
    },
  )
  .post(
    "/changes",
    ({ params, body, projectMember, request, server }) =>
      repoFileService.applyChanges(
        params.id,
        projectMember.userId,
        body,
        getClientIp(request, server),
      ),
    {
      params: StringIdParamSchema,
      body: ApplyRepoFileChangesBodySchema,
      response: ApplyRepoFileChangesResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "applyRepoFileChanges",
        summary: "Apply repo file changes",
        description:
          "Atomically create, update, move (change `path`) and delete files. Changes to existing files must send the `baseVersion` they were based on; if any file changed in between, nothing is applied and 409 is returned. Executable file types are rejected. Only owners and editors can change files.",
      },
    },
  );

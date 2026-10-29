import { displayName } from "@depvault/shared/utils";
import { inject, injectable } from "@needle-di/core";
import { BadRequestError } from "@/common/errors/http.error";
import type { AuditAction } from "@/generated/prisma";
import type { CreateAuditLogParams } from "@/modules/audit-log/audit-log.service";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import {
  toRepoFileContentResponse,
  toRepoFileResponse,
  toRepoFileVersionResponse,
} from "./repo-file.mapper";
import { RepoFileRepository } from "./repo-file.repository";
import type {
  ApplyRepoFileChangesBody,
  ApplyRepoFileChangesResponse,
  RepoFileChange,
  RepoFileContentListResponse,
  RepoFileContentResponse,
  RepoFileListResponse,
  RepoFileVersionContentResponse,
  RepoFileVersionListResponse,
} from "./repo-file.schema";
import { validateChange } from "./repo-file.validator";

type AuditMetadata = Record<string, string | null>;

/** Repo files: one encrypted blob per path, changed in atomic, version-checked batches. */
@injectable()
export class RepoFileService {
  constructor(
    private readonly repository = inject(RepoFileRepository),
    private readonly auditLogService = inject(AuditLogService),
    private readonly planEnforcement = inject(PlanEnforcementService),
  ) {}

  /** List every file's metadata in a project (no blobs), sorted by path. */
  async list(projectId: string): Promise<RepoFileListResponse> {
    const files = await this.repository.list(projectId);
    return { items: files.map(toRepoFileResponse) };
  }

  /** Return one file's ciphertext (decryption is client-side). */
  async getContent(
    projectId: string,
    fileId: string,
    userId: string,
    ipAddress: string,
  ): Promise<RepoFileContentResponse> {
    const file = await this.repository.requireFile(projectId, fileId);
    await this.auditLogService.log(
      auditEntry(userId, projectId, "READ", file.id, ipAddress, { path: file.path }),
    );
    return toRepoFileContentResponse(file);
  }

  /** Return the ciphertext of many files at once (CLI pull, web zip export). */
  async download(
    projectId: string,
    fileIds: string[],
    userId: string,
    ipAddress: string,
  ): Promise<RepoFileContentListResponse> {
    const files = await this.repository.findMany(projectId, fileIds);
    await this.auditLogService.logMany(
      files.map((file) =>
        auditEntry(userId, projectId, "DOWNLOAD", file.id, ipAddress, { path: file.path }),
      ),
    );
    return { items: files.map(toRepoFileContentResponse) };
  }

  /**
   * Apply creates, updates, moves and deletes atomically. Each change on an existing file must
   * carry the `baseVersion` it was based on; a stale one rejects the whole batch with 409.
   */
  async applyChanges(
    projectId: string,
    userId: string,
    body: ApplyRepoFileChangesBody,
    ipAddress: string,
  ): Promise<ApplyRepoFileChangesResponse> {
    body.changes.forEach(validateChange);
    assertNoDuplicates(body.changes);

    const creates = body.changes.filter((c) => !c.fileId).length;
    const deletes = body.changes.filter((c) => c.delete).length;
    if (creates > deletes) {
      await this.planEnforcement.enforceForProject(projectId, "repoFile", creates - deletes);
    }

    const applied = await this.repository.applyChanges(
      projectId,
      userId,
      body.changes,
      body.message ?? null,
    );

    await this.auditLogService.logMany([
      ...applied.files.map((file) => {
        const previousPath = applied.previousPaths.get(file.id) ?? null;
        const action: AuditAction = previousPath === null ? "CREATE" : "UPDATE";
        const moved = previousPath !== null && previousPath !== file.path;
        return auditEntry(userId, projectId, action, file.id, ipAddress, {
          path: file.path,
          ...(moved && { previousPath }),
        });
      }),
      ...applied.deletedIds.map((id) =>
        auditEntry(userId, projectId, "DELETE", id, ipAddress, {
          path: applied.previousPaths.get(id) ?? null,
        }),
      ),
    ]);

    return { files: applied.files.map(toRepoFileResponse), deletedIds: applied.deletedIds };
  }

  /** Version history (newest first), each version labelled with its own author and message. */
  async listVersions(projectId: string, fileId: string): Promise<RepoFileVersionListResponse> {
    const versions = await this.repository.listVersions(projectId, fileId);
    const names = await this.resolveNames(versions.map((v) => v.changedBy));
    return { items: versions.map((version) => toRepoFileVersionResponse(version, names)) };
  }

  /** Return a version's ciphertext; restoring is a normal change that re-sends this blob. */
  async getVersionContent(
    projectId: string,
    fileId: string,
    version: number,
  ): Promise<RepoFileVersionContentResponse> {
    const row = await this.repository.requireVersion(projectId, fileId, version);
    const names = await this.resolveNames([row.changedBy]);

    return {
      ...toRepoFileVersionResponse(row, names),
      encryptedContent: Buffer.from(row.encryptedContent).toString("base64"),
      iv: row.iv,
      authTag: row.authTag,
    };
  }

  private async resolveNames(ids: string[]): Promise<Map<string, string>> {
    const users = await this.repository.findUserNames([...new Set(ids)]);
    return new Map(users.map((u) => [u.id, displayName(u, u.email)] as const));
  }
}

function auditEntry(
  userId: string,
  projectId: string,
  action: AuditAction,
  resourceId: string,
  ipAddress: string,
  metadata: AuditMetadata,
): CreateAuditLogParams {
  return { userId, projectId, action, resourceType: "REPO_FILE", resourceId, ipAddress, metadata };
}

/** A file may appear once per batch, and two changes may not target the same path. */
function assertNoDuplicates(changes: RepoFileChange[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const change of changes) {
    if (change.fileId) {
      if (ids.has(change.fileId)) throw new BadRequestError("A file appears twice in one batch");
      ids.add(change.fileId);
    }
    if (change.path !== undefined && !change.delete) {
      if (paths.has(change.path)) {
        throw new BadRequestError(`Two changes target the same path "${change.path}"`);
      }
      paths.add(change.path);
    }
  }
}

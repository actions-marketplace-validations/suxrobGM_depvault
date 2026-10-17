import { singleton } from "tsyringe";
import { BadRequestError } from "@/common/errors/http.error";
import type { AuditAction } from "@/generated/prisma";
import { AuditLogService } from "@/modules/audit-log";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import { toRepoFileContentResponse, toRepoFileResponse } from "./repo-file.mapper";
import { RepoFileRepository } from "./repo-file.repository";
import type {
  ApplyRepoFileChangesBody,
  ApplyRepoFileChangesResponse,
  RepoFileChange,
  RepoFileContentResponse,
  RepoFileResponse,
  RepoFileVersionContentResponse,
  RepoFileVersionResponse,
} from "./repo-file.schema";
import { validateChange } from "./repo-file.validator";

/** Repo files: one encrypted blob per path, changed in atomic, version-checked batches. */
@singleton()
export class RepoFileService {
  constructor(
    private readonly repository: RepoFileRepository,
    private readonly auditLogService: AuditLogService,
    private readonly planEnforcement: PlanEnforcementService,
  ) {}

  /** List every file's metadata in a project (no blobs), sorted by path. */
  async list(projectId: string): Promise<{ items: RepoFileResponse[] }> {
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
    await this.audit(userId, projectId, "READ", file.id, ipAddress, { path: file.path });
    return toRepoFileContentResponse(file);
  }

  /** Return the ciphertext of many files at once (CLI pull, web zip export). */
  async download(
    projectId: string,
    fileIds: string[],
    userId: string,
    ipAddress: string,
  ): Promise<{ items: RepoFileContentResponse[] }> {
    const files = await this.repository.findMany(projectId, fileIds);
    await Promise.all(
      files.map((file) =>
        this.audit(userId, projectId, "DOWNLOAD", file.id, ipAddress, { path: file.path }),
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

    await Promise.all([
      ...applied.files.map((file) => {
        const previousPath = applied.previousPaths.get(file.id);
        const action: AuditAction = previousPath === undefined ? "CREATE" : "UPDATE";
        const moved = previousPath !== undefined && previousPath !== file.path;
        return this.audit(userId, projectId, action, file.id, ipAddress, {
          path: file.path,
          ...(moved && { previousPath }),
        });
      }),
      ...applied.deletedIds.map((id) =>
        this.audit(userId, projectId, "DELETE", id, ipAddress, {
          path: applied.previousPaths.get(id) ?? null,
        }),
      ),
    ]);

    return { files: applied.files.map(toRepoFileResponse), deletedIds: applied.deletedIds };
  }

  /** Version history (newest first), each version labelled with its own author and message. */
  async listVersions(
    projectId: string,
    fileId: string,
  ): Promise<{ items: RepoFileVersionResponse[] }> {
    const file = await this.repository.requireFile(projectId, fileId);
    const versions = await this.repository.listVersions(file.id);
    const names = await this.resolveNames(versions.map((v) => v.changedBy));

    return {
      items: versions.map(({ changedBy, ...version }) => ({
        ...version,
        changedBy: { id: changedBy, name: names.get(changedBy) ?? "Deleted user" },
      })),
    };
  }

  /** Return a version's ciphertext; restoring is a normal change that re-sends this blob. */
  async getVersionContent(
    projectId: string,
    fileId: string,
    version: number,
  ): Promise<RepoFileVersionContentResponse> {
    const file = await this.repository.requireFile(projectId, fileId);
    const row = await this.repository.requireVersion(file.id, version);
    const names = await this.resolveNames([row.changedBy]);

    return {
      version: row.version,
      path: row.path,
      contentHash: row.contentHash,
      fileSize: row.fileSize,
      isBinary: row.isBinary,
      message: row.message,
      changedBy: { id: row.changedBy, name: names.get(row.changedBy) ?? "Deleted user" },
      createdAt: row.createdAt,
      encryptedContent: Buffer.from(row.encryptedContent).toString("base64"),
      iv: row.iv,
      authTag: row.authTag,
    };
  }

  private async resolveNames(ids: string[]): Promise<Map<string, string>> {
    const users = await this.repository.findUserNames([...new Set(ids)]);
    return new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email] as const),
    );
  }

  private audit(
    userId: string,
    projectId: string,
    action: AuditAction,
    resourceId: string,
    ipAddress: string,
    metadata: Record<string, string | null>,
  ): Promise<void> {
    return this.auditLogService.log({
      userId,
      projectId,
      action,
      resourceType: "REPO_FILE",
      resourceId,
      ipAddress,
      metadata,
    });
  }
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

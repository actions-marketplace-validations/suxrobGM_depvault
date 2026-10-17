import { singleton } from "tsyringe";
import { isUniqueViolation } from "@/common/database/prisma-errors";
import { ConflictError, NotFoundError } from "@/common/errors/http.error";
import { Prisma, PrismaClient, type RepoFile, type RepoFileVersion } from "@/generated/prisma";
import type { FileContent, RepoFileChange } from "./repo-file.schema";

type Tx = Prisma.TransactionClient;

/** Every column except the encrypted blob, for metadata-only reads. */
const FILE_SUMMARY_SELECT = {
  id: true,
  path: true,
  version: true,
  contentHash: true,
  fileSize: true,
  isBinary: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type RepoFileSummary = Prisma.RepoFileGetPayload<{ select: typeof FILE_SUMMARY_SELECT }>;

const VERSION_SUMMARY_SELECT = {
  version: true,
  path: true,
  contentHash: true,
  fileSize: true,
  isBinary: true,
  message: true,
  changedBy: true,
  createdAt: true,
} as const;

export type RepoFileVersionSummary = Prisma.RepoFileVersionGetPayload<{
  select: typeof VERSION_SUMMARY_SELECT;
}>;

export interface AppliedChanges {
  files: RepoFileSummary[];
  deletedIds: string[];
  /** Path before the change, keyed by file id, for moves and deletes (audit trail). */
  previousPaths: Map<string, string>;
}

/** Prisma queries for RepoFile + RepoFileVersion. Validation, plan limits and auditing live in the service. */
@singleton()
export class RepoFileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(projectId: string): Promise<RepoFileSummary[]> {
    return this.prisma.repoFile.findMany({
      where: { projectId },
      orderBy: { path: "asc" },
      select: FILE_SUMMARY_SELECT,
    });
  }

  /** Files with their blobs; every file in the project when `ids` is omitted. */
  findMany(projectId: string, ids?: string[]): Promise<RepoFile[]> {
    return this.prisma.repoFile.findMany({
      where: { projectId, ...(ids && { id: { in: ids } }) },
      orderBy: { path: "asc" },
    });
  }

  async requireFile(projectId: string, fileId: string): Promise<RepoFile> {
    const file = await this.prisma.repoFile.findFirst({ where: { id: fileId, projectId } });
    if (!file) throw new NotFoundError("File not found");
    return file;
  }

  /** Version history metadata (no blob), newest first. */
  async listVersions(projectId: string, fileId: string): Promise<RepoFileVersionSummary[]> {
    const file = await this.prisma.repoFile.findFirst({
      where: { id: fileId, projectId },
      select: { id: true },
    });
    if (!file) throw new NotFoundError("File not found");

    return this.prisma.repoFileVersion.findMany({
      where: { repoFileId: file.id },
      orderBy: { version: "desc" },
      select: VERSION_SUMMARY_SELECT,
    });
  }

  async requireVersion(
    projectId: string,
    fileId: string,
    version: number,
  ): Promise<RepoFileVersion> {
    const row = await this.prisma.repoFileVersion.findFirst({
      where: { repoFileId: fileId, version, repoFile: { projectId } },
    });
    if (!row) throw new NotFoundError("File version not found");
    return row;
  }

  findUserNames(ids: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  /**
   * Apply a batch atomically: every change must be based on the file's current version, or the
   * whole batch is rejected with 409. Deletes run first, then updates/moves, then creates, so a
   * path freed by a delete or move in the same batch can be reused.
   */
  async applyChanges(
    projectId: string,
    userId: string,
    changes: RepoFileChange[],
    message: string | null,
  ): Promise<AppliedChanges> {
    const ordered = [
      ...changes.filter((c) => c.fileId && c.delete),
      ...changes.filter((c) => c.fileId && !c.delete),
      ...changes.filter((c) => !c.fileId),
    ];

    try {
      return await this.prisma.$transaction(async (tx) => {
        const result: AppliedChanges = { files: [], deletedIds: [], previousPaths: new Map() };
        const currentById = await loadCurrent(tx, projectId, ordered);

        for (const change of ordered) {
          if (!change.fileId) {
            result.files.push(await createFile(tx, projectId, userId, change, message));
            continue;
          }

          const current = currentById.get(change.fileId)!;
          result.previousPaths.set(current.id, current.path);

          if (change.delete) {
            const { count } = await tx.repoFile.deleteMany({ where: versionGuard(current) });
            if (count === 0) throw lostRace(current);
            result.deletedIds.push(current.id);
          } else {
            result.files.push(await updateFile(tx, current, userId, change, message));
          }
        }

        return result;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Another file already exists at that path.");
      }
      throw error;
    }
  }
}

function versionGuard(file: RepoFileSummary) {
  return { id: file.id, version: file.version };
}

/** A version-guarded write matched no row: a concurrent writer got there first. */
function lostRace(file: RepoFileSummary): ConflictError {
  return new ConflictError(`"${file.path}" was changed by someone else.`);
}

/**
 * Read every file the batch touches in one query and check each `baseVersion` before any write.
 * Messages stay client-neutral; each client adds its own remedy (reload, `depvault pull`).
 */
async function loadCurrent(
  tx: Tx,
  projectId: string,
  changes: RepoFileChange[],
): Promise<Map<string, RepoFileSummary>> {
  const ids = changes.flatMap((c) => (c.fileId ? [c.fileId] : []));
  if (ids.length === 0) return new Map();

  const rows = await tx.repoFile.findMany({
    where: { projectId, id: { in: ids } },
    select: FILE_SUMMARY_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const change of changes) {
    if (!change.fileId) continue;
    const current = byId.get(change.fileId);
    if (!current) throw new ConflictError("A file in this change was deleted by someone else.");
    if (current.version !== change.baseVersion) throw lostRace(current);
  }
  return byId;
}

function blobData(content: FileContent) {
  return {
    encryptedContent: new Uint8Array(Buffer.from(content.encryptedContent, "base64")),
    iv: content.iv,
    authTag: content.authTag,
    contentHash: content.contentHash,
    fileSize: content.fileSize,
    isBinary: content.isBinary,
  };
}

async function createFile(
  tx: Tx,
  projectId: string,
  userId: string,
  change: RepoFileChange,
  message: string | null,
): Promise<RepoFile> {
  const file = await tx.repoFile.create({
    data: { projectId, path: change.path!, createdBy: userId, ...blobData(change.content!) },
  });
  await snapshot(tx, file, userId, message);
  return file;
}

async function updateFile(
  tx: Tx,
  current: RepoFileSummary,
  userId: string,
  change: RepoFileChange,
  message: string | null,
): Promise<RepoFileSummary> {
  const contentChanged = change.content && change.content.contentHash !== current.contentHash;
  const pathChanged = change.path !== undefined && change.path !== current.path;
  if (!contentChanged && !pathChanged) return current;

  let file: RepoFile;
  try {
    file = await tx.repoFile.update({
      where: versionGuard(current),
      data: {
        ...(contentChanged && blobData(change.content!)),
        ...(pathChanged && { path: change.path }),
        version: current.version + 1,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw lostRace(current);
    }
    throw error;
  }

  await snapshot(tx, file, userId, message);
  return file;
}

/** Record the file's new state as its latest version row. */
function snapshot(tx: Tx, file: RepoFile, userId: string, message: string | null) {
  return tx.repoFileVersion.create({
    data: {
      repoFileId: file.id,
      version: file.version,
      path: file.path,
      encryptedContent: file.encryptedContent,
      iv: file.iv,
      authTag: file.authTag,
      contentHash: file.contentHash,
      fileSize: file.fileSize,
      isBinary: file.isBinary,
      changedBy: userId,
      message,
    },
  });
}

import { singleton } from "tsyringe";
import { ConflictError, NotFoundError } from "@/common/errors/http.error";
import { Prisma, PrismaClient, type RepoFile, type RepoFileVersion } from "@/generated/prisma";
import type { FileContent, RepoFileChange } from "./repo-file.schema";

type Tx = Prisma.TransactionClient;

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
  files: RepoFile[];
  deletedIds: string[];
  /** Path before the change, keyed by file id, for moves and deletes (audit trail). */
  previousPaths: Map<string, string>;
}

/** Prisma queries for RepoFile + RepoFileVersion. Validation, plan limits and auditing live in the service. */
@singleton()
export class RepoFileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(projectId: string): Promise<RepoFile[]> {
    return this.prisma.repoFile.findMany({ where: { projectId }, orderBy: { path: "asc" } });
  }

  findMany(projectId: string, ids: string[]): Promise<RepoFile[]> {
    return this.prisma.repoFile.findMany({
      where: { projectId, id: { in: ids } },
      orderBy: { path: "asc" },
    });
  }

  async requireFile(projectId: string, fileId: string): Promise<RepoFile> {
    const file = await this.prisma.repoFile.findFirst({ where: { id: fileId, projectId } });
    if (!file) throw new NotFoundError("File not found");
    return file;
  }

  /** Version history metadata (no blob), newest first. */
  listVersions(repoFileId: string): Promise<RepoFileVersionSummary[]> {
    return this.prisma.repoFileVersion.findMany({
      where: { repoFileId },
      orderBy: { version: "desc" },
      select: VERSION_SUMMARY_SELECT,
    });
  }

  async requireVersion(repoFileId: string, version: number): Promise<RepoFileVersion> {
    const row = await this.prisma.repoFileVersion.findUnique({
      where: { repoFileId_version: { repoFileId, version } },
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

        for (const change of ordered) {
          if (!change.fileId) {
            result.files.push(await createFile(tx, projectId, userId, change, message));
            continue;
          }

          const current = await requireCurrent(tx, projectId, change.fileId, change.baseVersion!);
          result.previousPaths.set(current.id, current.path);

          if (change.delete) {
            await guardedWrite(tx.repoFile.deleteMany({ where: versionGuard(current) }), current);
            result.deletedIds.push(current.id);
          } else {
            result.files.push(await updateFile(tx, current, userId, change, message));
          }
        }

        return result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Another file already exists at that path. Pull and try again.");
      }
      throw error;
    }
  }
}

function versionGuard(file: RepoFile) {
  return { id: file.id, version: file.version };
}

async function requireCurrent(
  tx: Tx,
  projectId: string,
  fileId: string,
  baseVersion: number,
): Promise<RepoFile> {
  const current = await tx.repoFile.findFirst({ where: { id: fileId, projectId } });
  if (!current) {
    throw new ConflictError(
      "A file in this change was deleted by someone else. Pull and try again.",
    );
  }
  if (current.version !== baseVersion) {
    throw new ConflictError(`"${current.path}" was changed by someone else. Pull and try again.`);
  }
  return current;
}

/** Run a version-guarded write; zero affected rows means a concurrent writer got there first. */
async function guardedWrite(write: Promise<Prisma.BatchPayload>, file: RepoFile): Promise<void> {
  const { count } = await write;
  if (count === 0) {
    throw new ConflictError(`"${file.path}" was changed by someone else. Pull and try again.`);
  }
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
  current: RepoFile,
  userId: string,
  change: RepoFileChange,
  message: string | null,
): Promise<RepoFile> {
  const contentChanged = change.content && change.content.contentHash !== current.contentHash;
  const pathChanged = change.path !== undefined && change.path !== current.path;
  if (!contentChanged && !pathChanged) return current;

  await guardedWrite(
    tx.repoFile.updateMany({
      where: versionGuard(current),
      data: {
        ...(contentChanged && blobData(change.content!)),
        ...(pathChanged && { path: change.path }),
        version: current.version + 1,
      },
    }),
    current,
  );

  const file = await tx.repoFile.findUniqueOrThrow({ where: { id: current.id } });
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

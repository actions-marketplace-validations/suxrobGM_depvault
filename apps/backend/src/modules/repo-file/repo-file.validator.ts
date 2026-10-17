import { BadRequestError } from "@/common/errors/http.error";
import { type FileContent, MAX_FILE_SIZE, type RepoFileChange } from "./repo-file.schema";

const FORBIDDEN_EXTENSIONS = [".exe", ".sh", ".bat", ".cmd", ".ps1"];
const DRIVE_LETTER = /^[A-Za-z]:$/;

/**
 * Require a canonical repo-relative path so one file can never be stored under two spellings:
 * forward slashes only, no leading/trailing slash, no empty, `.` or `..` segments, no drive letter.
 */
function validatePath(path: string): void {
  if (path.includes("\\")) {
    throw new BadRequestError(`Invalid path "${path}": use forward slashes`);
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new BadRequestError(`Invalid path "${path}": must be a normalized repo-relative path`);
  }

  if (DRIVE_LETTER.test(segments[0]!)) {
    throw new BadRequestError(`Invalid path "${path}": file is outside the repository`);
  }

  const lowerPath = path.toLowerCase();
  const ext = FORBIDDEN_EXTENSIONS.find((forbidden) => lowerPath.endsWith(forbidden));
  if (ext) {
    throw new BadRequestError(`Executable file type "${ext}" is not allowed`);
  }
}

/** Check the decoded ciphertext size rather than trusting the client-declared `fileSize`. */
function validateContent(content: FileContent): void {
  const decodedSize = Math.floor((content.encryptedContent.length * 3) / 4);
  if (decodedSize > MAX_FILE_SIZE + 3) {
    throw new BadRequestError(`File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB limit`);
  }
}

/** Validate the shape of one batch change; see `RepoFileChangeSchema` for the rules. */
export function validateChange(change: RepoFileChange): void {
  if (change.path !== undefined) validatePath(change.path);
  if (change.content) validateContent(change.content);

  if (!change.fileId) {
    if (change.delete || change.path === undefined || !change.content) {
      throw new BadRequestError("A new file needs a path and content");
    }
    return;
  }

  if (change.baseVersion === undefined) {
    throw new BadRequestError("Changing an existing file requires baseVersion");
  }

  if (!change.delete && change.path === undefined && !change.content) {
    throw new BadRequestError("A change must set content, a new path, or delete");
  }
}

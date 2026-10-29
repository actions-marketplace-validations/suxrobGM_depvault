import { MAX_FILE_SIZE } from "@depvault/shared/constants";
import { repoPathError } from "@depvault/shared/utils";
import { BadRequestError } from "@/common/errors/http.error";
import type { FileContent, RepoFileChange } from "./repo-file.schema";

/** Require a canonical repo-relative path so one file can never be stored under two spellings. */
function validatePath(path: string): void {
  const error = repoPathError(path);
  if (error) throw new BadRequestError(`Invalid path "${path}": ${error}`);
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

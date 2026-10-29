import { EXECUTABLE_EXTENSIONS, MAX_PATH_LENGTH } from "../constants/repo-files";

const DRIVE_LETTER = /^[A-Za-z]:$/;

/**
 * Why a repo path is not canonical, or null when it is. Canonical means one file can never be
 * stored under two spellings: forward slashes only, no leading/trailing slash, no empty, `.` or
 * `..` segments, no drive letter, and not an executable file type.
 */
export function repoPathError(path: string): string | null {
  if (path === "") return "Path is required";
  if (path.length > MAX_PATH_LENGTH) return `Path must be at most ${MAX_PATH_LENGTH} characters`;
  if (path.includes("\\")) return "Use forward slashes";

  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "Use a relative path without empty, '.' or '..' segments";
  }
  if (DRIVE_LETTER.test(segments[0]!)) return "Path must be inside the repository";

  const lowerPath = path.toLowerCase();
  const ext = EXECUTABLE_EXTENSIONS.find((executable) => lowerPath.endsWith(executable));
  if (ext) return `Executable file type "${ext}" is not allowed`;
  return null;
}

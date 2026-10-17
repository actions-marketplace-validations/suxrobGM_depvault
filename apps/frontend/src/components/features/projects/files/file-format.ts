/** Path and format helpers shared by the file browser, editor, upload and history views. */

export type EditorLanguage = "json" | "yaml" | "env" | "xml" | "plain";

/** Mirrors the backend limit; larger files are rejected server-side. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Mirrors the backend: changes to these extensions are rejected. */
const EXECUTABLE_EXTENSIONS = [".exe", ".sh", ".bat", ".cmd", ".ps1"];

const MAX_PATH_LENGTH = 1024;

const LANGUAGE_BY_EXTENSION: Record<string, EditorLanguage> = {
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  env: "env",
  xml: "xml",
  csproj: "xml",
  props: "xml",
  targets: "xml",
  plist: "xml",
  config: "xml",
};

/** The final path segment (e.g. `a/b/c.json` → `c.json`). */
export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The folder part of a path, or "" for a root-level file. */
export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Picks the editor language from the file name; dotenv files are matched by name. */
export function resolveLanguage(path: string): EditorLanguage {
  const name = basename(path).toLowerCase();
  if (name === ".env" || name.startsWith(".env.") || name.endsWith(".env")) {
    return "env";
  }
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return LANGUAGE_BY_EXTENSION[ext] ?? "plain";
}

function isExecutablePath(path: string): boolean {
  const lower = path.toLowerCase();
  return EXECUTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Canonicalizes user input into a repo-relative path: backslashes become slashes, and leading
 * `./`, surrounding slashes and duplicate slashes are dropped.
 */
export function normalizePath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

/** Returns why a canonical path would be rejected by the server, or null when it is valid. */
export function pathError(path: string): string | null {
  if (path === "") return "Path is required";
  if (path.length > MAX_PATH_LENGTH) return `Path must be at most ${MAX_PATH_LENGTH} characters`;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return "Use a relative path without '.' or '..' segments";
  }
  if (/^[A-Za-z]:$/.test(segments[0] ?? "")) return "Path must be inside the repository";
  if (isExecutablePath(path)) return "Executable file types are not allowed";
  return null;
}

/** Best-effort MIME type for downloads and share links. */
export function guessMimeType(path: string, isBinary: boolean): string {
  if (isBinary) return "application/octet-stream";
  const language = resolveLanguage(path);
  if (language === "json") return "application/json";
  if (language === "xml") return "application/xml";
  if (language === "yaml") return "application/yaml";
  return "text/plain";
}

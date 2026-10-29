import { BadRequestError } from "@/common/errors/http.error";
import type { ParsedDependency, ParseResult } from "./types";

/**
 * Parses a JSON manifest whose dependency sections map package name to version string
 * (package.json, composer.json). `skip` drops entries that aren't real packages.
 */
export function parseJsonManifest(
  content: string,
  fileName: string,
  label: string,
  sections: string[],
  skip: (name: string) => boolean = () => false,
): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new BadRequestError(`Invalid JSON in ${fileName}`);
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new BadRequestError(`${label} must be a JSON object`);
  }

  const record = json as Record<string, unknown>;
  const dependencies: ParsedDependency[] = sections.flatMap((key) => {
    const section = record[key];
    if (!section || typeof section !== "object" || Array.isArray(section)) return [];

    return Object.entries(section as Record<string, unknown>).flatMap(([name, version]) =>
      typeof version === "string" && !skip(name) ? [{ name, version, isDirect: true }] : [],
    );
  });

  return { dependencies, fileName };
}

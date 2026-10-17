import { fetchRegistryVersion } from "./version-cache";
import type { RegistryResult } from "./version-utils";

interface NpmLatestResponse {
  version?: string;
  deprecated?: string;
  license?: string | { type?: string };
}

/** Fetches the latest version, deprecation flag, and license of an npm package. */
export function fetchNpmVersion(name: string): Promise<RegistryResult> {
  const encodedName = name.startsWith("@")
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);

  return fetchRegistryVersion<NpmLatestResponse>(
    "npm",
    name,
    `https://registry.npmjs.org/${encodedName}/latest`,
    (data) => ({
      version: data.version ?? null,
      deprecated: !!data.deprecated,
      license: typeof data.license === "string" ? data.license : data.license?.type || null,
    }),
  );
}

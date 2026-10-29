import { fetchRegistryVersion } from "./version-cache";
import type { RegistryResult } from "./version-utils";

interface PypiResponse {
  info?: { version?: string; license?: string; classifiers?: string[] };
}

/** Fetches the latest version, deprecation flag (from classifiers), and license of a PyPI package. */
export function fetchPypiVersion(name: string): Promise<RegistryResult> {
  return fetchRegistryVersion<PypiResponse>(
    "PyPI",
    name,
    `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
    (data) => ({
      version: data.info?.version ?? null,
      deprecated: (data.info?.classifiers ?? []).some((c) => {
        const lower = c.toLowerCase();
        return lower.includes("inactive") || lower.includes("deprecated");
      }),
      license: data.info?.license?.trim() || null,
    }),
  );
}

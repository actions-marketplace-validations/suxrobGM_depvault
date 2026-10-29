import { fetchRegistryVersion } from "./version-cache";
import type { RegistryResult } from "./version-utils";

/** Fetches the latest version info for a NuGet package. */
export function fetchNugetVersion(name: string): Promise<RegistryResult> {
  return fetchRegistryVersion<{ versions?: string[] }>(
    "NuGet",
    name,
    `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(name.toLowerCase())}/index.json`,
    (data) => ({
      version: findLatestStable(data.versions ?? []),
      deprecated: false,
      license: null,
    }),
  );
}

function findLatestStable(versions: string[]): string | null {
  if (versions.length === 0) return null;

  for (let i = versions.length - 1; i >= 0; i--) {
    if (!versions[i]!.includes("-")) return versions[i]!;
  }

  // Only prereleases exist; the newest is better than nothing.
  return versions[versions.length - 1]!;
}

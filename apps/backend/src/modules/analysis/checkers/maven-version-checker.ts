import { fetchRegistryVersion } from "./version-cache";
import type { RegistryResult } from "./version-utils";

interface MavenSearchResponse {
  response?: { docs?: Array<{ latestVersion?: string }> };
}

/** Fetches the latest version info from Maven Central for a group:artifact dependency. */
export function fetchMavenVersion(name: string): Promise<RegistryResult> {
  const [group, artifact] = name.split(":");
  const url =
    group && artifact
      ? `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(group)}+AND+a:${encodeURIComponent(artifact)}&rows=1&wt=json`
      : null;

  return fetchRegistryVersion<MavenSearchResponse>("maven", name, url, (data) => ({
    version: data.response?.docs?.[0]?.latestVersion ?? null,
    deprecated: false,
    license: null,
  }));
}

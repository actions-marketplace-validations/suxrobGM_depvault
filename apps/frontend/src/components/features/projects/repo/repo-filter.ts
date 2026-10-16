import type { RepoMapAppDto } from "@/api/types/repo";

/** Sentinel env-filter value meaning "show files from every environment". */
export const ALL_ENVIRONMENTS = "__all__";

/**
 * Keeps files whose env matches and whose app name or path matches the query; drops apps left
 * with no files.
 */
export function filterApps(
  apps: RepoMapAppDto[],
  envFilter: string,
  search: string,
): RepoMapAppDto[] {
  const query = search.trim().toLowerCase();

  return apps
    .map((app) => {
      const appNameMatch = query === "" || app.name.toLowerCase().includes(query);
      const files = app.files.filter((file) => {
        const envMatch = envFilter === ALL_ENVIRONMENTS || file.environmentSlug === envFilter;
        const searchMatch = appNameMatch || file.relativePath.toLowerCase().includes(query);
        return envMatch && searchMatch;
      });
      return { ...app, files };
    })
    .filter((app) => app.files.length > 0);
}

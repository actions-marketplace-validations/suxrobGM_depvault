import { MemoryCache } from "@/common/cache/in-memory.cache";
import { logger } from "@/common/logger/logger";
import type { RegistryResult } from "./version-utils";

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

const EMPTY_RESULT: RegistryResult = { version: null, deprecated: false, license: null };

const versionCache = new MemoryCache<RegistryResult>(CACHE_TTL_MS);

export function clearVersionCache(): void {
  versionCache.clear();
}

/**
 * Looks up a package in a registry's JSON API with caching and a request timeout. Failures and
 * non-2xx responses yield an empty result (and are not cached) so one bad lookup never fails an
 * analysis.
 * @param registry Cache namespace and log label (e.g. "npm")
 * @param url Endpoint to query, or null when the name can't be looked up
 * @param parse Maps the response body to a result
 */
export async function fetchRegistryVersion<T>(
  registry: string,
  name: string,
  url: string | null,
  parse: (data: T) => RegistryResult,
): Promise<RegistryResult> {
  if (!name || !url) {
    return EMPTY_RESULT;
  }

  const key = `${registry}:${name}`;
  const cached = versionCache.get(key);
  if (cached) return cached;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return EMPTY_RESULT;

    const result = parse((await response.json()) as T);
    versionCache.set(key, result);
    return result;
  } catch {
    logger.warn(`Failed to fetch ${registry} version for ${name}`);
    return EMPTY_RESULT;
  }
}

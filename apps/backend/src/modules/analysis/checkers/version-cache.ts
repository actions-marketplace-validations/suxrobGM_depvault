import { MemoryCache } from "@/common/cache/in-memory.cache";
import type { RegistryResult } from "./version-utils";

const CACHE_TTL_MS = 60 * 60 * 1000;

export const versionCache = new MemoryCache<RegistryResult>(CACHE_TTL_MS);

export function clearVersionCache(): void {
  versionCache.clear();
}

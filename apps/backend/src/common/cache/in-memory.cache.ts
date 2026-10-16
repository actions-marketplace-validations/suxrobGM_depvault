import type { ICache } from "./cache.interface";

/**
 * In-process TTL cache backed by a `Map`. Entries are evicted lazily on `get` (no background
 * sweep), so it only suits single-instance deployments.
 */
export class MemoryCache<T> implements ICache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  /** @param defaultTtlMs - TTL applied when `set` is called without `ttlMs`. */
  constructor(private readonly defaultTtlMs: number) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

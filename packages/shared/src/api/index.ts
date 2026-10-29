import type { App } from "@depvault/backend";
import { treaty } from "@elysiajs/eden";

export function createApiClient(
  baseUrl: string,
  options?: NonNullable<Parameters<typeof treaty<App>>[1]>,
) {
  return treaty<App>(baseUrl, options);
}

/**
 * Extract the resolved response data from an Eden Treaty endpoint method.
 * Usage: `Data<typeof client.api.projects.get>`.
 */
export type Data<T extends (...args: never[]) => Promise<{ data: unknown }>> = NonNullable<
  Awaited<ReturnType<T>>["data"]
>;

/**
 * Extract the request body from an Eden Treaty POST/PATCH/PUT endpoint method.
 * Usage: `Body<typeof client.api.projects.post>`.
 */
export type Body<T extends (...args: never[]) => unknown> = NonNullable<Parameters<T>[0]>;

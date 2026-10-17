/** Eden Treaty's response envelope. */
export interface EdenResult<T> {
  data: T | null;
  error: unknown;
}

interface EdenErrorShape {
  status?: number;
  value?: { message?: string };
}

/** A failed API call, carrying the HTTP status so callers can branch on e.g. 404. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * Awaits an Eden call and returns its data, throwing on any error so a rejected key write can
 * never pass for success.
 */
export async function expectOk<T>(request: Promise<EdenResult<T>>): Promise<T> {
  const { data, error } = await request;
  if (error) {
    const { status, value } = error as EdenErrorShape;
    throw new ApiRequestError(
      value?.message ?? `Request failed (${status ?? "network"})`,
      status ?? null,
    );
  }
  return data as T;
}

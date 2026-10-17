import { type Static, type TSchema, t } from "elysia";

/** API error response schema. */
const ErrorResponseSchema = t.Object({
  code: t.Number(),
  message: t.String(),
  details: t.Optional(t.Unknown()),
});

/** Pagination info schema. */
export const PaginationSchema = t.Object({
  /** Current page number, starting from 1 */
  page: t.Number(),
  /** Number of items per page */
  limit: t.Number(),
  /** Total number of items */
  total: t.Number(),
  /** Total number of pages */
  totalPages: t.Number(),
});

/** Creates a paginated response schema (items + pagination info). */
export const PaginatedResponseSchema = <T extends TSchema>(itemSchema: T) =>
  t.Object({
    items: t.Array(itemSchema),
    pagination: PaginationSchema,
  });

/** Message response for operations that don't return data. */
export const MessageResponseSchema = t.Object({
  message: t.String(),
});

/** The error body schema, documented under the given status description. */
const errorResponse = (description: string) =>
  t.Object(ErrorResponseSchema.properties, { description });

/** Common error response presets for API routes. */
export const HttpErrorResponses = {
  400: errorResponse("Bad Request"),
  401: errorResponse("Unauthorized"),
  403: errorResponse("Forbidden"),
  404: errorResponse("Not Found"),
  409: errorResponse("Conflict"),
};

export const GoneErrorSchema = { 410: errorResponse("Gone") };

export const TooManyRequestsErrorSchema = { 429: errorResponse("Too Many Requests") };

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
export type MessageResponse = Static<typeof MessageResponseSchema>;

export type PaginatedResponse<T> = Omit<
  Static<ReturnType<typeof PaginatedResponseSchema<ReturnType<typeof t.Unknown>>>>,
  "items"
> & {
  items: T[];
};

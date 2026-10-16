import { type TSchema, t } from "elysia";

/** Base pagination query schema. */
export const PaginationQueryBaseSchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
});

/** Extends the base pagination query schema with additional fields. */
export const PaginationQuerySchema = <T extends TSchema>(itemSchema: T) =>
  t.Composite([PaginationQueryBaseSchema, itemSchema]);

/** Date range filter (from/to as ISO 8601 timestamps). */
export const DateRangeQuerySchema = t.Object({
  from: t.Optional(
    t.String({ format: "date-time", description: "Start of date range (ISO 8601)" }),
  ),
  to: t.Optional(t.String({ format: "date-time", description: "End of date range (ISO 8601)" })),
});

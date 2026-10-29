import { t } from "elysia";

/** `:id` route param schema. */
export const StringIdParamSchema = t.Object({
  id: t.String(),
});

/** `:id` route param schema for routes that validate the project id as a UUID. */
export const ProjectIdParamSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

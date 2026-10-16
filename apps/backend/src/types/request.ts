import { t } from "elysia";

/** `:id` route param schema. */
export const StringIdParamSchema = t.Object({
  id: t.String(),
});

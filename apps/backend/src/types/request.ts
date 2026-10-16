import { t } from "elysia";

/**
 * ID parameter schema with string type ID
 */
export const StringIdParamSchema = t.Object({
  id: t.String(),
});

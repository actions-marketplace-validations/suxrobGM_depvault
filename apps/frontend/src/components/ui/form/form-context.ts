import { createFormHookContexts } from "@tanstack/react-form";

/** Own module so bound fields can read the contexts without importing the hook in `index.ts`. */
export const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

import { createFormHook } from "@tanstack/react-form";
import { Checkbox } from "./checkbox-field";
import { fieldContext, formContext } from "./form-context";
import { Select } from "./select-field";
import { TextField } from "./text-field";

/**
 * App-wide TanStack Form hook. Render bound fields inside `form.AppField` through the `field`
 * arg: `<form.AppField name="email">{(field) => <field.TextField label="Email" />}</form.AppField>`.
 */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, Select, Checkbox },
  formComponents: {},
});

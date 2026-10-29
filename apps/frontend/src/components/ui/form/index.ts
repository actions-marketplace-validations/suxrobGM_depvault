import { createFormHook } from "@tanstack/react-form";
import { Checkbox } from "./checkbox-field";
import { ChipsField } from "./chips-field";
import { DialogFormActions, Form, SubmitButton } from "./form-components";
import { fieldContext, formContext } from "./form-context";
import { Select } from "./select-field";
import { TextField } from "./text-field";

/**
 * App-wide TanStack Form hook. Render bound fields inside `form.AppField` through the `field`
 * arg: `<form.AppField name="email">{(field) => <field.TextField label="Email" />}</form.AppField>`.
 * Wrap the form in `<form.AppForm>` to use `form.Form`, `form.SubmitButton` and
 * `form.DialogFormActions`, which read the form from context.
 */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, Select, Checkbox, ChipsField },
  formComponents: { Form, SubmitButton, DialogFormActions },
});

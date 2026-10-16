"use client";

import type { ReactElement } from "react";
import { TextField as MuiTextField, type TextFieldProps as MuiTextFieldProps } from "@mui/material";
import { firstErrorMessage } from "./error-message";
import { useFieldContext } from "./form-context";

interface TextFieldProps
  extends Omit<
    MuiTextFieldProps,
    "value" | "onChange" | "onBlur" | "error" | "helperText" | "name"
  > {
  /** Rewrites the input on every change (e.g. uppercase a code). */
  transform?: (value: string) => string;
}

/** TanStack Form-bound text field; shows the first validation error as helper text. */
export function TextField(props: TextFieldProps): ReactElement {
  const { transform, ...rest } = props;
  const field = useFieldContext<string>();
  const errorText = firstErrorMessage(field.state.meta.errors);

  return (
    <MuiTextField
      fullWidth
      value={field.state.value ?? ""}
      onChange={(e) => field.handleChange(transform ? transform(e.target.value) : e.target.value)}
      onBlur={field.handleBlur}
      error={errorText !== undefined}
      helperText={errorText}
      {...rest}
    />
  );
}

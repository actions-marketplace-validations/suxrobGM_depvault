"use client";

import type { ReactElement } from "react";
import { TextField as MuiTextField, type TextFieldProps as MuiTextFieldProps } from "@mui/material";
import { firstErrorMessage } from "./error-message";
import { useFieldContext } from "./form-context";

interface DateFieldProps
  extends Omit<
    MuiTextFieldProps,
    "value" | "onChange" | "onBlur" | "error" | "helperText" | "name" | "type"
  > {
  /** Earliest selectable date (YYYY-MM-DD). */
  min?: string;
  /** Latest selectable date (YYYY-MM-DD). */
  max?: string;
}

/** TanStack Form-bound date input; the field holds the `YYYY-MM-DD` string. */
export function DateField(props: DateFieldProps): ReactElement {
  const { min, max, ...rest } = props;
  const field = useFieldContext<string>();
  const errorText = firstErrorMessage(field.state.meta.errors);

  return (
    <MuiTextField
      type="date"
      fullWidth
      value={field.state.value ?? ""}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={field.handleBlur}
      error={errorText !== undefined}
      helperText={errorText}
      slotProps={{
        input: { inputProps: { min, max } },
        inputLabel: { shrink: true },
      }}
      {...rest}
    />
  );
}

"use client";

import type { ReactElement } from "react";
import { Autocomplete, Chip, TextField as MuiTextField } from "@mui/material";
import { firstErrorMessage } from "./error-message";
import { useFieldContext } from "./form-context";

interface ChipsFieldProps {
  label: string;
  placeholder?: string;
  /** Shown when there is no validation error. */
  helperText?: string;
  disabled?: boolean;
}

/** TanStack Form-bound free-text chip input for a `string[]` field; Enter or blur adds a chip. */
export function ChipsField(props: ChipsFieldProps): ReactElement {
  const { label, placeholder, helperText, disabled } = props;
  const field = useFieldContext<string[]>();
  const errorText = firstErrorMessage(field.state.meta.errors);

  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      disabled={disabled}
      options={[]}
      value={field.state.value}
      onChange={(_, value) => field.handleChange(value.map((v) => v.trim()).filter(Boolean))}
      onBlur={field.handleBlur}
      renderValue={(values, getItemProps) =>
        values.map((value, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return (
            <Chip
              key={key}
              size="small"
              label={value}
              sx={{ fontFamily: "monospace" }}
              {...itemProps}
            />
          );
        })
      }
      renderInput={(params) => (
        <MuiTextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={errorText !== undefined}
          helperText={errorText ?? helperText}
        />
      )}
    />
  );
}

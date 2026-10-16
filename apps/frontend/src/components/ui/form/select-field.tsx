"use client";

import type { ReactElement } from "react";
import {
  FormHelperText,
  MenuItem,
  Select as MuiSelect,
  TextField as MuiTextField,
  Stack,
  Typography,
} from "@mui/material";
import { firstErrorMessage } from "./error-message";
import { useFieldContext } from "./form-context";

interface SelectProps {
  label?: string;
  items: ReadonlyArray<{ value: number | string; label: string }>;
  /** `"float"` (default): floating label in a `TextField select`. `"above"`: compact label above a bare `Select`. */
  labelPlacement?: "float" | "above";
  /** Prepends an empty option (value ""). Otherwise an empty `items` disables the field. Float only. */
  optional?: boolean;
  /** Label for the empty option when `optional`. */
  emptyLabel?: string;
  /** Shown below a non-optional field whose `items` is empty. */
  emptyMessage?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** TanStack Form-bound select. Numeric fields keep numeric values. */
export function Select(props: SelectProps): ReactElement {
  const {
    label,
    items,
    labelPlacement = "float",
    optional = false,
    emptyLabel = "— none —",
    emptyMessage,
    autoFocus,
    disabled = false,
  } = props;
  const field = useFieldContext<string | number>();
  const isNumeric = typeof field.state.value === "number";
  const toValue = (raw: unknown) => (isNumeric ? Number(raw) : String(raw));

  const options = items.map((item) => (
    <MenuItem key={item.value} value={item.value}>
      {item.label}
    </MenuItem>
  ));

  if (labelPlacement === "above") {
    return (
      <Stack spacing={0.5}>
        {label && <Typography variant="body2Muted">{label}</Typography>}
        <MuiSelect
          size="small"
          disabled={disabled}
          value={field.state.value}
          onChange={(e) => field.handleChange(toValue(e.target.value))}
        >
          {options}
        </MuiSelect>
      </Stack>
    );
  }

  const isEmpty = !optional && items.length === 0;
  const errorText = firstErrorMessage(field.state.meta.errors);

  return (
    <>
      <MuiTextField
        fullWidth
        select
        label={label}
        autoFocus={autoFocus}
        disabled={disabled || isEmpty}
        value={field.state.value}
        onChange={(e) => field.handleChange(toValue(e.target.value))}
        onBlur={field.handleBlur}
        error={errorText !== undefined}
        helperText={errorText}
      >
        {optional && (
          <MenuItem value="">
            <em>{emptyLabel}</em>
          </MenuItem>
        )}
        {options}
      </MuiTextField>
      {isEmpty && emptyMessage && <FormHelperText>{emptyMessage}</FormHelperText>}
    </>
  );
}

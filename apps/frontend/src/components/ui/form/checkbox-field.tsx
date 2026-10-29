"use client";

import type { ReactElement } from "react";
import { FormControlLabel, Checkbox as MuiCheckbox } from "@mui/material";
import { useFieldContext } from "./form-context";

interface CheckboxProps {
  label: string;
}

/** TanStack Form-bound checkbox for a boolean field. */
export function Checkbox(props: CheckboxProps): ReactElement {
  const { label } = props;
  const field = useFieldContext<boolean>();

  return (
    <FormControlLabel
      control={
        <MuiCheckbox
          checked={Boolean(field.state.value)}
          onChange={(e) => field.handleChange(e.target.checked)}
        />
      }
      label={label}
    />
  );
}

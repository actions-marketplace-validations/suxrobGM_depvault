"use client";

import type { ReactElement } from "react";
import { Clear as ClearIcon, Search as SearchIcon } from "@mui/icons-material";
import { IconButton, InputAdornment, TextField, type TextFieldProps } from "@mui/material";

interface SearchFieldProps extends Omit<TextFieldProps, "value" | "onChange" | "slotProps"> {
  value: string;
  onChange: (value: string) => void;
}

/** Small text field with a search icon and a clear button once something is typed. */
export function SearchField(props: SearchFieldProps): ReactElement {
  const { value, onChange, size = "small", ...rest } = props;

  return (
    <TextField
      size={size}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: "text.disabled" }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear search" onClick={() => onChange("")}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}

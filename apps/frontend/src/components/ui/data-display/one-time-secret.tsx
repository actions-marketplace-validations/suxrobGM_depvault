"use client";

import type { ReactElement, ReactNode } from "react";
import { Alert, Box, Stack } from "@mui/material";
import { CopyButton } from "@/components/ui/inputs";

interface OneTimeSecretProps {
  /** The secret to show (token, link, recovery key); rendered monospace and wrapped anywhere. */
  value: string;
  /** Warning above the value. */
  warning: ReactNode;
  /** Label of the full-width copy button. */
  copyLabel: string;
  /** Toast shown after copying. */
  copiedMessage: string;
}

/** A secret shown exactly once: warning, monospace value box and a copy button. */
export function OneTimeSecret(props: OneTimeSecretProps): ReactElement {
  const { value, warning, copyLabel, copiedMessage } = props;

  return (
    <Stack spacing={2}>
      <Alert severity="warning">{warning}</Alert>
      <Box
        sx={{
          p: 1.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          fontFamily: "monospace",
          fontSize: "0.8rem",
          wordBreak: "break-all",
          bgcolor: "action.hover",
        }}
      >
        {value}
      </Box>
      <CopyButton value={value} label={copyLabel} notification={copiedMessage} fullWidth />
    </Stack>
  );
}

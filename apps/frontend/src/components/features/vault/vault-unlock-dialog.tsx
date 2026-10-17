"use client";

import type { ReactElement } from "react";
import { Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { VaultUnlockForm } from "./vault-unlock-form";

interface VaultUnlockDialogProps {
  open: boolean;
  onClose: () => void;
  onForgotPassword?: () => void;
}

export function VaultUnlockDialog(props: VaultUnlockDialogProps): ReactElement {
  const { open, onClose, onForgotPassword } = props;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Unlock Vault</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2Muted">
            Enter your vault password to decrypt this device&apos;s project keys.
          </Typography>
          <VaultUnlockForm
            autoFocus
            onUnlocked={onClose}
            onCancel={onClose}
            onForgotPassword={onForgotPassword}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

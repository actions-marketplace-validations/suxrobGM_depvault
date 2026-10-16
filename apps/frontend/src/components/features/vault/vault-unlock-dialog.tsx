"use client";

import { type ReactElement, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { useAppForm } from "@/components/ui/form";
import { useVault } from "@/hooks/use-vault";
import { REMEMBER_DEVICE_DAYS } from "@/lib/constants";
import { vaultUnlockSchema } from "./schemas";

interface VaultUnlockDialogProps {
  open: boolean;
  onClose?: () => void;
  onForgotPassword?: () => void;
  /** Replaces `onClose` on successful unlock, e.g. to retry an action needing the recovery key. */
  onUnlocked?: () => void;
}

export function VaultUnlockDialog(props: VaultUnlockDialogProps): ReactElement {
  const { open, onClose, onForgotPassword, onUnlocked } = props;
  const { unlockVault } = useVault();

  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { password: "", keepUnlocked: false },
    validators: { onSubmit: vaultUnlockSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await unlockVault(value.password, value.keepUnlocked);
        form.reset();
        if (onUnlocked) {
          onUnlocked();
        } else {
          onClose?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unlock vault");
      }
    },
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <DialogTitle>Unlock Vault</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2Muted">
              Enter your vault password to access encrypted secrets.
            </Typography>

            <form.AppField name="password">
              {(field) => <field.TextField label="Vault Password" type="password" autoFocus />}
            </form.AppField>

            <form.AppField name="keepUnlocked">
              {(field) => (
                <field.Checkbox
                  label={`Keep this vault unlocked on this device for ${REMEMBER_DEVICE_DAYS} days`}
                />
              )}
            </form.AppField>

            {error && <Alert severity="error">{error}</Alert>}

            {onForgotPassword && (
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={onForgotPassword}
                sx={{ alignSelf: "flex-start" }}
              >
                Forgot vault password?
              </Link>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {onClose && <Button onClick={onClose}>Cancel</Button>}
          <Button type="submit" variant="contained" disabled={form.state.isSubmitting}>
            {form.state.isSubmitting ? "Unlocking..." : "Unlock"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

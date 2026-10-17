"use client";

import { type ReactElement, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useAppForm } from "@/components/ui/form";
import { useVault } from "@/hooks/use-vault";
import { REMEMBER_DEVICE_DAYS } from "@/lib/constants";
import { vaultRecoverySchema } from "./schemas";

interface VaultRecoveryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function VaultRecoveryDialog(props: VaultRecoveryDialogProps): ReactElement {
  const { open, onClose } = props;
  const { recoverVault } = useVault();

  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      recoveryKey: "",
      newPassword: "",
      confirmPassword: "",
      remember: true,
    },
    validators: { onSubmit: vaultRecoverySchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await recoverVault(value.recoveryKey, value.newPassword, value.remember);
        form.reset();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Recovery failed");
      }
    },
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <DialogTitle>Recover Vault</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Typography variant="body2Muted">
              Enter the recovery key you saved when setting up your vault, then choose a new vault
              password.
            </Typography>

            <form.AppField name="recoveryKey">
              {(field) => (
                <field.TextField
                  label="Recovery Key"
                  autoFocus
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  slotProps={{ htmlInput: { style: { fontFamily: "monospace" } } }}
                />
              )}
            </form.AppField>

            <form.AppField name="newPassword">
              {(field) => <field.TextField label="New Vault Password" type="password" />}
            </form.AppField>

            <form.AppField name="confirmPassword">
              {(field) => <field.TextField label="Confirm New Password" type="password" />}
            </form.AppField>

            <form.AppField name="remember">
              {(field) => (
                <field.Checkbox
                  label={`Remember on this device for ${REMEMBER_DEVICE_DAYS} days`}
                />
              )}
            </form.AppField>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={form.state.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={form.state.isSubmitting}>
            {form.state.isSubmitting ? "Recovering..." : "Recover Vault"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

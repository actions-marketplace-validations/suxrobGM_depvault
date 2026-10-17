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
import { RecoveryKeyDisplay } from "./recovery-key-display";
import { vaultSetupSchema } from "./schemas";

interface VaultSetupDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Local view model: the one-time recovery key plus the remember choice to apply on finish. */
interface CreatedVault {
  recoveryKey: string;
  remember: boolean;
}

export function VaultSetupDialog(props: VaultSetupDialogProps): ReactElement {
  const { open, onClose } = props;
  const { setupVault, activateVault } = useVault();

  const [created, setCreated] = useState<CreatedVault | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { password: "", confirmPassword: "", remember: true },
    validators: { onSubmit: vaultSetupSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const result = await setupVault(value.password);
        setCreated({ recoveryKey: result.recoveryKey, remember: value.remember });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set up vault");
      }
    },
  });

  const handleCancel = () => {
    form.reset();
    setError(null);
    onClose();
  };

  const handleFinish = async () => {
    await activateVault(created?.remember ?? false);
    form.reset();
    setCreated(null);
    onClose();
  };

  if (created) {
    return (
      <RecoveryKeyDisplay
        open={open}
        title="Save Your Recovery Key"
        warning="This is the only time your recovery key will be shown. If you lose your vault password and this key, your encrypted data will be permanently unrecoverable."
        confirmLabel="I have saved my recovery key in a secure location"
        recoveryKey={created.recoveryKey}
        onDone={handleFinish}
      />
    );
  }

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <DialogTitle>Set Up Your Vault</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Typography variant="body2Muted">
              Your vault password encrypts your files end-to-end. It is separate from your login
              password and never sent to the server.
            </Typography>

            <form.AppField name="password">
              {(field) => <field.TextField label="Vault Password" type="password" autoFocus />}
            </form.AppField>

            <form.AppField name="confirmPassword">
              {(field) => <field.TextField label="Confirm Vault Password" type="password" />}
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
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <DialogActions>
              <Button onClick={handleCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                {isSubmitting ? "Setting up..." : "Set Up Vault"}
              </Button>
            </DialogActions>
          )}
        </form.Subscribe>
      </form>
    </Dialog>
  );
}

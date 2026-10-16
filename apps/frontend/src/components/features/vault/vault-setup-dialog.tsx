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
import { RecoveryKeyDisplay } from "./recovery-key-display";
import { vaultSetupSchema } from "./schemas";

interface VaultSetupDialogProps {
  open: boolean;
  onClose: () => void;
}

export function VaultSetupDialog(props: VaultSetupDialogProps): ReactElement {
  const { open, onClose } = props;
  const { setupVault, activateVault } = useVault();

  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: { onSubmit: vaultSetupSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const result = await setupVault(value.password);
        setRecoveryKey(result.recoveryKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set up vault");
      }
    },
  });

  const handleFinish = () => {
    activateVault();
    form.reset();
    setRecoveryKey(null);
    onClose();
  };

  if (recoveryKey) {
    return (
      <RecoveryKeyDisplay
        open={open}
        title="Save Your Recovery Key"
        warning="This is the only time your recovery key will be shown. If you lose your vault password and this key, your encrypted data will be permanently unrecoverable."
        confirmLabel="I have saved my recovery key in a secure location"
        recoveryKey={recoveryKey}
        onDone={handleFinish}
      />
    );
  }

  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
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
              Your vault password encrypts your secrets end-to-end. It is separate from your login
              password and never sent to the server.
            </Typography>

            <form.AppField name="password">
              {(field) => <field.TextField label="Vault Password" type="password" autoFocus />}
            </form.AppField>

            <form.AppField name="confirmPassword">
              {(field) => <field.TextField label="Confirm Vault Password" type="password" />}
            </form.AppField>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={form.state.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={form.state.isSubmitting}>
            {form.state.isSubmitting ? "Setting up..." : "Set Up Vault"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

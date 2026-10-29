"use client";

import { type ReactElement, useState } from "react";
import { Lock as LockIcon, RestartAlt as RestartAltIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { Surface } from "@/components/ui/cards";
import { useAppForm } from "@/components/ui/form";
import { useVault } from "@/hooks/use-vault";
import { vaultChangePasswordSchema } from "./schemas";
import { VaultRecoveryDialog } from "./vault-recovery-dialog";
import { VaultRegenerateRecoveryDialog } from "./vault-regenerate-recovery-dialog";
import { VaultSetupDialog } from "./vault-setup-dialog";
import { VaultUnlockForm } from "./vault-unlock-form";

/** Combined vault security panel: change vault password + regenerate recovery key. */
export function VaultSecurityPanel(): ReactElement {
  const { vaultStatus, changeVaultPassword } = useVault();
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onSubmit: vaultChangePasswordSchema },
    onSubmit: async ({ value }) => {
      setPasswordError(null);
      setPasswordSuccess(false);
      try {
        await changeVaultPassword(value.currentPassword, value.newPassword);
        setPasswordSuccess(true);
        form.reset();
      } catch (err) {
        setPasswordError(err instanceof Error ? err.message : "Failed to change vault password");
      }
    },
  });

  if (vaultStatus === "no-vault") {
    return (
      <Surface className="vault-fade-up vault-delay-4">
        <CardHeader avatar={<LockIcon fontSize="small" />} title="Encryption Vault" />
        <CardContent sx={{ p: 3 }}>
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Typography variant="body2Muted">
              Set up a vault password to enable end-to-end encryption for your project files.
            </Typography>
            <Button variant="contained" onClick={() => setShowSetupDialog(true)}>
              Set up vault
            </Button>
          </Stack>
        </CardContent>
        <VaultSetupDialog open={showSetupDialog} onClose={() => setShowSetupDialog(false)} />
      </Surface>
    );
  }

  if (vaultStatus !== "unlocked") {
    return (
      <>
        <Surface className="vault-fade-up vault-delay-4">
          <CardHeader
            avatar={<LockIcon fontSize="small" />}
            title="Encryption Vault"
            action={<Chip label="Locked" size="small" color="warning" />}
          />
          <CardContent sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="body2Muted">
                Unlock your vault to change its password or regenerate the recovery key.
              </Typography>
              <VaultUnlockForm />

              <Divider />

              <Typography variant="label">Forgot your vault password?</Typography>
              <Typography variant="body2Muted">
                Use the recovery key you saved when setting up your vault to reset your vault
                password and regain access to your encrypted secrets.
              </Typography>
              <Box>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<RestartAltIcon />}
                  onClick={() => setShowRecoveryDialog(true)}
                >
                  Recover with Recovery Key
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Surface>
        <VaultRecoveryDialog
          open={showRecoveryDialog}
          onClose={() => setShowRecoveryDialog(false)}
        />
      </>
    );
  }

  return (
    <>
      <Surface className="vault-fade-up vault-delay-4">
        <CardHeader
          avatar={<LockIcon fontSize="small" />}
          title="Encryption Vault"
          action={<Chip label="Unlocked" size="small" color="success" />}
        />
        <CardContent sx={{ p: 3 }}>
          <form.AppForm>
            <form.Form>
              <Stack spacing={2.5}>
                <Typography variant="label">Change Vault Password</Typography>
                <Typography variant="body2Muted">
                  Your vault password is separate from your login password and never sent to the
                  server.
                </Typography>

                <form.AppField name="currentPassword">
                  {(field) => <field.TextField label="Current Vault Password" type="password" />}
                </form.AppField>
                <form.AppField name="newPassword">
                  {(field) => <field.TextField label="New Vault Password" type="password" />}
                </form.AppField>
                <form.AppField name="confirmPassword">
                  {(field) => (
                    <field.TextField label="Confirm New Vault Password" type="password" />
                  )}
                </form.AppField>

                {passwordError && <Alert severity="error">{passwordError}</Alert>}
                {passwordSuccess && (
                  <Alert severity="success">Vault password changed successfully.</Alert>
                )}

                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <form.SubmitButton pendingLabel="Changing...">
                    Change Vault Password
                  </form.SubmitButton>
                </Box>
              </Stack>
            </form.Form>
          </form.AppForm>

          <Divider sx={{ my: 3 }} />

          <Stack spacing={2}>
            <Typography variant="label">Recovery Key</Typography>
            <Typography variant="body2Muted">
              Generate a new recovery key if you suspect your current one has been compromised. This
              will invalidate the previous key.
            </Typography>
            <Box>
              <Button
                variant="outlined"
                color="warning"
                onClick={() => setShowRegenerateDialog(true)}
              >
                Regenerate Recovery Key
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Surface>
      <VaultRegenerateRecoveryDialog
        open={showRegenerateDialog}
        onClose={() => setShowRegenerateDialog(false)}
      />
    </>
  );
}

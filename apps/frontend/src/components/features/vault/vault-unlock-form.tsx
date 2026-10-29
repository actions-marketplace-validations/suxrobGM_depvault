"use client";

import { type ReactElement, useState } from "react";
import { Alert, Box, Button, Link, Stack } from "@mui/material";
import { useAppForm } from "@/components/ui/form";
import { useVault } from "@/hooks/use-vault";
import { REMEMBER_DEVICE_DAYS } from "@/lib/constants";
import { vaultUnlockSchema } from "./schemas";

interface VaultUnlockFormProps {
  onUnlocked?: () => void;
  onCancel?: () => void;
  onForgotPassword?: () => void;
  autoFocus?: boolean;
}

/** Vault password form shared by the unlock dialog and the inline unlock panel. */
export function VaultUnlockForm(props: VaultUnlockFormProps): ReactElement {
  const { onUnlocked, onCancel, onForgotPassword, autoFocus } = props;
  const { unlockVault } = useVault();
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { password: "", remember: true },
    validators: { onSubmit: vaultUnlockSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await unlockVault(value.password, value.remember);
        form.reset();
        onUnlocked?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unlock vault");
      }
    },
  });

  return (
    <form.AppForm>
      <form.Form>
        <Stack spacing={2}>
          <form.AppField name="password">
            {(field) => (
              <field.TextField label="Vault Password" type="password" autoFocus={autoFocus} />
            )}
          </form.AppField>

          <form.AppField name="remember">
            {(field) => (
              <field.Checkbox label={`Remember on this device for ${REMEMBER_DEVICE_DAYS} days`} />
            )}
          </form.AppField>

          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {onForgotPassword && (
              <Link component="button" type="button" variant="body2" onClick={onForgotPassword}>
                Forgot vault password?
              </Link>
            )}
            <Box sx={{ flex: 1 }} />
            {onCancel && <Button onClick={onCancel}>Cancel</Button>}
            <form.SubmitButton pendingLabel="Unlocking...">Unlock</form.SubmitButton>
          </Stack>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}

"use client";

import type { ReactElement } from "react";
import { Alert, Box, CardActions, CardContent, CardHeader, Stack, Typography } from "@mui/material";
import { useChangeEmail } from "@/api/queries/account";
import { Surface } from "@/components/ui/cards";
import { useAppForm } from "@/components/ui/form";
import { changeEmailSchema } from "./schemas";

interface ChangeEmailCardProps {
  currentEmail: string;
  /** OAuth-only accounts have no password to confirm the change with. */
  hasPassword: boolean;
}

/** Changes the login email after re-entering the password. */
export function ChangeEmailCard(props: ChangeEmailCardProps): ReactElement {
  const { currentEmail, hasPassword } = props;

  const mutation = useChangeEmail({ onSuccess: () => form.reset() });

  const form = useAppForm({
    defaultValues: { newEmail: "", password: "" },
    validators: { onSubmit: changeEmailSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value);
    },
  });

  return (
    <Surface className="vault-fade-up vault-delay-2">
      <CardHeader title="Change Email" />
      {hasPassword ? (
        <form.AppForm>
          <form.Form>
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="body2Muted" sx={{ mb: 1 }}>
                    Current email
                  </Typography>
                  <Typography variant="body1">{currentEmail}</Typography>
                </Box>
                <form.AppField name="newEmail">
                  {(field) => <field.TextField label="New Email" type="email" autoComplete="off" />}
                </form.AppField>
                <form.AppField name="password">
                  {(field) => (
                    <field.TextField label="Confirm Password" type="password" autoComplete="off" />
                  )}
                </form.AppField>
              </Stack>
            </CardContent>
            <CardActions>
              <form.SubmitButton pendingLabel="Updating...">Update Email</form.SubmitButton>
            </CardActions>
          </form.Form>
        </form.AppForm>
      ) : (
        <CardContent sx={{ p: 3 }}>
          <Alert severity="info">Set a password first to enable email changes.</Alert>
        </CardContent>
      )}
    </Surface>
  );
}

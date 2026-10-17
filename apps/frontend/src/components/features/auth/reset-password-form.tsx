"use client";

import { type ReactElement, useState } from "react";
import { Alert, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { resetPasswordAction } from "@/auth/actions";
import { useAppForm } from "@/components/ui/form";
import { ROUTES } from "@/lib/constants";
import { resetPasswordSchema } from "./schemas";

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm(props: ResetPasswordFormProps): ReactElement {
  const { token } = props;

  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useAppForm({
    defaultValues: { password: "", confirmPassword: "" },
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const result = await resetPasswordAction(token, value.password);
      if (!result.success) {
        setServerError(result.error ?? "Reset failed");
        return;
      }
      setSuccess(true);
    },
  });

  if (success) {
    return (
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
        }}
      >
        <Alert severity="success" sx={{ width: "100%" }}>
          Password reset successfully. You can now sign in with your new password.
        </Alert>
        <Typography variant="body2">
          <Link href={ROUTES.login}>Go to sign in</Link>
        </Typography>
      </Stack>
    );
  }

  return (
    <form.AppForm>
      <form.Form>
        <Stack spacing={2.5}>
          {serverError && <Alert severity="error">{serverError}</Alert>}

          <form.AppField name="password">
            {(field) => (
              <field.TextField
                label="New Password"
                type="password"
                autoComplete="new-password"
                autoFocus
              />
            )}
          </form.AppField>

          <form.AppField name="confirmPassword">
            {(field) => (
              <field.TextField
                label="Confirm New Password"
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.AppField>

          <form.SubmitButton size="large" fullWidth pendingLabel="Resetting...">
            Reset password
          </form.SubmitButton>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}

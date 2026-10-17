"use client";

import { type ReactElement, useState } from "react";
import { Alert, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { forgotPasswordAction } from "@/auth/actions";
import { useAppForm } from "@/components/ui/form";
import { ROUTES } from "@/lib/constants";
import { forgotPasswordSchema } from "./schemas";

export function ForgotPasswordForm(): ReactElement {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const result = await forgotPasswordAction(value.email);
      if (!result.success) {
        setServerError(result.error ?? "Request failed");
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
          If an account with that email exists, we&apos;ve sent a password reset link.
        </Alert>
        <Typography variant="body2">
          <Link href={ROUTES.login}>Back to sign in</Link>
        </Typography>
      </Stack>
    );
  }

  return (
    <form.AppForm>
      <form.Form>
        <Stack spacing={2.5}>
          {serverError && <Alert severity="error">{serverError}</Alert>}

          <form.AppField name="email">
            {(field) => (
              <field.TextField label="Email" type="email" autoComplete="email" autoFocus />
            )}
          </form.AppField>

          <form.SubmitButton size="large" fullWidth pendingLabel="Sending...">
            Send reset link
          </form.SubmitButton>

          <Typography
            variant="body2"
            sx={{
              textAlign: "center",
            }}
          >
            <Link href={ROUTES.login}>Back to sign in</Link>
          </Typography>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}

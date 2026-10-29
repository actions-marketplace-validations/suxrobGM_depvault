"use client";

import type { ReactElement } from "react";
import { Alert, CardActions, CardContent, CardHeader, Stack } from "@mui/material";
import { useChangePassword } from "@/api/queries/account";
import { Surface } from "@/components/ui/cards";
import { useAppForm } from "@/components/ui/form";
import { changePasswordSchema, setPasswordSchema } from "./schemas";

interface PasswordCardProps {
  hasPassword: boolean;
  /** Called once an OAuth-only account has set its first password. */
  onPasswordSet: () => void;
}

interface SetPasswordFormProps {
  onPasswordSet: () => void;
}

/** "Change Password" for accounts with one, "Set Password" for OAuth-only accounts. */
export function PasswordCard(props: PasswordCardProps): ReactElement {
  const { hasPassword, onPasswordSet } = props;

  return (
    <Surface className="vault-fade-up vault-delay-3">
      <CardHeader title={hasPassword ? "Change Password" : "Set Password"} />
      {hasPassword ? <ChangePasswordForm /> : <SetPasswordForm onPasswordSet={onPasswordSet} />}
    </Surface>
  );
}

function ChangePasswordForm(): ReactElement {
  const mutation = useChangePassword({ onSuccess: () => form.reset() });

  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      });
    },
  });

  return (
    <form.AppForm>
      <form.Form>
        <CardContent sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <form.AppField name="currentPassword">
              {(field) => <field.TextField label="Current Password" type="password" />}
            </form.AppField>
            <form.AppField name="newPassword">
              {(field) => <field.TextField label="New Password" type="password" />}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => <field.TextField label="Confirm New Password" type="password" />}
            </form.AppField>
          </Stack>
        </CardContent>
        <CardActions>
          <form.SubmitButton pendingLabel="Changing...">Change Password</form.SubmitButton>
        </CardActions>
      </form.Form>
    </form.AppForm>
  );
}

function SetPasswordForm(props: SetPasswordFormProps): ReactElement {
  const { onPasswordSet } = props;

  const mutation = useChangePassword({
    successMessage: "Password set successfully. You can now log in with email and password.",
    onSuccess: () => {
      form.reset();
      onPasswordSet();
    },
  });

  const form = useAppForm({
    defaultValues: { password: "", confirmPassword: "" },
    validators: { onSubmit: setPasswordSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ newPassword: value.password });
    },
  });

  return (
    <form.AppForm>
      <form.Form>
        <CardContent sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <Alert severity="info" sx={{ mb: 1 }}>
              Your account was created via GitHub. Set a password to also log in with email and
              password.
            </Alert>
            <form.AppField name="password">
              {(field) => <field.TextField label="Password" type="password" />}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => <field.TextField label="Confirm Password" type="password" />}
            </form.AppField>
          </Stack>
        </CardContent>
        <CardActions>
          <form.SubmitButton pendingLabel="Setting...">Set Password</form.SubmitButton>
        </CardActions>
      </form.Form>
    </form.AppForm>
  );
}

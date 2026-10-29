"use client";

import { type ReactElement, useState } from "react";
import { UserRole } from "@depvault/shared/constants";
import { GitHub as GitHubIcon } from "@mui/icons-material";
import { Alert, Button, Divider, Stack, Typography } from "@mui/material";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { client } from "@/api/client";
import { useAppForm } from "@/components/ui/form";
import { ROUTES } from "@/lib/constants";
import { githubAuthUrl, safeRedirect, withRedirect } from "@/utils/url";
import { loginSchema } from "./schemas";

export function LoginForm(): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const redirectParam = searchParams.get("redirect");
  const registerHref = withRedirect(ROUTES.register, redirectParam);

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const { data, error } = await client.api.auth.session.post(value);
      const role = data?.user?.role;

      if (error) {
        setServerError(error.value.message ?? "Login failed");
        return;
      }

      const redirectTo = safeRedirect(redirectParam);
      if (redirectTo) {
        router.push(redirectTo as Route);
      } else if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
        router.push(ROUTES.admin);
      } else {
        router.push(ROUTES.overview);
      }
    },
  });

  return (
    <Stack spacing={2.5}>
      <Button
        variant="outlined"
        size="large"
        fullWidth
        startIcon={<GitHubIcon />}
        href={githubAuthUrl(redirectParam)}
        component="a"
      >
        Sign in with GitHub
      </Button>
      <Divider>
        <Typography variant="captionMuted">or</Typography>
      </Divider>
      <form.AppForm>
        <form.Form>
          <Stack spacing={2.5}>
            {serverError && <Alert severity="error">{serverError}</Alert>}

            <form.AppField name="email">
              {(field) => (
                <field.TextField label="Email" type="email" autoComplete="email" autoFocus />
              )}
            </form.AppField>

            <form.AppField name="password">
              {(field) => (
                <field.TextField label="Password" type="password" autoComplete="current-password" />
              )}
            </form.AppField>

            <form.SubmitButton size="large" fullWidth pendingLabel="Signing in...">
              Sign in
            </form.SubmitButton>

            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2">
                <Link href={ROUTES.forgotPassword} style={{ color: "inherit" }}>
                  Forgot password?
                </Link>
              </Typography>
              <Typography variant="body2">
                <Link href={registerHref} style={{ color: "inherit" }}>
                  Create account
                </Link>
              </Typography>
            </Stack>
          </Stack>
        </form.Form>
      </form.AppForm>
    </Stack>
  );
}

"use client";

import { type ReactElement, useEffect, useState } from "react";
import { GitHub as GitHubIcon, MarkEmailRead as MarkEmailReadIcon } from "@mui/icons-material";
import { Alert, Button, Divider, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { client } from "@/api/client";
import type { InvitationInfoDto } from "@/api/types/project";
import { useAppForm } from "@/components/ui/form";
import { ROUTES } from "@/lib/constants";
import { githubAuthUrl, withRedirect } from "@/utils/url";
import { registerSchema } from "./schemas";

export function RegisterForm(): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("inviteToken") ?? undefined;

  const [serverError, setServerError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfoDto | null>(null);

  const invitedEmail = invitationInfo?.email;
  const redirectParam = searchParams.get("redirect");
  const loginHref = withRedirect(ROUTES.login, redirectParam);

  const form = useAppForm({
    defaultValues: { email: "", firstName: "", lastName: "", password: "", confirmPassword: "" },
    validators: { onSubmit: registerSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const { error } = await client.api.auth.register.post({
        email: invitedEmail ?? value.email,
        firstName: value.firstName,
        lastName: value.lastName,
        password: value.password,
        inviteToken,
      });

      if (error) {
        setServerError(error.value.message ?? "Registration failed");
        return;
      }

      if (inviteToken) {
        router.push(loginHref);
      } else {
        setRegistered(true);
      }
    },
  });

  useEffect(() => {
    if (!inviteToken) {
      return;
    }
    client.api
      .invitations({ token: inviteToken })
      .info.get()
      .then(({ data }) => {
        if (data) {
          setInvitationInfo(data);
        }
      });
  }, [inviteToken]);

  useEffect(() => {
    if (invitedEmail) {
      form.setFieldValue("email", invitedEmail);
    }
  }, [invitedEmail, form]);

  if (registered) {
    return (
      <Stack
        spacing={2.5}
        sx={{
          alignItems: "center",
        }}
      >
        <MarkEmailReadIcon sx={{ fontSize: 48, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Check your email
        </Typography>
        <Typography variant="body2Muted" sx={{ textAlign: "center" }}>
          We&apos;ve sent a verification link to your email address. Please verify your email to
          activate your account.
        </Typography>
        <Typography variant="body2">
          <Link href={loginHref} style={{ color: "inherit" }}>
            Go to sign in
          </Link>
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      {invitationInfo && (
        <Alert severity="info">
          You&apos;ve been invited to join <strong>{invitationInfo.projectName}</strong>. Create an
          account to get started.
        </Alert>
      )}
      <Button
        variant="outlined"
        size="large"
        fullWidth
        startIcon={<GitHubIcon />}
        href={githubAuthUrl(redirectParam)}
        component="a"
      >
        Sign up with GitHub
      </Button>
      <Divider>
        <Typography variant="captionMuted">or</Typography>
      </Divider>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <Stack spacing={2.5}>
          {serverError && <Alert severity="error">{serverError}</Alert>}

          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label="Email"
                type="email"
                autoComplete="email"
                autoFocus={!invitedEmail}
                disabled={!!invitedEmail}
              />
            )}
          </form.AppField>

          <Stack direction="column" spacing={2}>
            <form.AppField name="firstName">
              {(field) => <field.TextField label="First Name" autoComplete="given-name" />}
            </form.AppField>
            <form.AppField name="lastName">
              {(field) => <field.TextField label="Last Name" autoComplete="family-name" />}
            </form.AppField>
          </Stack>

          <form.AppField name="password">
            {(field) => (
              <field.TextField label="Password" type="password" autoComplete="new-password" />
            )}
          </form.AppField>

          <form.AppField name="confirmPassword">
            {(field) => (
              <field.TextField
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.AppField>

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={form.state.isSubmitting}
          >
            {form.state.isSubmitting ? "Creating account..." : "Create account"}
          </Button>

          <Typography variant="body2" sx={{ textAlign: "center" }}>
            Already have an account?{" "}
            <Link href={loginHref} style={{ color: "inherit" }}>
              Sign in
            </Link>
          </Typography>
        </Stack>
      </form>
    </Stack>
  );
}

"use client";

import { type ReactElement, useEffect, useRef, useState } from "react";
import { GitHub as GitHubIcon, MarkEmailRead as MarkEmailReadIcon } from "@mui/icons-material";
import { Alert, Box, Button, Divider, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { client } from "@/api/client";
import type { InvitationInfoDto } from "@/api/types/project";
import { useAppForm } from "@/components/ui/form";
import { ROUTES } from "@/lib/constants";
import { githubAuthUrl, withRedirect } from "@/utils/url";
import { registerSchema } from "./schemas";
import { isCaptchaReady, TurnstileWidget } from "./turnstile-widget";

export function RegisterForm(): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("inviteToken");

  const [serverError, setServerError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfoDto | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const invitedEmail = invitationInfo?.email;
  const redirectParam = searchParams.get("redirect");
  const loginHref = withRedirect(ROUTES.login, redirectParam);

  const form = useAppForm({
    defaultValues: { email: "", firstName: "", lastName: "", password: "", confirmPassword: "" },
    validators: { onSubmit: registerSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const { error } = await client.api.auth.accounts.post({
        email: invitedEmail ?? value.email,
        firstName: value.firstName,
        lastName: value.lastName,
        password: value.password,
        ...(inviteToken && { inviteToken }),
        ...(captchaToken && { captchaToken }),
        ...(honeypotRef.current?.value && { website: honeypotRef.current.value }),
      });

      if (error) {
        setServerError(error.value.message ?? "Registration failed");
        setCaptchaToken(null);
        setCaptchaKey((key) => key + 1);
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
      <form.AppForm>
        <form.Form>
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

            {/* Honeypot: off-screen and skipped by keyboard and screen readers, so only bots fill it */}
            <Box
              component="input"
              ref={honeypotRef}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              sx={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }}
            />

            <TurnstileWidget key={captchaKey} onTokenChange={setCaptchaToken} />

            <form.SubmitButton
              size="large"
              fullWidth
              pendingLabel="Creating account..."
              disabled={!isCaptchaReady(captchaToken)}
            >
              Create account
            </form.SubmitButton>

            <Typography variant="body2" sx={{ textAlign: "center" }}>
              Already have an account?{" "}
              <Link href={loginHref} style={{ color: "inherit" }}>
                Sign in
              </Link>
            </Typography>
          </Stack>
        </form.Form>
      </form.AppForm>
    </Stack>
  );
}

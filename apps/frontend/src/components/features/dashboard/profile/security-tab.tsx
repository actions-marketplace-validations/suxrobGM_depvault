"use client";

import type { ReactElement } from "react";
import { Stack } from "@mui/material";
import { useAuth } from "@/auth/use-auth";
import { VaultSecurityPanel } from "@/components/features/vault";
import { LoadingSpinner } from "@/components/ui/feedback";
import { ChangeEmailCard } from "./change-email-card";
import { DangerZoneCard } from "./danger-zone-card";
import { GitHubLinkCard } from "./github-link-card";
import { PasswordCard } from "./password-card";

/** Profile security: GitHub link, email, password, vault and account deletion. */
export function SecurityTab(): ReactElement {
  const { user, setUser } = useAuth();

  if (!user) {
    return <LoadingSpinner />;
  }

  return (
    <Stack spacing={3}>
      <GitHubLinkCard githubId={user.githubId} githubUsername={user.githubUsername} />
      <ChangeEmailCard currentEmail={user.email} hasPassword={user.hasPassword} />
      <PasswordCard
        hasPassword={user.hasPassword}
        onPasswordSet={() => setUser({ ...user, hasPassword: true })}
      />
      <VaultSecurityPanel />
      <DangerZoneCard />
    </Stack>
  );
}

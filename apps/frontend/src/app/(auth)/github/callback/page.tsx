import { type ReactElement, Suspense } from "react";
import { decodeOAuthState } from "@depvault/shared/utils";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServerClient } from "@/api/server";
import { AuthStatus } from "@/components/features/auth";
import { LoadingSpinner } from "@/components/ui/feedback";
import { ROUTES } from "@/lib/constants";

interface Props {
  searchParams: Promise<{ code?: string; state?: string }>;
}

async function GitHubCallbackResult(props: Props): Promise<ReactElement> {
  const { code, state } = await props.searchParams;

  if (!code) {
    return (
      <AuthStatus
        title="GitHub Sign In"
        message="Missing authorization code from GitHub."
        linkHref={ROUTES.login}
        linkText="Back to sign in"
      />
    );
  }

  const client = await getServerClient();
  const { error } = await client.api.auth.github.callback.get({ query: { code, state } });

  if (!error) {
    const returnTo = decodeOAuthState(state ?? null);
    redirect((returnTo as Route) ?? ROUTES.overview);
  }

  return (
    <AuthStatus
      title="GitHub Sign In"
      message={error.value.message ?? "GitHub authentication failed."}
      linkHref={ROUTES.login}
      linkText="Back to sign in"
    />
  );
}

export default function GitHubCallbackPage(props: Props): ReactElement {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <GitHubCallbackResult searchParams={props.searchParams} />
    </Suspense>
  );
}

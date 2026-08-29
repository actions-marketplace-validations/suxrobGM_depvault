import type { ReactElement } from "react";
import { decodeOAuthState } from "@depvault/shared/utils";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServerClient } from "@/api/server";
import { AuthStatus } from "@/components/features/auth";
import { ROUTES } from "@/lib/constants";

interface Props {
  searchParams: Promise<{ code: string | null; state: string | null }>;
}

export default async function GitHubCallbackPage(props: Props): Promise<ReactElement> {
  const searchParams = await props.searchParams;
  const code = searchParams.code;

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
  const { error } = await client.api.auth.github.callback.get({
    query: { code, state: searchParams.state ?? undefined },
  });

  if (!error) {
    const returnTo = decodeOAuthState(searchParams.state);
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

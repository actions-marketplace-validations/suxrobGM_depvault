import { type ReactElement, Suspense } from "react";
import type { Metadata } from "next";
import { verifyEmailAction } from "@/auth/actions";
import { AuthStatus } from "@/components/features/auth";
import { LoadingSpinner } from "@/components/ui/feedback";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify your email address to complete your DepVault registration.",
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

async function VerifyEmailResult(props: Props): Promise<ReactElement> {
  const { token } = await props.searchParams;

  if (!token) {
    return (
      <AuthStatus
        title="Email Verification"
        message="Invalid verification link."
        linkHref={ROUTES.login}
        linkText="Back to sign in"
      />
    );
  }

  const result = await verifyEmailAction(token);

  return (
    <AuthStatus
      title="Email Verification"
      severity={result.success ? "success" : "error"}
      message={
        result.success ? "Your email has been verified successfully." : "Verification failed."
      }
      linkHref={ROUTES.login}
      linkText={result.success ? "Go to sign in" : "Back to sign in"}
    />
  );
}

export default function VerifyEmailPage(props: Props): ReactElement {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <VerifyEmailResult searchParams={props.searchParams} />
    </Suspense>
  );
}

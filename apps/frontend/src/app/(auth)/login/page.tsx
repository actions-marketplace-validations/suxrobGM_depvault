import { type ReactElement, Suspense } from "react";
import type { Metadata } from "next";
import { AuthCard, AuthFormSkeleton, LoginForm } from "@/components/features/auth";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your DepVault account to manage dependencies, detect vulnerabilities, and secure your environment variables.",
};

export default function LoginPage(): ReactElement {
  return (
    <AuthCard title="Sign in to DepVault" subtitle="Enter your credentials to continue">
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

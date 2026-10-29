import { type ReactElement, Suspense } from "react";
import type { Metadata } from "next";
import { AuthCard, AuthFormSkeleton, DeviceVerifyForm } from "@/components/features/auth";

export const metadata: Metadata = {
  title: "Authorize CLI",
  description: "Verify your CLI device code to complete authentication.",
};

export default function CliVerifyPage(): ReactElement {
  return (
    <AuthCard title="Authorize CLI" subtitle="Enter the code shown in your terminal to sign in">
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <DeviceVerifyForm />
      </Suspense>
    </AuthCard>
  );
}

import { type PropsWithChildren, type ReactElement, Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/api/server";
import { AuthProvider } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { ROUTES } from "@/lib/constants";
import { AppProviders } from "@/providers/app-providers";
import { VaultProvider } from "@/providers/vault-provider";
import DashboardLoading from "./loading";

async function AuthenticatedShell(props: PropsWithChildren): Promise<ReactElement> {
  const { children } = props;
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  return (
    <AuthProvider initialUser={user}>
      <VaultProvider>
        <AppShell>{children}</AppShell>
      </VaultProvider>
    </AuthProvider>
  );
}

export default function DashboardLayout(props: PropsWithChildren): ReactElement {
  const { children } = props;
  return (
    <AppProviders>
      <Suspense
        fallback={
          <AppShellSkeleton>
            <DashboardLoading />
          </AppShellSkeleton>
        }
      >
        <AuthenticatedShell>{children}</AuthenticatedShell>
      </Suspense>
    </AppProviders>
  );
}

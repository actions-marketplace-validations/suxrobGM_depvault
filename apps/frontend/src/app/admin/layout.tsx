import { type PropsWithChildren, type ReactElement, Suspense } from "react";
import { UserRole } from "@depvault/shared/constants";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/api/server";
import { AuthProvider } from "@/auth";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { ROUTES } from "@/lib/constants";
import { AppProviders } from "@/providers/app-providers";

async function AuthenticatedAdminSidebar(props: PropsWithChildren): Promise<ReactElement> {
  const { children } = props;
  const user = await getCurrentUser();

  if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
    redirect(ROUTES.overview);
  }

  return (
    <AuthProvider initialUser={user}>
      <AdminSidebar>{children}</AdminSidebar>
    </AuthProvider>
  );
}

export default function AdminLayout(props: PropsWithChildren): ReactElement {
  const { children } = props;
  return (
    <AppProviders>
      <Suspense>
        <AuthenticatedAdminSidebar>{children}</AuthenticatedAdminSidebar>
      </Suspense>
    </AppProviders>
  );
}

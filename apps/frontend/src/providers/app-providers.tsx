import type { PropsWithChildren, ReactElement } from "react";
import { ConfirmProvider } from "./confirm-provider";
import { NotificationProvider } from "./notification-provider";
import { QueryProvider } from "./query-provider";
import { PlanLimitProvider } from "./subscription-provider";

/** Client providers shared by the signed-in areas (dashboard and admin). */
export function AppProviders(props: PropsWithChildren): ReactElement {
  const { children } = props;
  return (
    <QueryProvider>
      <NotificationProvider>
        <ConfirmProvider>
          <PlanLimitProvider>{children}</PlanLimitProvider>
        </ConfirmProvider>
      </NotificationProvider>
    </QueryProvider>
  );
}

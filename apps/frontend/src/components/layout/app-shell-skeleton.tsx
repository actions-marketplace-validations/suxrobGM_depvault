import type { PropsWithChildren, ReactElement } from "react";
import { Divider, Drawer, List, Skeleton, Stack, Toolbar } from "@mui/material";
import Image from "next/image";
import { AppShellFrame } from "./app-shell-frame";
import { SIDEBAR_WIDTH } from "./constants";
import { NAV_ITEMS } from "./nav-items";

/** Static frame of `AppShell` shown while the session resolves, so a hard load never paints blank. */
export function AppShellSkeleton(props: PropsWithChildren): ReactElement {
  const { children } = props;

  return (
    <AppShellFrame
      sidebarWidth={SIDEBAR_WIDTH}
      sidebar={
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH },
          }}
        >
          <Toolbar sx={{ px: 2 }}>
            <Image src="/depvault-logo-dark.svg" alt="DepVault" width={130} height={37} priority />
          </Toolbar>
          <Divider />
          <List sx={{ px: 1 }}>
            {NAV_ITEMS.map((item) => (
              <Stack
                key={item.href}
                direction="row"
                spacing={2}
                sx={{ alignItems: "center", px: 2, py: 1.25 }}
              >
                <Skeleton variant="circular" width={24} height={24} />
                <Skeleton variant="text" width={110} />
              </Stack>
            ))}
          </List>
        </Drawer>
      }
    >
      {children}
    </AppShellFrame>
  );
}

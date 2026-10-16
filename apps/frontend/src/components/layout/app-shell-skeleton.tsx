import type { PropsWithChildren, ReactElement } from "react";
import { Box, Divider, Drawer, List, Skeleton, Stack, Toolbar } from "@mui/material";
import Image from "next/image";
import { SIDEBAR_WIDTH } from "./constants";

const NAV_PLACEHOLDERS = [
  "overview",
  "projects",
  "activity",
  "security",
  "notifications",
  "settings",
];

/** Static frame of `AppShell` shown while the session resolves, so a hard load never paints blank. */
export function AppShellSkeleton(props: PropsWithChildren): ReactElement {
  const { children } = props;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      <Box className="vault-gradient-mesh-subtle" />
      <Box className="vault-dot-grid" />
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
          {NAV_PLACEHOLDERS.map((key) => (
            <Stack
              key={key}
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
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
          ml: { md: `${SIDEBAR_WIDTH}px` },
          p: 3,
          position: "relative",
          zIndex: 1,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

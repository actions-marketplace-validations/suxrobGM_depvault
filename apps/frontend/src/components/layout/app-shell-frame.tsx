import type { PropsWithChildren, ReactElement, ReactNode } from "react";
import { Box } from "@mui/material";

interface AppShellFrameProps extends PropsWithChildren {
  sidebar: ReactNode;
  sidebarWidth: number;
}

/** Hook-free layout frame shared by `AppShell` and `AppShellSkeleton` so the swap never shifts. */
export function AppShellFrame(props: AppShellFrameProps): ReactElement {
  const { sidebar, sidebarWidth, children } = props;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      <Box className="vault-gradient-mesh-subtle" />
      <Box className="vault-dot-grid" />
      {sidebar}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${sidebarWidth}px)` },
          ml: { md: `${sidebarWidth}px` },
          transition: "width 225ms, margin-left 225ms",
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

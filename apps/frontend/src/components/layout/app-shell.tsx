"use client";

import { type PropsWithChildren, type ReactElement, useState } from "react";
import { Menu as MenuIcon } from "@mui/icons-material";
import { IconButton } from "@mui/material";
import { AppShellFrame } from "./app-shell-frame";
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from "./constants";
import { Sidebar } from "./sidebar";

export function AppShell(props: PropsWithChildren): ReactElement {
  const { children } = props;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AppShellFrame
      sidebarWidth={sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH}
      sidebar={
        <Sidebar
          open={sidebarOpen}
          mobileOpen={mobileOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          onMobileClose={() => setMobileOpen(false)}
        />
      }
    >
      <IconButton
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        sx={{ display: { xs: "flex", md: "none" }, mb: 1 }}
      >
        <MenuIcon />
      </IconButton>
      {children}
    </AppShellFrame>
  );
}

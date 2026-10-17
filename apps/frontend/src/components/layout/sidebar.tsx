"use client";

import type { ReactElement } from "react";
import { UserRole } from "@depvault/shared/constants";
import {
  AdminPanelSettings as AdminPanelSettingsIcon,
  ChevronLeft as ChevronLeftIcon,
} from "@mui/icons-material";
import { Box, Divider, Drawer, IconButton, List, Stack, Toolbar } from "@mui/material";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/auth/use-auth";
import { NotificationBell } from "@/components/features/dashboard/notifications";
import { VaultLockButton } from "@/components/features/vault";
import { ROUTES } from "@/lib/constants";
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from "./constants";
import { FeedbackMenu } from "./feedback-menu";
import { NAV_ITEMS } from "./nav-items";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarUserCard } from "./sidebar-user-card";

interface SidebarProps {
  open: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
}

const allHrefs = NAV_ITEMS.map((item) => item.href);

/** Active unless a more specific nav item (e.g. `/settings/billing` vs `/settings`) matches. */
function isNavItemActive(href: string, pathname: string): boolean {
  const matchesPath = pathname === href || pathname.startsWith(`${href}/`);
  if (!matchesPath) {
    return false;
  }

  return !allHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(href) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

export function Sidebar(props: SidebarProps): ReactElement {
  const { open, mobileOpen, onToggle, onMobileClose } = props;

  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: open ? "space-between" : "center",
          px: open ? 2 : 0,
          minHeight: open ? undefined : 56,
        }}
      >
        {open ? (
          <>
            <Image src="/depvault-logo-dark.svg" alt="DepVault" width={130} height={37} />
            <IconButton
              onClick={onToggle}
              aria-label="Collapse sidebar"
              sx={{ display: { xs: "none", md: "flex" } }}
            >
              <ChevronLeftIcon />
            </IconButton>
          </>
        ) : (
          <IconButton
            onClick={onToggle}
            aria-label="Expand sidebar"
            sx={{ display: { xs: "none", md: "flex" } }}
          >
            <Image src="/depvault-icon.svg" alt="" width={24} height={30} />
          </IconButton>
        )}
      </Toolbar>
      <Divider />
      <List sx={{ px: open ? 1 : 0.5, flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isNavItemActive(item.href, pathname)}
            expanded={open}
            onNavigate={onMobileClose}
          />
        ))}
      </List>
      {isAdmin && (
        <>
          <Divider />
          <List sx={{ px: open ? 1 : 0.5 }}>
            <SidebarNavItem
              href={ROUTES.admin}
              label="Admin"
              icon={<AdminPanelSettingsIcon />}
              active={pathname.startsWith(ROUTES.admin)}
              expanded={open}
              onNavigate={onMobileClose}
            />
          </List>
        </>
      )}
      {user && (
        <>
          <Divider />
          {open ? (
            <List sx={{ px: 1, py: 0.5 }}>
              <FeedbackMenu open={open} />
              <VaultLockButton open={open} />
              <NotificationBell open={open} />
            </List>
          ) : (
            <Stack spacing={0.5} sx={{ alignItems: "center", py: 0.75 }}>
              <FeedbackMenu open={open} />
              <VaultLockButton open={open} />
              <NotificationBell open={open} />
            </Stack>
          )}
          <Divider />
          <SidebarUserCard expanded={open} />
        </>
      )}
    </Box>
  );

  return (
    <Box component="nav" aria-label="Main navigation">
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH },
        }}
      >
        {drawerContent}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            width: open ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
            transition: "width 225ms",
            overflowX: "hidden",
          },
        }}
        open={open}
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
}

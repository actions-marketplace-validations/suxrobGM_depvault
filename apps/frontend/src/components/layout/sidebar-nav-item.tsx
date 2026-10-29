"use client";

import type { ReactElement, ReactNode } from "react";
import { ListItemButton, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import type { Route } from "next";
import Link from "next/link";

interface SidebarNavItemProps {
  href: Route;
  label: string;
  icon: ReactNode;
  active: boolean;
  /** Collapsed sidebars show only the icon, so the label moves to a tooltip and aria-label. */
  expanded: boolean;
  onNavigate?: () => void;
}

/** One sidebar link; icon-only (with tooltip) when the sidebar is collapsed. */
export function SidebarNavItem(props: SidebarNavItemProps): ReactElement {
  const { href, label, icon, active, expanded, onNavigate } = props;

  return (
    <Tooltip title={expanded ? "" : label} placement="right">
      <ListItemButton
        component={Link}
        href={href}
        selected={active}
        aria-current={active ? "page" : undefined}
        aria-label={expanded ? undefined : label}
        onClick={onNavigate}
        sx={{
          mb: 0.5,
          justifyContent: expanded ? "initial" : "center",
          px: expanded ? 2 : 1.5,
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: expanded ? 40 : "auto",
            justifyContent: "center",
            color: active ? "primary.main" : "text.secondary",
          }}
        >
          {icon}
        </ListItemIcon>
        {expanded && <ListItemText primary={label} />}
      </ListItemButton>
    </Tooltip>
  );
}

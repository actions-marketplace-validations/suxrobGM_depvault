"use client";

import { cloneElement, type MouseEvent, type ReactElement, useState } from "react";
import { displayName } from "@depvault/shared/utils";
import {
  Logout as LogoutIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/use-auth";
import { UserAvatar } from "@/components/ui/data-display";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import { ROUTES } from "@/lib/constants";

interface MenuTriggerProps {
  onClick?: (e: MouseEvent<HTMLElement>) => void;
}

interface UserMenuProps {
  trigger: ReactElement<MenuTriggerProps>;
}

export function UserMenu(props: UserMenuProps): ReactElement {
  const { trigger } = props;
  const { user, logout } = useAuth();
  const router = useRouter();
  const confirmDiscard = useConfirmDiscard();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  /** Menu items navigate imperatively, so they ask about unsaved file drafts themselves. */
  const leaveTo = async (route: Route) => {
    handleClose();
    if (await confirmDiscard()) router.push(route);
  };

  const handleLogout = async () => {
    handleClose();
    if (await confirmDiscard()) logout();
  };

  const name = user && displayName(user);

  return (
    <>
      {cloneElement(trigger, { onClick: handleOpen })}
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={handleClose}
        transformOrigin={{ horizontal: "left", vertical: "bottom" }}
        anchorOrigin={{ horizontal: "left", vertical: "top" }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        {user && (
          <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
            <UserAvatar
              firstName={user.firstName}
              lastName={user.lastName}
              email={user.email}
              avatarUrl={user.avatarUrl}
              size={36}
            />
            <Box sx={{ minWidth: 0 }}>
              {name && (
                <Typography variant="label" noWrap>
                  {name}
                </Typography>
              )}
              <Typography variant="captionMuted" noWrap component="div">
                {user.email}
              </Typography>
            </Box>
          </Box>
        )}
        <Divider />
        <MenuItem onClick={() => leaveTo(ROUTES.profileGeneral)}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Profile</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => leaveTo(ROUTES.settings)}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ color: "error.main" }}>
          <ListItemIcon sx={{ color: "inherit" }}>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

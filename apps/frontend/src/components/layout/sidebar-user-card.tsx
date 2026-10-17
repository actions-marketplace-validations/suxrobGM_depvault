"use client";

import type { ReactElement } from "react";
import { DEFAULT_ROLES } from "@depvault/shared/constants";
import { displayName } from "@depvault/shared/utils";
import { ChevronRight as ChevronRightIcon } from "@mui/icons-material";
import { Box, ButtonBase, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { useAuth } from "@/auth/use-auth";
import { UserAvatar } from "@/components/ui/data-display";
import { useSubscription } from "@/hooks/use-subscription";
import { PLAN_VARIANT } from "@/lib/constants";
import { UserMenu } from "./user-menu";

interface SidebarUserCardProps {
  expanded: boolean;
}

/** Avatar, name, role and plan at the bottom of the sidebar; opens the user menu. */
export function SidebarUserCard(props: SidebarUserCardProps): ReactElement | null {
  const { expanded } = props;
  const { user } = useAuth();
  const { plan } = useSubscription();

  if (!user) return null;

  const name = displayName(user, user.email);
  const showRoleBadge = !DEFAULT_ROLES.has(user.role);

  return (
    <UserMenu
      trigger={
        <Tooltip title={expanded ? "" : name} placement="right">
          <ButtonBase
            aria-label={`Account menu for ${name}`}
            aria-haspopup="menu"
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: expanded ? "flex-start" : "center",
              gap: 1.5,
              width: "100%",
              textAlign: "left",
              borderRadius: 1.5,
              mx: expanded ? 1 : 0.5,
              px: expanded ? 1 : 0.5,
              py: 1,
              transition: "background-color 150ms",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Box sx={{ position: "relative", flexShrink: 0 }}>
              <UserAvatar
                firstName={user.firstName}
                lastName={user.lastName}
                email={user.email}
                avatarUrl={user.avatarUrl}
                size={34}
              />
              <Box
                sx={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 10,
                  height: 10,
                  bgcolor: "success.main",
                  borderRadius: "50%",
                  border: 2,
                  borderColor: "background.paper",
                }}
              />
            </Box>
            {expanded && (
              <>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <Typography variant="label" noWrap sx={{ flex: 1 }}>
                      {name}
                    </Typography>
                    {showRoleBadge && (
                      <Chip
                        label={user.role}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontSize: "0.6rem", height: 18 }}
                      />
                    )}
                    <Chip
                      label={plan}
                      size="small"
                      color={PLAN_VARIANT[plan] ?? "default"}
                      variant="filled"
                      sx={{ fontSize: "0.6rem", height: 18 }}
                    />
                  </Stack>
                  <Typography variant="captionMuted" noWrap component="div" sx={{ mt: 0.25 }}>
                    {user.email}
                  </Typography>
                </Box>
                <ChevronRightIcon sx={{ color: "text.disabled", fontSize: 16, flexShrink: 0 }} />
              </>
            )}
          </ButtonBase>
        </Tooltip>
      }
    />
  );
}

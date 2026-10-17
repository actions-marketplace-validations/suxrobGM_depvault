"use client";

import { type ReactElement, useState } from "react";
import { Lock as LockIcon, LockOpen as LockOpenIcon } from "@mui/icons-material";
import { IconButton, ListItemButton, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import { useVault } from "@/hooks/use-vault";
import { VaultRecoveryDialog } from "./vault-recovery-dialog";
import { VaultUnlockDialog } from "./vault-unlock-dialog";

interface VaultLockButtonProps {
  open: boolean;
}

const LOCK_TOOLTIP = "Lock vault: forget the decryption keys on this device until you unlock again";
const UNLOCK_TOOLTIP = "Unlock vault: enter your vault password to decrypt files";

/** Sidebar action (not navigation) that explicitly locks or unlocks the vault. */
export function VaultLockButton(props: VaultLockButtonProps): ReactElement | null {
  const { open } = props;
  const { vaultStatus, lockVault } = useVault();
  const isVaultUnlocked = vaultStatus === "unlocked";
  const confirmDiscard = useConfirmDiscard();
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);

  if (vaultStatus !== "locked" && !isVaultUnlocked) {
    return null;
  }

  const handleClick = async () => {
    if (!isVaultUnlocked) {
      setUnlockDialogOpen(true);
      return;
    }
    if (await confirmDiscard()) {
      lockVault();
    }
  };

  const label = isVaultUnlocked ? "Lock vault" : "Unlock vault";
  const tooltip = isVaultUnlocked ? LOCK_TOOLTIP : UNLOCK_TOOLTIP;
  const icon = isVaultUnlocked ? <LockIcon /> : <LockOpenIcon />;
  const iconColor = isVaultUnlocked ? "text.secondary" : "warning.main";

  return (
    <>
      <Tooltip title={tooltip} placement="right">
        {open ? (
          <ListItemButton
            component="button"
            onClick={handleClick}
            aria-label={label}
            sx={{ mb: 0.5, px: 2, width: "100%", textAlign: "left" }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: iconColor }}>{icon}</ListItemIcon>
            <ListItemText
              primary={label}
              secondary={isVaultUnlocked ? "Vault unlocked" : "Vault locked"}
              slotProps={{ secondary: { variant: "caption" } }}
            />
          </ListItemButton>
        ) : (
          <IconButton
            size="small"
            onClick={handleClick}
            aria-label={label}
            sx={{ color: iconColor }}
          >
            {icon}
          </IconButton>
        )}
      </Tooltip>
      <VaultUnlockDialog
        open={unlockDialogOpen && !isVaultUnlocked}
        onClose={() => setUnlockDialogOpen(false)}
        onForgotPassword={() => {
          setUnlockDialogOpen(false);
          setRecoveryDialogOpen(true);
        }}
      />
      <VaultRecoveryDialog open={recoveryDialogOpen} onClose={() => setRecoveryDialogOpen(false)} />
    </>
  );
}

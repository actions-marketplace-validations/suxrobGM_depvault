"use client";

import { type PropsWithChildren, type ReactElement, useState } from "react";
import { Lock as LockIcon } from "@mui/icons-material";
import { Box, Button, CardActions, CardHeader, CircularProgress } from "@mui/material";
import { Surface } from "@/components/ui/cards";
import { useVault } from "@/hooks/use-vault";
import { VaultSetupDialog } from "./vault-setup-dialog";
import { VaultUnlockPanel } from "./vault-unlock-panel";

interface VaultGateProps extends PropsWithChildren {
  /** Explains what the unlock is needed for. */
  description?: string;
}

/**
 * Renders children only while the vault is unlocked; otherwise shows an inline setup or unlock
 * card in the page content, leaving navigation usable.
 */
export function VaultGate(props: VaultGateProps): ReactElement {
  const { children, description } = props;
  const { vaultStatus } = useVault();
  const [setupOpen, setSetupOpen] = useState(false);

  if (vaultStatus === "loading") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (vaultStatus === "no-vault") {
    return (
      <>
        <Surface accent="info" sx={{ maxWidth: 520 }}>
          <CardHeader
            avatar={<LockIcon color="info" />}
            title="Set up your vault"
            subheader="Files are end-to-end encrypted with keys protected by a vault password that only you know."
          />
          <CardActions sx={{ px: 2, pb: 2 }}>
            <Button variant="contained" onClick={() => setSetupOpen(true)}>
              Set up vault
            </Button>
          </CardActions>
        </Surface>
        <VaultSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      </>
    );
  }

  if (vaultStatus === "locked") {
    return <VaultUnlockPanel description={description} />;
  }

  return <>{children}</>;
}

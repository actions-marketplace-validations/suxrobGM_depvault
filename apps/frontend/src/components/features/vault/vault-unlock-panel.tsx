"use client";

import { type ReactElement, useState } from "react";
import { Lock as LockIcon } from "@mui/icons-material";
import { CardContent, CardHeader } from "@mui/material";
import { Surface } from "@/components/ui/cards";
import { VaultRecoveryDialog } from "./vault-recovery-dialog";
import { VaultUnlockForm } from "./vault-unlock-form";

interface VaultUnlockPanelProps {
  /** Explains what the unlock is needed for. */
  description?: string;
  onUnlocked?: () => void;
}

/** Inline (non-modal) unlock card, so a locked vault never blocks navigation. */
export function VaultUnlockPanel(props: VaultUnlockPanelProps): ReactElement {
  const { description = "Enter your vault password to decrypt files.", onUnlocked } = props;
  const [showRecovery, setShowRecovery] = useState(false);

  return (
    <>
      <Surface accent="warning" sx={{ maxWidth: 520 }}>
        <CardHeader
          avatar={<LockIcon color="warning" />}
          title="Vault locked"
          subheader={description}
        />
        <CardContent sx={{ pt: 0 }}>
          <VaultUnlockForm onUnlocked={onUnlocked} onForgotPassword={() => setShowRecovery(true)} />
        </CardContent>
      </Surface>
      <VaultRecoveryDialog open={showRecovery} onClose={() => setShowRecovery(false)} />
    </>
  );
}

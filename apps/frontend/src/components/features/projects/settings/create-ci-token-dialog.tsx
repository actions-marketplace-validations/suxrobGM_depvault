"use client";

import { type ReactElement, useState } from "react";
import { Key as KeyIcon } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { VaultGate } from "@/components/features/vault";
import { OneTimeSecret } from "@/components/ui/data-display";
import { useVault } from "@/hooks/use-vault";
import { CiTokenForm, type CreatedCiToken } from "./ci-token-form";
import { CiTokenUsageSnippets } from "./ci-token-usage-snippets";

interface CreateCiTokenDialogProps {
  projectId: string;
  /** IP allowlists follow the owner's plan, which is only known when the viewer is the owner. */
  isOwner: boolean;
  onClose: () => void;
}

/** Creates a CI token (which carries a copy of the project key) and shows it once. */
export function CreateCiTokenDialog(props: CreateCiTokenDialogProps): ReactElement {
  const { projectId, isOwner, onClose } = props;
  const { vaultStatus } = useVault();
  const [created, setCreated] = useState<CreatedCiToken | null>(null);

  const closeOnly = (label: string) => (
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button onClick={onClose}>{label}</Button>
    </DialogActions>
  );

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <KeyIcon fontSize="small" />
        Generate CI/CD Token
      </DialogTitle>
      {vaultStatus !== "unlocked" ? (
        <>
          <DialogContent>
            <VaultGate description="The token carries a copy of this project's key, so your vault must be unlocked to create it." />
          </DialogContent>
          {closeOnly("Close")}
        </>
      ) : created ? (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <OneTimeSecret
                value={created.token}
                warning="Copy this token now. It will not be shown again."
                copyLabel="Copy Token"
                copiedMessage="Token copied to clipboard"
              />
              <Typography variant="captionMuted">
                Expires: {new Date(created.expiresAt).toLocaleString()}. Save it as the
                DEPVAULT_TOKEN secret of your pipeline:
              </Typography>
              <CiTokenUsageSnippets />
            </Stack>
          </DialogContent>
          {closeOnly("Done")}
        </>
      ) : (
        <CiTokenForm
          projectId={projectId}
          isOwner={isOwner}
          onCreated={setCreated}
          onCancel={onClose}
        />
      )}
    </Dialog>
  );
}

"use client";

import type { ReactElement } from "react";
import { Box } from "@mui/material";
import { VaultGate } from "@/components/features/vault";
import { FilesBrowser } from "./files-browser";

interface FilesTabProps {
  projectId: string;
}

/** Files tab content: the browser once the vault is unlocked, an inline unlock card otherwise. */
export function FilesTab(props: FilesTabProps): ReactElement {
  const { projectId } = props;

  return (
    <Box className="vault-fade-up vault-delay-2">
      <VaultGate description="Unlock your vault to view and edit this project's files.">
        <FilesBrowser projectId={projectId} />
      </VaultGate>
    </Box>
  );
}

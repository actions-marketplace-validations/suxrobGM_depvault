"use client";

import { type ReactElement, useState } from "react";
import { Alert, Button } from "@mui/material";
import { client } from "@/api/client";
import { useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { PendingKeyGrantListDto } from "@/api/types/project";
import { useToast } from "@/hooks/use-toast";
import { useVault } from "@/hooks/use-vault";

interface PendingAccessBannerProps {
  projectId: string;
}

/**
 * Members can't decrypt files until someone who holds the project key wraps it for them (ECDH).
 * Lists those members and grants access on an explicit click.
 */
export function PendingAccessBanner(props: PendingAccessBannerProps): ReactElement | null {
  const { projectId } = props;
  const { grantProjectKeyToMember } = useVault();
  const toast = useToast();
  const [granting, setGranting] = useState(false);

  const { data, refetch } = useApiQuery<PendingKeyGrantListDto>(
    queryKeys.projects.pendingKeyGrants(projectId),
    () => client.api.projects({ id: projectId }).keygrants.pending.get(),
  );

  const pending = data ?? [];
  const ready = pending.filter((m) => m.hasVault && m.publicKey);
  const withoutVault = pending.length - ready.length;
  if (pending.length === 0) return null;

  const handleGrant = async () => {
    setGranting(true);
    const outcomes = await Promise.all(
      ready.map(async (member) => {
        try {
          await grantProjectKeyToMember(projectId, member.userId, member.publicKey!);
          return true;
        } catch {
          toast.error(`Could not grant access to ${member.email}`);
          return false;
        }
      }),
    );
    const granted = outcomes.filter(Boolean).length;
    setGranting(false);
    if (granted > 0)
      toast.success(`Granted file access to ${granted} member${granted === 1 ? "" : "s"}`);
    void refetch();
  };

  const names = ready.map((m) => [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email);

  return (
    <Alert
      severity="info"
      action={
        ready.length > 0 && (
          <Button color="inherit" size="small" disabled={granting} onClick={handleGrant}>
            {granting ? "Granting..." : "Grant access"}
          </Button>
        )
      }
    >
      {ready.length > 0 && `${names.join(", ")} can't decrypt files yet. `}
      {withoutVault > 0 &&
        `${withoutVault} member${withoutVault === 1 ? " hasn't" : "s haven't"} set up a vault yet; they get access once they do and you grant it here.`}
    </Alert>
  );
}

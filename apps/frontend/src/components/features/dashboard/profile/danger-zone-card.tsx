"use client";

import type { ReactElement } from "react";
import { Button, CardActions, CardContent, CardHeader, Typography } from "@mui/material";
import { useDeleteAccount } from "@/api/queries/account";
import { useAuth } from "@/auth/use-auth";
import { Surface } from "@/components/ui/cards";
import { useConfirm } from "@/hooks/use-confirm";

/** Account deletion behind a typed confirmation. */
export function DangerZoneCard(): ReactElement {
  const { logout } = useAuth();
  const confirm = useConfirm();
  const mutation = useDeleteAccount({ onSuccess: () => logout() });

  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: "Delete Account",
      description:
        "Are you sure you want to delete your account? This will permanently remove all your projects, analyses, uploads, secret files, and other data.",
      confirmLabel: "Delete my account",
      destructive: true,
      confirmationText: "DELETE",
      confirmationHint: (
        <>
          Type <strong>DELETE</strong> to permanently delete your account.
        </>
      ),
    });
    if (confirmed) {
      mutation.mutate();
    }
  };

  return (
    <Surface className="vault-fade-up vault-delay-5" accent="error">
      <CardHeader title="Danger Zone" slotProps={{ title: { sx: { color: "error.main" } } }} />
      <CardContent sx={{ p: 3 }}>
        <Typography variant="body2Muted">
          Permanently delete your account and all associated data. This action cannot be undone.
        </Typography>
      </CardContent>
      <CardActions>
        <Button
          variant="outlined"
          color="error"
          onClick={handleDeleteAccount}
          disabled={mutation.isPending}
        >
          Delete Account
        </Button>
      </CardActions>
    </Surface>
  );
}

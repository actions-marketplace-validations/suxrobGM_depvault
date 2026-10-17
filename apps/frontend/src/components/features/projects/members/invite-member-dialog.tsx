"use client";

import type { ReactElement } from "react";
import { Dialog, DialogContent, DialogTitle, Stack } from "@mui/material";
import { useInviteMember } from "@/api/queries/members";
import { useAppForm } from "@/components/ui/form";
import { inviteMemberSchema } from "../schemas";

interface InviteMemberDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function InviteMemberDialog(props: InviteMemberDialogProps): ReactElement {
  const { open, onClose, projectId } = props;

  const mutation = useInviteMember(projectId, { onSuccess: () => handleClose() });

  const form = useAppForm({
    defaultValues: {
      email: "",
      role: "VIEWER" as "EDITOR" | "VIEWER",
    },
    validators: { onSubmit: inviteMemberSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value);
    },
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form.AppForm>
        <form.Form>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <form.AppField name="email">
                {(field) => <field.TextField label="Email Address" type="email" autoFocus />}
              </form.AppField>
              <form.AppField name="role">
                {(field) => (
                  <field.Select
                    label="Role"
                    items={[
                      { value: "VIEWER", label: "Viewer" },
                      { value: "EDITOR", label: "Editor" },
                    ]}
                  />
                )}
              </form.AppField>
            </Stack>
          </DialogContent>
          <form.DialogFormActions
            onCancel={handleClose}
            submitLabel="Invite"
            pendingLabel="Inviting..."
          />
        </form.Form>
      </form.AppForm>
    </Dialog>
  );
}

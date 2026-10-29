"use client";

import type { ReactElement } from "react";
import { Dialog, DialogContent, DialogTitle, Stack } from "@mui/material";
import { z } from "zod/v4";
import { useAppForm } from "@/components/ui/form";
import { FileDiffViewerLazy } from "./code-editor-lazy";

const saveFileSchema = z.object({
  message: z.string().max(200, "Message must be 200 characters or fewer"),
});

interface ReviewChangesDialogProps {
  onClose: () => void;
  oldText: string;
  newText: string;
  /** Saves the change; the dialog stays locked until it settles. */
  onConfirm: (message?: string) => Promise<void>;
}

/** Pre-commit "review changes" diff with an optional commit message. */
export function ReviewChangesDialog(props: ReviewChangesDialogProps): ReactElement {
  const { onClose, oldText, newText, onConfirm } = props;

  const form = useAppForm({
    defaultValues: { message: "" },
    validators: { onSubmit: saveFileSchema },
    onSubmit: async ({ value }) => {
      await onConfirm(value.message);
    },
  });

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <form.AppForm>
        <form.Form>
          <DialogTitle>Review changes</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FileDiffViewerLazy
                oldValue={oldText}
                newValue={newText}
                oldTitle="Current"
                newTitle="Your changes"
              />
              <form.AppField name="message">
                {(field) => (
                  <field.TextField
                    label="Commit message"
                    placeholder="Describe this change (optional)"
                  />
                )}
              </form.AppField>
            </Stack>
          </DialogContent>
          <form.DialogFormActions
            onCancel={onClose}
            submitLabel="Save new version"
            pendingLabel="Saving..."
          />
        </form.Form>
      </form.AppForm>
    </Dialog>
  );
}

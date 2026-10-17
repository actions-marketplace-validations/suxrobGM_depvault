"use client";

import type { ReactElement } from "react";
import { repoPathError } from "@depvault/shared/utils";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { z } from "zod/v4";
import { useAppForm } from "@/components/ui/form";
import { normalizePath } from "./file-format";

interface PathDialogProps {
  title: string;
  initialPath: string;
  submitLabel: string;
  /** Paths already taken by other files. */
  takenPaths: string[];
  onClose: () => void;
  /** Receives the canonical path; rejects keep the dialog open. */
  onSubmit: (path: string) => Promise<void>;
}

/** Asks for a repo-relative path (new file, rename/move), validated like the server does. */
export function PathDialog(props: PathDialogProps): ReactElement {
  const { title, initialPath, submitLabel, takenPaths, onClose, onSubmit } = props;

  const schema = z.object({
    path: z.string().superRefine((value, ctx) => {
      const path = normalizePath(value);
      const problem = repoPathError(path);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
      else if (takenPaths.includes(path)) {
        ctx.addIssue({ code: "custom", message: "A file with this path already exists" });
      }
    }),
  });

  const form = useAppForm({
    defaultValues: { path: initialPath },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await onSubmit(normalizePath(value.path));
    },
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2Muted">
              Relative to the repository root, using forward slashes.
            </Typography>
            <form.AppField name="path">
              {(field) => (
                <field.TextField
                  label="Path"
                  autoFocus
                  placeholder="apps/api/.env"
                  slotProps={{ htmlInput: { style: { fontFamily: "monospace" } } }}
                />
              )}
            </form.AppField>
          </Stack>
        </DialogContent>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                {submitLabel}
              </Button>
            </DialogActions>
          )}
        </form.Subscribe>
      </form>
    </Dialog>
  );
}

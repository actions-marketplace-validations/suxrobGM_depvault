"use client";

import { type ReactElement, useState } from "react";
import { encryptForShare } from "@depvault/crypto";
import { Share as ShareIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCreateShareLink } from "@/api/queries/project-access";
import { OneTimeSecret } from "@/components/ui/data-display";
import { useAppForm } from "@/components/ui/form";

const EXPIRY_OPTIONS = [
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: 86400 },
  { label: "7 days", value: 604800 },
];

/** The plaintext file the caller has already decrypted with the project DEK. */
export interface ShareableFile {
  fileName: string;
  mimeType: string;
  content: string | ArrayBuffer;
}

interface CreateFileShareDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  file: ShareableFile;
}

/** Re-encrypts a decrypted file under a one-time key and shows the link exactly once. */
export function CreateFileShareDialog(props: CreateFileShareDialogProps): ReactElement {
  const { open, onClose, projectId, file } = props;
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const mutation = useCreateShareLink(projectId);

  const form = useAppForm({
    defaultValues: {
      expiresIn: 86400,
      password: "",
      usePassword: false,
    },
    onSubmit: async ({ value }) => {
      const { fragment, ...encrypted } = await encryptForShare(file.content);

      const result = await mutation.mutateAsync({
        ...encrypted,
        fileName: file.fileName,
        mimeType: file.mimeType,
        expiresIn: value.expiresIn,
        password: value.usePassword && value.password ? value.password : undefined,
      });

      // The key rides in the fragment, which browsers never send to the server.
      setShareUrl(`${result.shareUrl}#${fragment}`);
    },
  });

  const handleClose = () => {
    setShareUrl(null);
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <ShareIcon fontSize="small" />
        Share File
      </DialogTitle>
      {shareUrl ? (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="success">
                Link created! Share it with the recipient. This link can only be accessed once.
              </Alert>
              <OneTimeSecret
                value={shareUrl}
                warning="The file will be permanently inaccessible via this link after first access."
                copyLabel="Copy Link"
                copiedMessage="Link copied to clipboard"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose}>Done</Button>
          </DialogActions>
        </>
      ) : (
        <form.AppForm>
          <form.Form>
            <DialogContent>
              <Stack spacing={2.5} sx={{ mt: 1 }}>
                <Box
                  sx={{
                    p: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    bgcolor: "action.hover",
                  }}
                >
                  <Typography variant="captionMuted">Sharing file</Typography>
                  <Typography variant="label">{file.fileName}</Typography>
                </Box>

                <form.AppField name="expiresIn">
                  {(field) => (
                    <field.Select
                      label="Link expires after"
                      items={EXPIRY_OPTIONS}
                      labelPlacement="above"
                    />
                  )}
                </form.AppField>

                <form.AppField name="usePassword">
                  {(field) => <field.Checkbox label="Password protect this link" />}
                </form.AppField>

                <form.Subscribe selector={(state) => state.values.usePassword}>
                  {(usePassword) =>
                    usePassword && (
                      <form.AppField name="password">
                        {(field) => (
                          <field.TextField label="Password" type="password" size="small" />
                        )}
                      </form.AppField>
                    )
                  }
                </form.Subscribe>

                <Alert severity="info" sx={{ fontSize: "0.8rem" }}>
                  Recipient accesses the file once. The link self-destructs after access.
                </Alert>
              </Stack>
            </DialogContent>
            <form.DialogFormActions
              onCancel={handleClose}
              submitLabel="Generate Link"
              pendingLabel="Generating..."
            />
          </form.Form>
        </form.AppForm>
      )}
    </Dialog>
  );
}

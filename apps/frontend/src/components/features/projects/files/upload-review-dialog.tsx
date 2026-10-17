"use client";

import { type ReactElement, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import type { FileChange, RepoFileDto } from "@/api/types/repo-file";
import { useAppForm } from "@/components/ui/form";
import { useConfirm } from "@/hooks/use-confirm";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import { useVault } from "@/hooks/use-vault";
import { formatBytes } from "@/utils/formatters";
import type { PickedFile } from "./collect-picked-files";
import { encryptFileContent, looksBinary } from "./file-crypto";
import { MAX_FILE_SIZE, normalizePath, pathError } from "./file-format";
import { useFileChanges } from "./use-file-changes";

/** Mirrors the backend's per-batch limit. */
const MAX_CHANGES = 200;

interface UploadReviewDialogProps {
  projectId: string;
  picked: PickedFile[];
  existingFiles: RepoFileDto[];
  onClose: () => void;
  onUploaded: (fileIds: string[]) => void;
}

/** Local view model: one picked file and the repo path it would be stored under. */
interface UploadRow {
  source: PickedFile;
  path: string;
  problem: string | null;
  existing: RepoFileDto | undefined;
}

interface UploadOptions {
  folder: string;
  stripTopFolder: boolean;
}

/** The single top-level folder every picked path shares, if any (e.g. a dropped repo root). */
function commonTopFolder(picked: PickedFile[]): string | null {
  const first = picked[0]?.path.split("/")[0];
  if (!first || !picked.every((p) => p.path.startsWith(`${first}/`))) return null;
  return first;
}

function buildRows(
  picked: PickedFile[],
  existing: RepoFileDto[],
  options: UploadOptions,
): UploadRow[] {
  const top = options.stripTopFolder ? commonTopFolder(picked) : null;
  const folder = normalizePath(options.folder);
  const rows = picked.map((source): UploadRow => {
    const relative = top ? source.path.slice(top.length + 1) : source.path;
    const path = normalizePath(folder ? `${folder}/${relative}` : relative);
    const problem =
      pathError(path) ?? (source.file.size > MAX_FILE_SIZE ? "Larger than 10 MB" : null);
    return { source, path, problem, existing: existing.find((f) => f.path === path) };
  });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
  return rows.map((row) =>
    !row.problem && (counts.get(row.path) ?? 0) > 1 ? { ...row, problem: "Duplicate path" } : row,
  );
}

/**
 * Review list for dropped or picked files: choose a target folder, untick files, see which ones
 * replace existing files, then upload everything in one atomic batch.
 */
export function UploadReviewDialog(props: UploadReviewDialogProps): ReactElement {
  const { projectId, picked, existingFiles, onClose, onUploaded } = props;
  const { getProjectDEK } = useVault();
  const confirm = useConfirm();
  const confirmDiscard = useConfirmDiscard();
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const changes = useFileChanges(projectId, {
    successMessage: "Files uploaded",
    onSuccess: onUploaded,
  });
  const topFolder = commonTopFolder(picked);

  const form = useAppForm({
    defaultValues: { folder: "", stripTopFolder: false, message: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      const selected = buildRows(picked, existingFiles, value).filter(
        (row) => !row.problem && !excluded.has(row.source.path),
      );
      const replacing = selected.filter((row) => row.existing);
      if (replacing.length > 0) {
        const names = replacing
          .slice(0, 5)
          .map((row) => row.path)
          .join(", ");
        const more = replacing.length > 5 ? ` and ${replacing.length - 5} more` : "";
        const ok =
          (await confirmDiscard()) &&
          (await confirm({
            title: `Replace ${replacing.length} existing file${replacing.length === 1 ? "" : "s"}?`,
            description: `${names}${more} will get a new version with the uploaded content. Older versions stay in history.`,
            confirmLabel: "Replace",
          }));
        if (!ok) return;
      }

      let sent = false;
      try {
        const dek = await getProjectDEK(projectId);
        const batch = await Promise.all(
          selected.map(async (row): Promise<FileChange> => {
            const bytes = new Uint8Array(await row.source.file.arrayBuffer());
            const content = await encryptFileContent(bytes, looksBinary(bytes), dek);
            return row.existing
              ? { fileId: row.existing.id, baseVersion: row.existing.version, content }
              : { path: row.path, content };
          }),
        );
        sent = true;
        await changes.mutateAsync({ changes: batch, message: value.message.trim() || undefined });
      } catch (err) {
        // Server errors are toasted by useFileChanges; local read/encrypt failures land here.
        if (!sent) setError(err instanceof Error ? err.message : "Upload failed");
      }
    },
  });

  const toggle = (sourcePath: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(sourcePath)) next.delete(sourcePath);
      else next.add(sourcePath);
      return next;
    });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <DialogTitle>Upload files</DialogTitle>
        <form.Subscribe selector={(state) => state}>
          {({ values, isSubmitting }) => {
            const rows = buildRows(picked, existingFiles, values);
            const selectedCount = rows.filter(
              (row) => !row.problem && !excluded.has(row.source.path),
            ).length;
            const tooMany = selectedCount > MAX_CHANGES;
            return (
              <>
                <DialogContent>
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    <form.AppField name="folder">
                      {(field) => (
                        <field.TextField
                          label="Target folder (optional)"
                          placeholder="e.g. apps/api"
                          size="small"
                        />
                      )}
                    </form.AppField>
                    {topFolder && (
                      <form.AppField name="stripTopFolder">
                        {(field) => (
                          <field.Checkbox label={`Drop the top-level "${topFolder}/" folder`} />
                        )}
                      </form.AppField>
                    )}

                    <List
                      dense
                      sx={{
                        maxHeight: 360,
                        overflow: "auto",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1,
                      }}
                    >
                      {rows.map((row) => (
                        <ListItem key={row.source.path} disablePadding sx={{ pr: 1 }}>
                          <ListItemIcon sx={{ minWidth: 40 }}>
                            <Checkbox
                              edge="end"
                              size="small"
                              checked={!row.problem && !excluded.has(row.source.path)}
                              disabled={row.problem !== null}
                              onChange={() => toggle(row.source.path)}
                              slotProps={{ input: { "aria-label": `Include ${row.path}` } }}
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={row.path || row.source.path}
                            secondary={formatBytes(row.source.file.size)}
                            slotProps={{
                              primary: { sx: { fontFamily: "monospace", fontSize: "0.8rem" } },
                            }}
                          />
                          {row.problem ? (
                            <Chip
                              size="small"
                              color="error"
                              variant="outlined"
                              label={row.problem}
                            />
                          ) : row.existing ? (
                            <Chip
                              size="small"
                              color="warning"
                              variant="outlined"
                              label="Replaces existing file"
                            />
                          ) : (
                            <Chip size="small" variant="outlined" label="New" />
                          )}
                        </ListItem>
                      ))}
                    </List>

                    <form.AppField name="message">
                      {(field) => (
                        <field.TextField
                          label="Message (optional)"
                          placeholder="Describe this upload"
                          size="small"
                        />
                      )}
                    </form.AppField>

                    {tooMany && (
                      <Alert severity="warning">
                        Up to {MAX_CHANGES} files can be uploaded at once. Untick some files.
                      </Alert>
                    )}
                    {error && <Alert severity="error">{error}</Alert>}
                    <Typography variant="captionMuted">
                      Files are encrypted in your browser before upload. Executables and files over
                      10 MB are skipped.
                    </Typography>
                  </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                  <Button onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={selectedCount === 0 || tooMany || isSubmitting}
                  >
                    {isSubmitting
                      ? "Uploading..."
                      : `Upload ${selectedCount} file${selectedCount === 1 ? "" : "s"}`}
                  </Button>
                </DialogActions>
              </>
            );
          }}
        </form.Subscribe>
      </form>
    </Dialog>
  );
}

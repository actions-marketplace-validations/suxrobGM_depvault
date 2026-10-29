"use client";

import { type ReactElement, useState } from "react";
import { MAX_CHANGES_PER_REQUEST, MAX_FILE_SIZE } from "@depvault/shared/constants";
import { repoPathError } from "@depvault/shared/utils";
import {
  Alert,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useSelector } from "@tanstack/react-form";
import type { FileChange, RepoFileDto } from "@/api/types/repo-file";
import { useAppForm } from "@/components/ui/form";
import { useConfirm } from "@/hooks/use-confirm";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import { useVault } from "@/hooks/use-vault";
import { describeKeyError } from "@/lib/crypto/errors";
import { formatBytes } from "@/utils/formatters";
import { toggleInSet } from "@/utils/toggle-set";
import type { PickedFile } from "./collect-picked-files";
import { encryptFileContent, looksBinary } from "./file-crypto";
import { normalizePath } from "./file-format";
import { useFileChanges } from "./use-file-changes";

const MAX_FILE_SIZE_LABEL = formatBytes(MAX_FILE_SIZE);

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
  existing: RepoFileDto | null;
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
  existingByPath: ReadonlyMap<string, RepoFileDto>,
  options: UploadOptions,
): UploadRow[] {
  const top = options.stripTopFolder ? commonTopFolder(picked) : null;
  const folder = normalizePath(options.folder);
  const rows = picked.map((source): UploadRow => {
    const relative = top ? source.path.slice(top.length + 1) : source.path;
    const path = normalizePath(folder ? `${folder}/${relative}` : relative);
    const problem =
      repoPathError(path) ??
      (source.file.size > MAX_FILE_SIZE ? `Larger than ${MAX_FILE_SIZE_LABEL}` : null);
    return { source, path, problem, existing: existingByPath.get(path) ?? null };
  });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
  return rows.map((row) =>
    !row.problem && (counts.get(row.path) ?? 0) > 1 ? { ...row, problem: "Duplicate path" } : row,
  );
}

interface RowStatusChipProps {
  row: UploadRow;
}

function RowStatusChip(props: RowStatusChipProps): ReactElement {
  const { row } = props;
  if (row.problem) {
    return <Chip size="small" color="error" variant="outlined" label={row.problem} />;
  }
  if (row.existing) {
    return <Chip size="small" color="warning" variant="outlined" label="Replaces existing file" />;
  }
  return <Chip size="small" variant="outlined" label="New" />;
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
  const existingByPath = new Map(existingFiles.map((file) => [file.path, file]));
  const isSelected = (row: UploadRow) => !row.problem && !excluded.has(row.source.path);

  const form = useAppForm({
    defaultValues: { folder: "", stripTopFolder: false, message: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      const selected = buildRows(picked, existingByPath, value).filter(isSelected);
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

      let batch: FileChange[];
      try {
        const dek = await getProjectDEK(projectId);
        batch = await Promise.all(
          selected.map(async (row): Promise<FileChange> => {
            const bytes = new Uint8Array(await row.source.file.arrayBuffer());
            const content = await encryptFileContent(bytes, looksBinary(bytes), dek);
            return row.existing
              ? { fileId: row.existing.id, baseVersion: row.existing.version, content }
              : { path: row.path, content };
          }),
        );
      } catch (err) {
        setError(describeKeyError(err, err instanceof Error ? err.message : "Upload failed"));
        return;
      }
      await changes.apply({ changes: batch, message: value.message.trim() || undefined });
    },
  });

  const folder = useSelector(form.store, (state) => state.values.folder);
  const stripTopFolder = useSelector(form.store, (state) => state.values.stripTopFolder);

  const rows = buildRows(picked, existingByPath, { folder, stripTopFolder });
  const selectedCount = rows.filter(isSelected).length;
  const tooMany = selectedCount > MAX_CHANGES_PER_REQUEST;

  const toggle = (sourcePath: string) => setExcluded((prev) => toggleInSet(prev, sourcePath));

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <form.AppForm>
        <form.Form>
          <DialogTitle>Upload files</DialogTitle>
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
                        checked={isSelected(row)}
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
                    <RowStatusChip row={row} />
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
                  Up to {MAX_CHANGES_PER_REQUEST} files can be uploaded at once. Untick some files.
                </Alert>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              <Typography variant="captionMuted">
                Files are encrypted in your browser before upload. Executables and files over{" "}
                {MAX_FILE_SIZE_LABEL} are skipped.
              </Typography>
            </Stack>
          </DialogContent>
          <form.DialogFormActions
            onCancel={onClose}
            submitLabel={`Upload ${selectedCount} file${selectedCount === 1 ? "" : "s"}`}
            pendingLabel="Uploading..."
            disabled={selectedCount === 0 || tooMany}
          />
        </form.Form>
      </form.AppForm>
    </Dialog>
  );
}

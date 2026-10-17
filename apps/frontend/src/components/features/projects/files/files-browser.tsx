"use client";

import { type DragEvent, type ReactElement, useRef, useState } from "react";
import { PROJECT_ROLE_LEVEL } from "@depvault/shared/constants";
import {
  Add as AddIcon,
  Clear as ClearIcon,
  NoteAdd as NewFileIcon,
  Search as SearchIcon,
  UploadFile as UploadIcon,
  FolderZip as ZipIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { client } from "@/api/client";
import { useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { ProjectDetailDto } from "@/api/types/project";
import type { RepoFileListResponseDto } from "@/api/types/repo-file";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import { useVault } from "@/hooks/use-vault";
import { downloadFile } from "@/utils/download-file";
import { buildFilesZip } from "./build-files-zip";
import { collectDroppedFiles, collectInputFiles, type PickedFile } from "./collect-picked-files";
import { describeKeyError } from "./describe-key-error";
import { FileEditor } from "./file-editor";
import { dirname } from "./file-format";
import { filterByPath } from "./file-tree";
import { FileTreeView } from "./file-tree-view";
import { NewFileEditor } from "./new-file-editor";
import { PathDialog } from "./path-dialog";
import { PendingAccessBanner } from "./pending-access-banner";
import { UploadReviewDialog } from "./upload-review-dialog";

interface FilesBrowserProps {
  projectId: string;
}

/** The Files tab: folder tree with search, editor/history pane, uploads and zip export. */
export function FilesBrowser(props: FilesBrowserProps): ReactElement {
  const { projectId } = props;
  const { getProjectDEK } = useVault();
  const confirmDiscard = useConfirmDiscard();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [newFilePath, setNewFilePath] = useState<string | null>(null);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [picked, setPicked] = useState<PickedFile[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [search, setSearch] = useState("");

  const { data: project } = useApiQuery<ProjectDetailDto>(
    queryKeys.projects.detail(projectId),
    () => client.api.projects({ id: projectId }).get(),
  );
  const { data, isLoading, error } = useApiQuery<RepoFileListResponseDto>(
    queryKeys.files.list(projectId),
    () => client.api.projects({ id: projectId }).files.get(),
  );

  const role = project?.currentUserRole as keyof typeof PROJECT_ROLE_LEVEL | undefined;
  const canEdit = role !== undefined && PROJECT_ROLE_LEVEL[role] >= PROJECT_ROLE_LEVEL.EDITOR;

  if (isLoading) return <Skeleton variant="rounded" height={480} />;
  if (error) return <Alert severity="error">Failed to load files.</Alert>;

  const files = data?.items ?? [];
  const visibleFiles = filterByPath(files, search);
  const activeFileId = newFilePath === null ? (selectedFileId ?? files[0]?.id ?? null) : null;
  const activeFile = files.find((f) => f.id === activeFileId);
  const activeFolder = activeFile ? dirname(activeFile.path) : "";

  const selectFile = async (fileId: string) => {
    if (fileId === activeFileId) return;
    if (!(await confirmDiscard())) return;
    setNewFilePath(null);
    setSelectedFileId(fileId);
  };

  const startNewFile = async () => {
    if (await confirmDiscard()) setNewFileDialogOpen(true);
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!canEdit) return;
    const dropped = await collectDroppedFiles(event.dataTransfer);
    if (dropped.length > 0) setPicked(dropped);
  };

  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      const dek = await getProjectDEK(projectId);
      const zip = await buildFilesZip(
        projectId,
        files.map((f) => f.id),
        dek,
      );
      downloadFile(zip, `${project?.name || "depvault"}-files.zip`, "application/zip");
    } catch (err) {
      toast.error(describeKeyError(err, "Failed to download files"));
    } finally {
      setZipping(false);
    }
  };

  const dropProps = canEdit
    ? {
        onDragOver: (event: DragEvent) => {
          event.preventDefault();
          if (!dragging) setDragging(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: handleDrop,
      }
    : {};

  return (
    <Stack spacing={2} {...dropProps} sx={{ position: "relative" }}>
      {canEdit && <PendingAccessBanner projectId={projectId} />}

      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <TextField
          size="small"
          placeholder="Search by path"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setSearch("")}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        {canEdit && (
          <>
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => inputRef.current?.click()}
            >
              Add files
            </Button>
            <Button variant="outlined" startIcon={<NewFileIcon />} onClick={startNewFile}>
              New file
            </Button>
          </>
        )}
        <Tooltip title="Download every file, decrypted in your browser, as a zip">
          <span>
            <Button
              variant="outlined"
              startIcon={<ZipIcon />}
              disabled={files.length === 0 || zipping}
              onClick={handleDownloadAll}
            >
              {zipping ? "Preparing..." : "Download all"}
            </Button>
          </span>
        </Tooltip>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) setPicked(collectInputFiles(e.target.files));
            e.target.value = "";
          }}
        />
      </Stack>

      {files.length === 0 && newFilePath === null ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center", borderStyle: "dashed" }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            No files yet
          </Typography>
          <Typography variant="body2Muted">
            {canEdit
              ? "Drag files or whole folders here, use Add files, or run `depvault push` from your repository."
              : "Files pushed with the DepVault CLI or added by editors will appear here."}
          </Typography>
          {canEdit && (
            <Button
              sx={{ mt: 2 }}
              startIcon={<AddIcon />}
              onClick={() => inputRef.current?.click()}
            >
              Add files
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper
              variant="outlined"
              sx={{ overflow: "auto", maxHeight: "75vh", position: "sticky", top: 16 }}
            >
              <FileTreeView
                files={visibleFiles}
                selectedFileId={activeFileId}
                onSelectFile={selectFile}
                expandAll={search.trim().length > 0}
              />
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            {newFilePath !== null ? (
              <NewFileEditor
                key={newFilePath}
                projectId={projectId}
                path={newFilePath}
                onCreated={(fileId) => {
                  setNewFilePath(null);
                  setSelectedFileId(fileId);
                }}
                onCancel={() => setNewFilePath(null)}
              />
            ) : activeFileId ? (
              <FileEditor
                key={activeFileId}
                projectId={projectId}
                fileId={activeFileId}
                allPaths={files.map((f) => f.path)}
                canEdit={canEdit}
                onDeleted={() => setSelectedFileId(null)}
              />
            ) : null}
          </Grid>
        </Grid>
      )}

      {dragging && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: 2,
            borderStyle: "dashed",
            borderColor: "primary.main",
            borderRadius: 2,
            bgcolor: "background.paper",
            opacity: 0.92,
            pointerEvents: "none",
          }}
        >
          <Typography variant="h6">Drop files or folders to add them</Typography>
        </Box>
      )}

      {newFileDialogOpen && (
        <PathDialog
          open
          title="New file"
          initialPath={activeFolder ? `${activeFolder}/` : ""}
          submitLabel="Create"
          takenPaths={files.map((f) => f.path)}
          onClose={() => setNewFileDialogOpen(false)}
          onSubmit={async (path) => {
            setNewFileDialogOpen(false);
            setNewFilePath(path);
          }}
        />
      )}

      {picked && (
        <UploadReviewDialog
          projectId={projectId}
          picked={picked}
          existingFiles={files}
          onClose={() => setPicked(null)}
          onUploaded={(fileIds) => {
            setPicked(null);
            if (fileIds[0] && newFilePath === null && !activeFileId) setSelectedFileId(fileIds[0]);
          }}
        />
      )}
    </Stack>
  );
}

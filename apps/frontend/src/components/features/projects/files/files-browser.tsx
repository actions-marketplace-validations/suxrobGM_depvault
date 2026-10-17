"use client";

import { type ReactElement, useRef, useState } from "react";
import { UploadFile as UploadIcon } from "@mui/icons-material";
import { Alert, Grid, Paper, Skeleton, Stack } from "@mui/material";
import { useProjectFiles } from "@/api/queries/files";
import { useProject, useProjectRole } from "@/api/queries/projects";
import { EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import { useVault } from "@/hooks/use-vault";
import { downloadFile } from "@/utils/download-file";
import { buildFilesZip } from "./build-files-zip";
import type { PickedFile } from "./collect-picked-files";
import { describeKeyError } from "./describe-key-error";
import { FileEditor } from "./file-editor";
import { dirname } from "./file-format";
import { filterByPath } from "./file-tree";
import { FileTreeView } from "./file-tree-view";
import { FilesToolbar } from "./files-toolbar";
import { NewFileEditor } from "./new-file-editor";
import { PathDialog } from "./path-dialog";
import { PendingAccessBanner } from "./pending-access-banner";
import { UploadReviewDialog } from "./upload-review-dialog";
import { useFileDrop } from "./use-file-drop";

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
  const [search, setSearch] = useState("");

  const { data: project } = useProject(projectId);
  const { canEdit } = useProjectRole(projectId);
  const { data, isLoading, error } = useProjectFiles(projectId);
  const { dropProps, overlay } = useFileDrop(canEdit, setPicked);

  if (isLoading) return <Skeleton variant="rounded" height={480} />;
  if (error) return <Alert severity="error">Failed to load files.</Alert>;

  const files = data?.items ?? [];
  const paths = files.map((f) => f.path);
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

  const handleDownloadAll = async () => {
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
    }
  };

  return (
    <Stack spacing={2} {...dropProps} sx={{ position: "relative" }}>
      {canEdit && <PendingAccessBanner projectId={projectId} />}

      <FilesToolbar
        search={search}
        onSearchChange={setSearch}
        canEdit={canEdit}
        inputRef={inputRef}
        onPicked={setPicked}
        onNewFile={startNewFile}
        canDownload={files.length > 0}
        onDownloadAll={handleDownloadAll}
      />

      {files.length === 0 && newFilePath === null ? (
        <EmptyState
          icon={<UploadIcon />}
          title="No files yet"
          description={
            canEdit
              ? "Drag files or whole folders here, use Add files, or run `depvault push` from your repository."
              : "Files pushed with the DepVault CLI or added by editors will appear here."
          }
          actionLabel={canEdit ? "Add files" : undefined}
          onAction={() => inputRef.current?.click()}
        />
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
                allPaths={paths}
                canEdit={canEdit}
                onDeleted={() => setSelectedFileId(null)}
              />
            ) : null}
          </Grid>
        </Grid>
      )}

      {overlay}

      {newFileDialogOpen && (
        <PathDialog
          title="New file"
          initialPath={activeFolder ? `${activeFolder}/` : ""}
          submitLabel="Create"
          takenPaths={paths}
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

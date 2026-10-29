"use client";

import { type ReactElement, useState } from "react";
import { Download as DownloadIcon } from "@mui/icons-material";
import { Alert, Button, Skeleton, Stack } from "@mui/material";
import { useFileContent } from "@/api/queries/files";
import { CreateFileShareDialog, type ShareableFile } from "@/components/features/share-link";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { useVault } from "@/hooks/use-vault";
import { describeKeyError } from "@/lib/crypto/errors";
import { downloadFile } from "@/utils/download-file";
import { formatBytes } from "@/utils/formatters";
import { decryptFileBytes } from "./file-crypto";
import { FileEditorToolbar } from "./file-editor-toolbar";
import { basename, guessMimeType } from "./file-format";
import { FileHistory } from "./file-history";
import { PathDialog } from "./path-dialog";
import { type EditorTab, TextFileEditor } from "./text-file-editor";
import { useDecryptedText } from "./use-decrypted-text";
import { useFileChanges } from "./use-file-changes";

interface FileEditorProps {
  projectId: string;
  fileId: string;
  /** Paths of every file, to reject a move onto an existing one. */
  allPaths: string[];
  canEdit: boolean;
  onDeleted: () => void;
}

/** Loads, decrypts and edits one existing file. Binary files are download-only. */
export function FileEditor(props: FileEditorProps): ReactElement {
  const { projectId, fileId, allPaths, canEdit, onDeleted } = props;
  const { getProjectDEK } = useVault();
  const confirm = useConfirm();
  const toast = useToast();

  const [tab, setTab] = useState<EditorTab | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareFile, setShareFile] = useState<ShareableFile | null>(null);

  const { data: content, isLoading } = useFileContent(projectId, fileId);
  const { decoded, error: decryptError } = useDecryptedText(projectId, content ?? null);

  const changes = useFileChanges(projectId);

  if (isLoading) return <Skeleton variant="rounded" height={360} />;
  if (!content) return <Alert severity="error">This file no longer exists.</Alert>;

  const fileName = basename(content.path);
  const mimeType = guessMimeType(content.path, content.isBinary);

  /** Decrypts the saved (not drafted) bytes for download or sharing. */
  const withPlaintext = async (use: (bytes: ArrayBuffer) => void) => {
    setBusy(true);
    try {
      const dek = await getProjectDEK(projectId);
      use(await decryptFileBytes(content, dek));
    } catch (err) {
      toast.error(describeKeyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => withPlaintext((bytes) => downloadFile(bytes, fileName, mimeType));

  const handleShare = () =>
    withPlaintext((bytes) => setShareFile({ fileName, mimeType, content: bytes }));

  const handleMove = async (path: string) => {
    if (path === content.path) {
      setMoveOpen(false);
      return;
    }
    if (await changes.apply({ changes: [{ fileId, baseVersion: content.version, path }] })) {
      setMoveOpen(false);
      toast.success(`Moved to ${path}`);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete file",
      description: `Delete "${content.path}" and its whole version history? CLI clients remove it on their next pull.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const deleted = await changes.apply({
      changes: [{ fileId, baseVersion: content.version, delete: true }],
    });
    if (deleted) {
      toast.success("File deleted");
      onDeleted();
    }
  };

  const history = <FileHistory projectId={projectId} fileId={fileId} canEdit={canEdit} />;

  const renderBody = () => {
    if (content.isBinary) {
      return (
        <>
          <Alert
            severity="info"
            action={
              <Button
                color="inherit"
                size="small"
                startIcon={<DownloadIcon fontSize="small" />}
                disabled={busy}
                onClick={handleDownload}
              >
                Download
              </Button>
            }
          >
            Binary file ({formatBytes(content.fileSize)}). It can be downloaded but not edited here.
          </Alert>
          {history}
        </>
      );
    }
    if (decryptError) return <Alert severity="error">{decryptError}</Alert>;
    if (!decoded) return <Skeleton variant="rounded" height={320} />;
    return (
      <TextFileEditor
        projectId={projectId}
        path={content.path}
        original={decoded}
        file={{ id: fileId, version: content.version }}
        canEdit={canEdit}
        tab={tab}
        onTabChange={setTab}
        historyPanel={history}
        onReload={() => changes.refresh([fileId])}
      />
    );
  };

  return (
    <Stack spacing={2}>
      <FileEditorToolbar
        content={content}
        canEdit={canEdit}
        busy={busy}
        onDownload={handleDownload}
        onShare={handleShare}
        onMove={() => setMoveOpen(true)}
        onDelete={handleDelete}
      />

      {renderBody()}

      {moveOpen && (
        <PathDialog
          title="Rename or move file"
          initialPath={content.path}
          submitLabel="Move"
          takenPaths={allPaths.filter((p) => p !== content.path)}
          onClose={() => setMoveOpen(false)}
          onSubmit={handleMove}
        />
      )}

      {shareFile && (
        <CreateFileShareDialog
          open
          onClose={() => setShareFile(null)}
          projectId={projectId}
          file={shareFile}
        />
      )}
    </Stack>
  );
}

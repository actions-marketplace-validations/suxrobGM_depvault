"use client";

import { type ReactElement, type ReactNode, useState } from "react";
import { Save as SaveIcon } from "@mui/icons-material";
import { Alert, Button, Stack, Tab, Tabs } from "@mui/material";
import { RevealOverlay } from "@/components/ui/feedback";
import { useConfirm } from "@/hooks/use-confirm";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import { useVault } from "@/hooks/use-vault";
import { CodeEditorLazy } from "./code-editor-lazy";
import { containsDetectedSecret } from "./detect-secret";
import { EnvFormEditor } from "./env-form-editor";
import { parseEnvDocument } from "./env-lines";
import { type DecodedText, encodeText, encryptFileContent } from "./file-crypto";
import { resolveLanguage } from "./file-format";
import { ReviewChangesDialog } from "./review-changes-dialog";
import { CONFLICT_MESSAGE, useFileChanges } from "./use-file-changes";

export type EditorTab = "form" | "raw" | "history";

/** An existing file and the version its content was read at. */
interface OpenedFile {
  id: string;
  version: number;
}

interface TextFileEditorProps {
  projectId: string;
  path: string;
  original: DecodedText;
  /** The existing file and the version `original` was read at; null while creating a file. */
  file: OpenedFile | null;
  canEdit: boolean;
  /** Null until the user picks a tab, so the default can follow the content. */
  tab: EditorTab | null;
  onTabChange: (tab: EditorTab) => void;
  historyPanel?: ReactNode;
  onCreated?: (fileId: string) => void;
  /** Refetch the file after a conflict. */
  onReload?: () => void;
}

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Form/Raw editor for a text file with review-before-save, optimistic concurrency (409 → Reload)
 * and an unsaved-changes guard. Saving re-encrypts the whole file client-side.
 */
export function TextFileEditor(props: TextFileEditorProps): ReactElement {
  const { projectId, path, original, file, canEdit, tab, onTabChange, historyPanel } = props;
  const { onCreated, onReload } = props;
  const { getProjectDEK, contentRevealed, revealContent } = useVault();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [conflict, setConflict] = useState(false);

  const changes = useFileChanges(projectId, {
    successMessage: file ? "File saved" : "File created",
    onSuccess: (fileIds) => {
      setReviewOpen(false);
      setDraft(null);
      const createdId = fileIds[0];
      if (!file && createdId) onCreated?.(createdId);
    },
    onConflict: () => {
      setReviewOpen(false);
      setConflict(true);
    },
  });

  const language = resolveLanguage(path);
  const currentText = draft ?? original.text;
  const isDirty = draft !== null && draft !== original.text;
  const canSave = isDirty || file === null;
  useUnsavedChangesGuard(isDirty);

  const envDoc = language === "env" ? parseEnvDocument(currentText) : null;
  const defaultTab: EditorTab = envDoc ? "form" : "raw";
  let activeTab = tab ?? defaultTab;
  if (activeTab === "form" && !envDoc) activeTab = "raw";
  if (activeTab === "history" && !historyPanel) activeTab = defaultTab;

  const eol = original.text.includes("\r\n") ? "\r\n" : "\n";
  const blurred = !contentRevealed && containsDetectedSecret(original.text, language);
  const jsonBroken =
    language === "json" && isDirty && parsesAsJson(original.text) && !parsesAsJson(currentText);

  const handleSave = async (message?: string) => {
    const dek = await getProjectDEK(projectId);
    const content = await encryptFileContent(encodeText(currentText, original.hasBom), false, dek);
    const change = file
      ? { fileId: file.id, baseVersion: file.version, content }
      : { path, content };
    try {
      await changes.mutateAsync({ changes: [change], message: message?.trim() || undefined });
    } catch {
      // Already surfaced by the mutation's onError (toast or conflict banner).
    }
  };

  const handleReload = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Reload file?",
        description: "Reloading discards your unsaved changes and loads the latest version.",
        confirmLabel: "Discard and reload",
        destructive: true,
      });
      if (!ok) return;
    }
    setDraft(null);
    setConflict(false);
    onReload?.();
  };

  return (
    <Stack spacing={2}>
      {conflict && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={handleReload}>
              Reload
            </Button>
          }
        >
          {CONFLICT_MESSAGE}
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(_, value: EditorTab) => onTabChange(value)}>
        {language === "env" && <Tab value="form" label="Form" disabled={!envDoc} />}
        <Tab value="raw" label="Raw" />
        {historyPanel && <Tab value="history" label="History" />}
      </Tabs>

      {activeTab === "history" ? (
        historyPanel
      ) : (
        <RevealOverlay
          blurred={blurred}
          onReveal={revealContent}
          label="Contains values that look like secrets. Revealing applies until you lock the vault."
        >
          {activeTab === "form" && envDoc ? (
            <EnvFormEditor doc={envDoc} readOnly={!canEdit} onChange={setDraft} />
          ) : (
            <CodeEditorLazy
              value={currentText}
              language={language}
              readOnly={!canEdit}
              onChange={canEdit ? setDraft : undefined}
              lineSeparator={eol}
            />
          )}
        </RevealOverlay>
      )}

      {jsonBroken && activeTab !== "history" && (
        <Alert severity="warning">This is no longer valid JSON. You can still save it.</Alert>
      )}

      {canEdit && activeTab !== "history" && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          {isDirty && (
            <Button onClick={() => setDraft(null)} disabled={changes.isPending}>
              Discard
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<SaveIcon fontSize="small" />}
            disabled={!canSave || changes.isPending}
            onClick={() => setReviewOpen(true)}
          >
            {file ? "Review & Save" : "Review & Create"}
          </Button>
        </Stack>
      )}

      {reviewOpen && (
        <ReviewChangesDialog
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          oldText={file ? original.text : ""}
          newText={currentText}
          saving={changes.isPending}
          onConfirm={handleSave}
        />
      )}
    </Stack>
  );
}

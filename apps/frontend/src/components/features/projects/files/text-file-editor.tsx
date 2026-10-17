"use client";

import { type ReactElement, type ReactNode, useState } from "react";
import { Save as SaveIcon } from "@mui/icons-material";
import { Alert, Button, Stack, Tab, Tabs } from "@mui/material";
import type { FileContentBody } from "@/api/types/repo-file";
import { RevealOverlay } from "@/components/ui/feedback";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import { useVault } from "@/hooks/use-vault";
import { CodeEditorLazy } from "./code-editor-lazy";
import { describeKeyError } from "./describe-key-error";
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
  /**
   * Controlled tab, so it survives a remount (e.g. after a reload). Null until the user picks a
   * tab, so the default can follow the content. Omit both to keep the tab internally.
   */
  tab?: EditorTab | null;
  onTabChange?: (tab: EditorTab) => void;
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
  const { projectId, path, original, file, canEdit, historyPanel, onCreated, onReload } = props;
  const { tab: controlledTab = null, onTabChange: onControlledTabChange } = props;
  const { getProjectDEK, contentRevealed, revealContent } = useVault();
  const confirm = useConfirm();
  const toast = useToast();

  const [ownTab, setOwnTab] = useState<EditorTab | null>(null);
  const tab = onControlledTabChange ? controlledTab : ownTab;
  const onTabChange = onControlledTabChange ?? setOwnTab;
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
    let content: FileContentBody;
    try {
      const dek = await getProjectDEK(projectId);
      content = await encryptFileContent(encodeText(currentText, original.hasBom), false, dek);
    } catch (err) {
      toast.error(describeKeyError(err, "Failed to encrypt this file."));
      return;
    }
    const change = file
      ? { fileId: file.id, baseVersion: file.version, content }
      : { path, content };
    await changes.apply({ changes: [change], message: message?.trim() || undefined });
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
          onClose={() => setReviewOpen(false)}
          oldText={file ? original.text : ""}
          newText={currentText}
          onConfirm={handleSave}
        />
      )}
    </Stack>
  );
}

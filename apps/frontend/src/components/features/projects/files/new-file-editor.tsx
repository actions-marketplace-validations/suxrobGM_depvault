"use client";

import { type ReactElement, useState } from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import type { DecodedText } from "./file-crypto";
import { type EditorTab, TextFileEditor } from "./text-file-editor";

interface NewFileEditorProps {
  projectId: string;
  path: string;
  onCreated: (fileId: string) => void;
  onCancel: () => void;
}

const EMPTY_FILE: DecodedText = { text: "", hasBom: false };

/** Empty editor for a file that only exists once the user saves it. */
export function NewFileEditor(props: NewFileEditorProps): ReactElement {
  const { projectId, path, onCreated, onCancel } = props;
  const confirmDiscard = useConfirmDiscard();
  const [tab, setTab] = useState<EditorTab | null>(null);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="subtitle1" noWrap sx={{ fontFamily: "monospace", fontWeight: 600 }}>
          {path}
        </Typography>
        <Chip size="small" label="New file" color="primary" variant="outlined" />
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={async () => (await confirmDiscard()) && onCancel()}>
          Cancel
        </Button>
      </Stack>
      <TextFileEditor
        projectId={projectId}
        path={path}
        original={EMPTY_FILE}
        file={null}
        canEdit
        tab={tab}
        onTabChange={setTab}
        onCreated={onCreated}
      />
    </Stack>
  );
}

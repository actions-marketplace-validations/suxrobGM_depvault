"use client";

import type { ReactElement } from "react";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { appendEnvEntry, type EnvDocument, removeEnvEntry, updateEnvEntry } from "./env-lines";

interface EnvFormEditorProps {
  doc: EnvDocument;
  readOnly: boolean;
  onChange: (text: string) => void;
}

/** Characters that would turn a key into a line the Form view can no longer parse. */
const INVALID_KEY_CHARS = /[\s=#]/g;

/**
 * Key/value view of a dotenv file. Comments and blank lines stay in the file untouched; each
 * edit rewrites only its own line (see `env-lines.ts`).
 */
export function EnvFormEditor(props: EnvFormEditorProps): ReactElement {
  const { doc, readOnly, onChange } = props;

  if (doc.entries.length === 0 && readOnly) {
    return <Typography variant="body2Muted">No key/value pairs in this file.</Typography>;
  }

  return (
    <Stack spacing={1.5}>
      {doc.entries.map((entry) => (
        <Stack key={entry.line} direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            size="small"
            label="Key"
            value={entry.key}
            slotProps={{ htmlInput: { readOnly } }}
            onChange={(e) =>
              onChange(
                updateEnvEntry(
                  doc,
                  entry.line,
                  e.target.value.replace(INVALID_KEY_CHARS, ""),
                  entry.value,
                ),
              )
            }
            sx={{ flex: "0 0 38%", "& input": { fontFamily: "monospace" } }}
          />
          <Box sx={{ color: "text.disabled", fontFamily: "monospace" }}>=</Box>
          <TextField
            size="small"
            label="Value"
            value={entry.value}
            slotProps={{ htmlInput: { readOnly } }}
            onChange={(e) => onChange(updateEnvEntry(doc, entry.line, entry.key, e.target.value))}
            sx={{ flex: 1, "& input": { fontFamily: "monospace" } }}
          />
          {!readOnly && (
            <IconButton
              size="small"
              aria-label={`Remove ${entry.key || "pair"}`}
              onClick={() => onChange(removeEnvEntry(doc, entry.line))}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}

      {!readOnly && (
        <Box>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => onChange(appendEnvEntry(doc))}
          >
            Add pair
          </Button>
        </Box>
      )}
    </Stack>
  );
}

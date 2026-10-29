"use client";

import { type ReactElement, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { z } from "zod/v4";
import { useCreatePattern, useUpdatePattern } from "@/api/queries/secret-scanning";
import type { PatternDto } from "@/api/types/secret-scan";
import { useAppForm } from "@/components/ui/form";

interface CreatePatternDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editingPattern: PatternDto | null;
}

const patternSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  regex: z.string().min(1, "Regex is required").max(1024),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
});

const SEVERITY_ITEMS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

export function CreatePatternDialog(props: CreatePatternDialogProps): ReactElement {
  const { open, onClose, projectId, editingPattern } = props;
  const [testInput, setTestInput] = useState("");

  const isEdit = !!editingPattern;

  const createMutation = useCreatePattern(projectId, { onSuccess: onClose });
  const updateMutation = useUpdatePattern(projectId, { onSuccess: onClose });

  const form = useAppForm({
    defaultValues: {
      name: editingPattern?.name ?? "",
      regex: editingPattern?.regex ?? "",
      severity: editingPattern?.severity ?? "HIGH",
    },
    validators: { onSubmit: patternSchema },
    onSubmit: async ({ value }) => {
      if (editingPattern) {
        await updateMutation.mutateAsync({ ...value, patternId: editingPattern.id });
      } else {
        await createMutation.mutateAsync(value);
      }
    },
  });

  const currentRegex = form.getFieldValue("regex");
  let regexValid = false;
  let testMatches: string[] = [];

  try {
    if (currentRegex) {
      const compiled = new RegExp(currentRegex, "gi");
      regexValid = true;
      if (testInput) {
        testMatches = testInput.match(compiled) ?? [];
      }
    }
  } catch {
    regexValid = false;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form.AppForm>
        <form.Form>
          <DialogTitle>{isEdit ? "Edit Pattern" : "Add Custom Pattern"}</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <form.AppField name="name">
                {(field) => <field.TextField label="Pattern Name" autoFocus />}
              </form.AppField>
              <form.AppField name="regex">
                {(field) => (
                  <field.TextField
                    label="Regular Expression"
                    sx={{ "& input": { fontFamily: "monospace" } }}
                  />
                )}
              </form.AppField>
              {currentRegex && !regexValid && (
                <Alert severity="error" variant="outlined">
                  Invalid regular expression
                </Alert>
              )}
              <form.AppField name="severity">
                {(field) => <field.Select label="Severity" items={SEVERITY_ITEMS} />}
              </form.AppField>

              <Box>
                <Typography
                  variant="captionMuted"
                  sx={{ fontWeight: 600, mb: 0.5, display: "block" }}
                >
                  Test your pattern
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Paste sample text to test matches..."
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  sx={{ "& input": { fontFamily: "monospace", fontSize: 13 } }}
                />
                {testInput && regexValid && (
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                    {testMatches.length > 0 ? (
                      testMatches.map((match, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a regex can match the same text twice; the list is rebuilt, never reordered
                        <Chip key={i} label={match} size="small" color="warning" />
                      ))
                    ) : (
                      <Typography variant="captionMuted">No matches</Typography>
                    )}
                  </Stack>
                )}
              </Box>
            </Stack>
          </DialogContent>
          <form.DialogFormActions
            onCancel={onClose}
            submitLabel={isEdit ? "Update" : "Create"}
            pendingLabel="Saving..."
          />
        </form.Form>
      </form.AppForm>
    </Dialog>
  );
}

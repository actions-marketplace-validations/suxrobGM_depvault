"use client";

import type { ReactElement } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { client } from "@/api/client";
import { useApiMutation } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CreateProjectBody } from "@/api/types/project";
import { VaultGate } from "@/components/features/vault";
import { useAppForm } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useVault } from "@/hooks/use-vault";
import { ROUTES } from "@/lib/constants";
import { projectSchema } from "./schemas";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Creates a project and its encryption key; the vault must be unlocked first. */
export function CreateProjectDialog(props: CreateProjectDialogProps): ReactElement {
  const { open, onClose } = props;
  const router = useRouter();
  const toast = useToast();
  const { isVaultUnlocked, initializeProjectKeys } = useVault();

  const mutation = useApiMutation((values: CreateProjectBody) => client.api.projects.post(values), {
    invalidateKeys: [queryKeys.projects.list()],
    successMessage: "Project created",
    errorMessage: "Failed to create project",
    onSuccess: async (data) => {
      onClose();
      if (!data) return;
      try {
        await initializeProjectKeys(data.id);
      } catch {
        toast.error("The project was created, but its encryption key could not be set up");
      }
      router.push(ROUTES.project(data.id) as Route);
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: "",
      description: "",
      repositoryUrl: "",
    },
    validators: { onSubmit: projectSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        name: value.name,
        ...(value.description && { description: value.description }),
        ...(value.repositoryUrl && { repositoryUrl: value.repositoryUrl }),
      });
    },
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Project</DialogTitle>
      {isVaultUnlocked ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <form.AppField name="name">
                {(field) => <field.TextField label="Project Name" autoFocus />}
              </form.AppField>
              <form.AppField name="description">
                {(field) => (
                  <field.TextField
                    label="Description"
                    multiline
                    rows={3}
                    placeholder="Optional project description"
                  />
                )}
              </form.AppField>
              <form.AppField name="repositoryUrl">
                {(field) => (
                  <field.TextField
                    label="Repository URL"
                    placeholder="https://github.com/org/repo"
                  />
                )}
              </form.AppField>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogActions>
        </form>
      ) : (
        <>
          <DialogContent>
            <VaultGate description="Unlock your vault first so the new project's encryption key can be created." />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose}>Cancel</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

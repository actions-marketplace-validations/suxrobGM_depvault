"use client";

import type { ReactElement } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import { useRouter } from "next/navigation";
import { useCreateProject } from "@/api/queries/projects";
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

  const mutation = useCreateProject({
    onSuccess: async (project) => {
      onClose();
      try {
        await initializeProjectKeys(project.id);
      } catch {
        toast.error("The project was created, but its encryption key could not be set up");
      }
      router.push(ROUTES.project(project.id));
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
        <form.AppForm>
          <form.Form>
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
            <form.DialogFormActions
              onCancel={handleClose}
              submitLabel="Create"
              pendingLabel="Creating..."
            />
          </form.Form>
        </form.AppForm>
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

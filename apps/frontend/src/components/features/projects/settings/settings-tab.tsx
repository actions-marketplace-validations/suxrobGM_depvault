"use client";

import type { ReactElement } from "react";
import { Delete as DeleteIcon } from "@mui/icons-material";
import {
  Button,
  CardActions,
  CardContent,
  CardHeader,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { ProjectDetailDto, UpdateProjectBody } from "@/api/types/project";
import { Surface } from "@/components/ui/cards";
import { useAppForm } from "@/components/ui/form";
import { useConfirm } from "@/hooks/use-confirm";
import { ROUTES } from "@/lib/constants";
import { projectSchema } from "../schemas";
import { CiTokensSection } from "./ci-tokens-section";
import { ShareLinksSection } from "./share-links-section";

interface SettingsTabProps {
  projectId: string;
}

export function SettingsTab(props: SettingsTabProps): ReactElement | null {
  const { projectId } = props;
  const router = useRouter();
  const confirm = useConfirm();

  const { data: project } = useApiQuery<ProjectDetailDto>(
    queryKeys.projects.detail(projectId),
    () => client.api.projects({ id: projectId }).get(),
  );

  const isOwner = project?.currentUserRole === "OWNER";
  const canEdit = isOwner || project?.currentUserRole === "EDITOR";

  const updateMutation = useApiMutation(
    (values: UpdateProjectBody) => client.api.projects({ id: projectId }).put(values),
    {
      invalidateKeys: [queryKeys.projects.detail(projectId), queryKeys.projects.list()],
      successMessage: "Project updated",
    },
  );

  const deleteMutation = useApiMutation(() => client.api.projects({ id: projectId }).delete(), {
    invalidateKeys: [queryKeys.projects.list()],
    successMessage: "Project deleted",
    onSuccess: () => router.push(ROUTES.projects as Route),
  });

  const form = useAppForm({
    defaultValues: {
      name: project?.name ?? "",
      description: project?.description ?? "",
      repositoryUrl: project?.repositoryUrl ?? "",
    },
    validators: { onSubmit: projectSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        name: value.name,
        ...(value.description !== undefined && { description: value.description || undefined }),
        ...(value.repositoryUrl !== undefined && {
          repositoryUrl: value.repositoryUrl || undefined,
        }),
      });
    },
  });

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete Project",
      description: `Are you sure you want to delete ${project?.name}? This will permanently remove all associated data. This action cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      confirmationText: project?.name,
    });

    if (confirmed) {
      await deleteMutation.mutateAsync();
    }
  };

  if (!project) {
    return null;
  }

  return (
    <Grid container spacing={3} className="vault-fade-up vault-delay-2">
      <Grid size={{ xs: 12 }}>
        <Surface>
          <CardHeader title="Project Settings" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2.5}>
                <form.AppField name="name">
                  {(field) => <field.TextField label="Project Name" disabled={!canEdit} />}
                </form.AppField>
                <form.AppField name="description">
                  {(field) => (
                    <field.TextField label="Description" multiline rows={3} disabled={!canEdit} />
                  )}
                </form.AppField>
                <form.AppField name="repositoryUrl">
                  {(field) => (
                    <field.TextField
                      label="Repository URL"
                      placeholder="https://github.com/org/repo"
                      disabled={!canEdit}
                    />
                  )}
                </form.AppField>
              </Stack>
            </CardContent>
            {canEdit && (
              <CardActions>
                <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardActions>
            )}
          </form>
        </Surface>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <CiTokensSection projectId={projectId} canEdit={canEdit} isOwner={isOwner} />
      </Grid>
      {canEdit && (
        <Grid size={{ xs: 12 }}>
          <ShareLinksSection projectId={projectId} />
        </Grid>
      )}
      {isOwner && (
        <Grid size={{ xs: 12 }}>
          <Surface sx={{ borderColor: "error.dark" }}>
            <CardHeader
              title="Danger Zone"
              slotProps={{ title: { sx: { color: "error.main" } } }}
            />
            <CardContent sx={{ p: 3 }}>
              <Typography variant="body2Muted">
                Permanently delete this project and all associated data, including analyses and
                every file with its version history. This action cannot be undone.
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDelete}
              >
                Delete Project
              </Button>
            </CardActions>
          </Surface>
        </Grid>
      )}
    </Grid>
  );
}

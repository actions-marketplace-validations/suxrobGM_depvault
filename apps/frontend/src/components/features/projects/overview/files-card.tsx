"use client";

import type { ReactElement } from "react";
import { ArrowForward as ArrowForwardIcon, FolderOpen as FilesIcon } from "@mui/icons-material";
import { CardActions, CardContent, CardHeader, Grid, Stack, Typography } from "@mui/material";
import { useProjectFiles } from "@/api/queries/files";
import { IconBox, Surface } from "@/components/ui/cards";
import { LinkButton } from "@/components/ui/inputs";
import { ROUTES } from "@/lib/constants";
import { formatRelativeTime } from "@/utils/formatters";

interface FilesCardProps {
  projectId: string;
}

/** Summary of the project's encrypted files with a link to the Files tab. */
export function FilesCard(props: FilesCardProps): ReactElement {
  const { projectId } = props;

  const { data } = useProjectFiles(projectId);

  const files = data?.items ?? [];
  const lastUpdated = files.reduce<Date | null>((latest, file) => {
    const updated = new Date(file.updatedAt);
    return !latest || updated > latest ? updated : latest;
  }, null);

  const stats = [
    { label: "Files", value: String(files.length) },
    { label: "Last updated", value: lastUpdated ? formatRelativeTime(lastUpdated) : "—" },
  ];

  return (
    <Surface accent="success" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardHeader
        avatar={
          <IconBox color="var(--mui-palette-success-main)" size={40}>
            <FilesIcon sx={{ fontSize: 22 }} />
          </IconBox>
        }
        title="Files"
        subheader="End-to-end encrypted"
      />
      <CardContent sx={{ p: 3, flex: 1 }}>
        <Grid container spacing={2}>
          {stats.map((stat) => (
            <Grid size={6} key={stat.label}>
              <Stack spacing={0.25}>
                <Typography variant="captionMuted">{stat.label}</Typography>
                <Typography variant="statValue" sx={{ fontSize: "1rem" }}>
                  {stat.value}
                </Typography>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </CardContent>
      <CardActions>
        <LinkButton
          href={ROUTES.projectFiles(projectId)}
          variant="outlined"
          size="small"
          endIcon={<ArrowForwardIcon />}
        >
          Open Files
        </LinkButton>
      </CardActions>
    </Surface>
  );
}

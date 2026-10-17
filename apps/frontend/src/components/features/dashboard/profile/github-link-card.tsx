"use client";

import type { ReactElement } from "react";
import { GitHub as GitHubIcon } from "@mui/icons-material";
import { Box, Button, CardContent, CardHeader, Chip, Stack, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import { Surface } from "@/components/ui/cards";
import { githubAuthUrl } from "@/utils/url";

interface GitHubLinkCardProps {
  githubId: string | null;
  githubUsername: string | null;
}

/** Links (or relinks) a GitHub account for repository imports. */
export function GitHubLinkCard(props: GitHubLinkCardProps): ReactElement {
  const { githubId, githubUsername } = props;
  const linkGitHubUrl = githubAuthUrl(usePathname());

  return (
    <Surface className="vault-fade-up vault-delay-1">
      <CardHeader title="GitHub Account" />
      <CardContent sx={{ p: 3 }}>
        {githubId ? (
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <GitHubIcon />
              <Box>
                <Typography variant="label">{githubUsername ?? "Connected"}</Typography>
                <Chip label="Linked" size="small" color="success" />
              </Box>
            </Stack>
            <Button variant="outlined" size="small" component="a" href={linkGitHubUrl}>
              Relink
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Typography variant="body2Muted">
              Link your GitHub account to import dependencies from your repositories.
            </Typography>
            <Box>
              <Button
                variant="contained"
                startIcon={<GitHubIcon />}
                component="a"
                href={linkGitHubUrl}
              >
                Link GitHub
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Surface>
  );
}

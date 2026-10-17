"use client";

import type { ReactElement } from "react";
import { GitHub as GitHubIcon } from "@mui/icons-material";
import { Box, Chip, Stack, Typography } from "@mui/material";
import type { GitHubRepoListResponseDto } from "@/api/types/github";
import { Surface } from "@/components/ui/cards";
import { LoadingSpinner } from "@/components/ui/feedback";
import { SearchField } from "@/components/ui/inputs";

interface GitHubRepoSelectorProps {
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  repos: GitHubRepoListResponseDto["items"] | null;
  onSelectRepo: (fullName: string) => void;
}

/** Searchable GitHub repository list; reports the selected repo's full name. */
export function GitHubRepoSelector(props: GitHubRepoSelectorProps): ReactElement {
  const { search, onSearchChange, isLoading, repos, onSelectRepo } = props;

  return (
    <Box>
      <SearchField
        placeholder="Search repositories..."
        value={search}
        onChange={onSearchChange}
        fullWidth
        sx={{ mb: 2 }}
      />
      {isLoading && <LoadingSpinner size={32} py={3} />}
      <Box
        sx={{
          maxHeight: 300,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          pr: 0.5,
        }}
      >
        {repos
          ?.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
          .map((repo) => (
            <Surface
              key={repo.id}
              sx={{ flexShrink: 0, "&:hover": { borderColor: "primary.main" } }}
              onClick={() => onSelectRepo(repo.fullName)}
              interactive
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", p: 1.5 }}>
                <GitHubIcon fontSize="small" sx={{ flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <Typography variant="label" noWrap>
                    {repo.fullName}
                  </Typography>
                  {repo.description && (
                    <Typography variant="captionMuted" noWrap sx={{ display: "block" }}>
                      {repo.description}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  {repo.language && <Chip label={repo.language} size="small" variant="outlined" />}
                  {repo.isPrivate && <Chip label="Private" size="small" color="warning" />}
                </Stack>
              </Stack>
            </Surface>
          ))}
      </Box>
    </Box>
  );
}

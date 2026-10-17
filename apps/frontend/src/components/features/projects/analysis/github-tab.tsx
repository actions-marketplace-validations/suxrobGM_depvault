"use client";

import { type ReactElement, useState } from "react";
import { GitHub as GitHubIcon } from "@mui/icons-material";
import { Button, Stack, Step, StepLabel, Stepper, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import {
  useGitHubDependencyFiles,
  useGitHubRepos,
  useImportGitHubAnalyses,
} from "@/api/queries/analyses";
import type { GitHubDependencyFileDto } from "@/api/types/github";
import { useAuth } from "@/auth/use-auth";
import { useToast } from "@/hooks/use-toast";
import { githubAuthUrl } from "@/utils/url";
import { GitHubFileSelector } from "./github-file-selector";
import { GitHubRepoSelector } from "./github-repo-selector";

interface SelectedRepo {
  owner: string;
  repo: string;
}

interface GitHubTabContentProps {
  projectId: string;
  onClose: () => void;
}

export function GitHubTab(props: GitHubTabContentProps): ReactElement {
  const { projectId, onClose } = props;
  const { user } = useAuth();
  const notification = useToast();
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState<SelectedRepo | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<GitHubDependencyFileDto[]>([]);
  const [repoSearch, setRepoSearch] = useState("");

  const hasGitHub = !!user?.githubId;

  const { data: reposData, isLoading: reposLoading } = useGitHubRepos(hasGitHub && step === 0);
  const { data: depFiles, isLoading: filesLoading } = useGitHubDependencyFiles(
    selectedRepo,
    step === 1,
  );

  const importMutation = useImportGitHubAnalyses(projectId, {
    onSuccess: ({ failed }) => {
      if (failed.length > 0) notification.error(`Failed to analyze ${failed.join(", ")}`);
      onClose();
    },
  });

  const handleSelectRepo = (fullName: string) => {
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) return;
    setSelectedRepo({ owner, repo });
    setSelectedFiles([]);
    setStep(1);
  };

  const handleToggleFile = (file: GitHubDependencyFileDto) => {
    setSelectedFiles((prev) => {
      const exists = prev.some((f) => f.path === file.path);
      if (exists) return prev.filter((f) => f.path !== file.path);
      return [...prev, file];
    });
  };

  const handleToggleAll = () => {
    if (!depFiles) return;
    if (selectedFiles.length === depFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles([...depFiles]);
    }
  };

  const handleAnalyze = () => {
    if (!selectedRepo || selectedFiles.length === 0) return;
    importMutation.mutate({ ...selectedRepo, files: selectedFiles });
  };

  if (!hasGitHub) {
    return (
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
          py: 3,
        }}
      >
        <GitHubIcon sx={{ fontSize: 48, color: "text.secondary" }} />
        <Typography variant="body1Muted" sx={{ textAlign: "center" }}>
          Link your GitHub account to import dependency files from your repositories.
        </Typography>
        <Button
          variant="contained"
          startIcon={<GitHubIcon />}
          component="a"
          href={githubAuthUrl(pathname)}
        >
          Link GitHub
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stepper activeStep={step} sx={{ mb: 1 }}>
        <Step>
          <StepLabel>Select Repository</StepLabel>
        </Step>
        <Step>
          <StepLabel>Select Files</StepLabel>
        </Step>
      </Stepper>

      {step === 0 && (
        <GitHubRepoSelector
          search={repoSearch}
          onSearchChange={setRepoSearch}
          isLoading={reposLoading}
          repos={reposData?.items ?? null}
          onSelectRepo={handleSelectRepo}
        />
      )}

      {step === 1 && (
        <GitHubFileSelector
          repoLabel={`${selectedRepo?.owner}/${selectedRepo?.repo}`}
          isLoading={filesLoading}
          files={depFiles ?? null}
          selectedFiles={selectedFiles}
          isAnalyzing={importMutation.isPending}
          onToggleFile={handleToggleFile}
          onToggleAll={handleToggleAll}
          onBack={() => setStep(0)}
          onClose={onClose}
          onAnalyze={handleAnalyze}
        />
      )}
    </Stack>
  );
}

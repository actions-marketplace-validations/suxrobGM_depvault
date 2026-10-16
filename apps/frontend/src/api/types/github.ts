import type { Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type GitHubRepos = typeof client.api.github.repos;

export type GitHubRepoListResponseDto = Data<GitHubRepos["get"]>;

type GitHubRepoByOwner = ReturnType<GitHubRepos>;
type GitHubRepoByOwnerAndRepo = ReturnType<GitHubRepoByOwner>;

type GitHubDependencyFilesResponseDto = Data<GitHubRepoByOwnerAndRepo["dependency-files"]["get"]>;
export type GitHubDependencyFileDto = GitHubDependencyFilesResponseDto[number];

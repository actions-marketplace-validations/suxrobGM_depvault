import { DEPENDENCY_EXTENSION_PATTERNS, DEPENDENCY_FILE_MAP } from "@depvault/shared/constants";
import { inject, injectable } from "@needle-di/core";
import { BadRequestError, UnauthorizedError } from "@/common/errors/http.error";
import { logger } from "@/common/logger/logger";
import { PrismaClient } from "@/generated/prisma";
import type {
  GitHubCommit,
  GitHubContentResponse,
  GitHubRepo,
  GitHubTreeResponse,
} from "./github-api.types";

const GITHUB_API_URL = "https://api.github.com";
const DEPENDENCY_FILE_NAMES = new Set(Object.keys(DEPENDENCY_FILE_MAP));

@injectable()
export class GitHubApiService {
  constructor(private readonly prisma = inject(PrismaClient)) {}

  async listRepos(userId: string, page: number, limit: number) {
    const token = await this.getToken(userId);

    const params = new URLSearchParams({
      per_page: limit.toString(),
      page: page.toString(),
      sort: "updated",
      direction: "desc",
    });

    const repos = await this.json<GitHubRepo[]>(token, `/user/repos?${params}`);

    return {
      items: repos.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        isPrivate: r.private,
        defaultBranch: r.default_branch,
        description: r.description,
        language: r.language,
        updatedAt: r.updated_at,
      })),
    };
  }

  async listDependencyFiles(userId: string, owner: string, repo: string) {
    const token = await this.getToken(userId);

    const repoData = await this.json<GitHubRepo>(token, `/repos/${owner}/${repo}`);
    const treeData = await this.json<GitHubTreeResponse>(
      token,
      `/repos/${owner}/${repo}/git/trees/${repoData.default_branch}?recursive=1`,
    );

    return treeData.tree.flatMap((item) => {
      if (item.type !== "blob") return [];
      const fileName = item.path.split("/").pop() ?? "";
      const ecosystem = DEPENDENCY_FILE_NAMES.has(fileName)
        ? DEPENDENCY_FILE_MAP[fileName]
        : DEPENDENCY_EXTENSION_PATTERNS.find((e) => fileName.toLowerCase().endsWith(e.ext))
            ?.ecosystem;
      return ecosystem ? [{ path: item.path, name: fileName, ecosystem }] : [];
    });
  }

  async getFileContent(userId: string, owner: string, repo: string, path: string) {
    if (path.includes("..")) {
      throw new BadRequestError("Invalid file path");
    }

    const token = await this.getToken(userId);

    const data = await this.json<GitHubContentResponse | GitHubContentResponse[]>(
      token,
      `/repos/${owner}/${repo}/contents/${path}`,
    );

    if (Array.isArray(data)) {
      throw new BadRequestError("Path points to a directory, not a file");
    }

    if (data.encoding !== "base64" || !data.content) {
      throw new BadRequestError("Unable to read file content");
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const fileName = data.path.split("/").pop() ?? data.name;

    return { content, fileName };
  }

  async listCommits(userId: string, owner: string, repo: string, perPage = 100, page = 1) {
    const token = await this.getToken(userId);

    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: page.toString(),
    });

    const commits = await this.json<GitHubCommit[]>(
      token,
      `/repos/${owner}/${repo}/commits?${params}`,
    );

    return commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
    }));
  }

  async getCommitDiff(userId: string, owner: string, repo: string, sha: string): Promise<string> {
    const token = await this.getToken(userId);

    const response = await this.githubFetch(
      token,
      `/repos/${owner}/${repo}/commits/${sha}`,
      "application/vnd.github.diff",
    );

    return response.text();
  }

  private async getToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      throw new BadRequestError(
        "GitHub account not linked. Please link your GitHub account first.",
      );
    }

    return user.githubAccessToken;
  }

  private async json<T>(token: string, path: string): Promise<T> {
    const response = await this.githubFetch(token, path);
    return (await response.json()) as T;
  }

  private async githubFetch(
    token: string,
    path: string,
    accept = "application/vnd.github+json",
  ): Promise<Response> {
    const url = `${GITHUB_API_URL}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (response.status === 401) {
      throw new UnauthorizedError(
        "GitHub token expired or revoked. Please re-link your GitHub account.",
      );
    }

    if (response.status === 403) {
      throw new UnauthorizedError(
        "Insufficient GitHub permissions. Please re-link your GitHub account to grant repository access.",
      );
    }

    if (!response.ok) {
      logger.warn({ url, status: response.status }, "GitHub API request failed");
      throw new BadRequestError(`GitHub API error: ${response.statusText}`);
    }

    return response;
  }
}

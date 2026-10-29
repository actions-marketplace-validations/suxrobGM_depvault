interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

/** Extracts owner and repo from a GitHub repository URL. */
export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
  // Matches both HTTPS (github.com/owner/repo) and SSH (github.com:owner/repo) forms.
  const match = url.match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}

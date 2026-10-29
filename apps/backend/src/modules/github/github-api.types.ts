export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  language: string | null;
  updated_at: string;
}

export interface GitHubTreeResponse {
  sha: string;
  tree: Array<{
    path: string;
    mode: string;
    type: string;
    size?: number;
  }>;
  truncated: boolean;
}

export interface GitHubContentResponse {
  content: string;
  encoding: string;
  name: string;
  path: string;
  size: number;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  date: string;
}

/** Read access to one repository's history, bound to a GitHub token looked up once. */
export interface RepoHistory {
  listCommits(perPage?: number, page?: number): Promise<CommitSummary[]>;
  getCommitDiff(sha: string): Promise<string>;
}

/**
 * Hierarchical React Query key factory. Every per-project key starts with
 * `projects.scope(id)`, so invalidating that prefix refreshes all of a project's data, and each
 * domain's `all(id)` refreshes just that domain (lists, details and summaries together).
 */
const projectScope = (projectId: string) => ["projects", projectId] as const;

const analysesScope = (projectId: string) => [...projectScope(projectId), "analyses"] as const;
const licensesScope = (projectId: string) => [...projectScope(projectId), "licenses"] as const;
const filesScope = (projectId: string) => [...projectScope(projectId), "files"] as const;
const scanningScope = (projectId: string) =>
  [...projectScope(projectId), "secret-scanning"] as const;

/** Page number and size of a paginated list. */
export interface PageParams {
  page: number;
  pageSize: number;
}

export const queryKeys = {
  projects: {
    list: () => ["projects", "list"] as const,
    /** Cross-project counters for the dashboard home. */
    stats: () => ["projects", "stats"] as const,
    scope: projectScope,
    detail: (projectId: string) => [...projectScope(projectId), "detail"] as const,
    members: (projectId: string) => [...projectScope(projectId), "members"] as const,
    invitations: (projectId: string) => [...projectScope(projectId), "invitations"] as const,
    pendingKeyGrants: (projectId: string) =>
      [...projectScope(projectId), "keygrants", "pending"] as const,
  },

  invitations: {
    pending: () => ["invitations", "pending"] as const,
  },

  analyses: {
    all: analysesScope,
    list: (projectId: string, params: PageParams) =>
      [...analysesScope(projectId), "list", params] as const,
    overview: (projectId: string) => [...analysesScope(projectId), "overview"] as const,
    detail: (projectId: string, analysisId: string) =>
      [...analysesScope(projectId), "detail", analysisId] as const,
  },

  auditLog: {
    list: (projectId: string, params: object) =>
      [...projectScope(projectId), "audit-log", params] as const,
  },

  globalActivity: {
    list: (params: object) => ["activity", params] as const,
  },

  licenses: {
    all: licensesScope,
    rules: (projectId: string) => [...licensesScope(projectId), "rules"] as const,
    complianceAll: (projectId: string) => [...licensesScope(projectId), "compliance"] as const,
    complianceOverview: (projectId: string) =>
      [...licensesScope(projectId), "compliance", "overview"] as const,
    compliance: (projectId: string, params: PageParams & { search: string }) =>
      [...licensesScope(projectId), "compliance", params] as const,
  },

  files: {
    list: (projectId: string) => [...filesScope(projectId), "list"] as const,
    content: (projectId: string, fileId: string) =>
      [...filesScope(projectId), "content", fileId] as const,
    versions: (projectId: string, fileId: string) =>
      [...filesScope(projectId), "versions", fileId] as const,
    versionContent: (projectId: string, fileId: string, version: number) =>
      [...filesScope(projectId), "version-content", fileId, version] as const,
  },

  ciTokens: {
    byProject: (projectId: string) => [...projectScope(projectId), "ci-tokens"] as const,
  },

  scanning: {
    all: scanningScope,
    summary: (projectId: string) => [...scanningScope(projectId), "summary"] as const,
    scansList: (projectId: string, params: PageParams) =>
      [...scanningScope(projectId), "scans", params] as const,
    detections: (projectId: string) => [...scanningScope(projectId), "detections"] as const,
    detectionsList: (projectId: string, params: object) =>
      [...scanningScope(projectId), "detections", params] as const,
    patterns: (projectId: string) => [...scanningScope(projectId), "patterns"] as const,
  },

  shareLinks: {
    byProject: (projectId: string) => [...projectScope(projectId), "share-links"] as const,
  },

  github: {
    repos: () => ["github", "repos"] as const,
    dependencyFiles: (owner: string | null, repo: string | null) =>
      ["github", "dependency-files", owner, repo] as const,
  },

  security: {
    overview: () => ["security-overview"] as const,
  },

  subscription: {
    current: () => ["subscription"] as const,
  },

  notifications: {
    all: ["notifications"] as const,
    list: (filters: unknown) => ["notifications", "list", filters] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
  },

  admin: {
    all: ["admin"] as const,
    stats: () => ["admin", "stats"] as const,
    usersList: (params: object) => ["admin", "users", "list", params] as const,
    userDetail: (userId: string | null) => ["admin", "users", "detail", userId] as const,
    subscriptionsList: (params: object) => ["admin", "subscriptions", "list", params] as const,
  },
};

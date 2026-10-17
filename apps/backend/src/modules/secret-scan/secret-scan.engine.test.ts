import { describe, expect, it, mock } from "bun:test";
import type { GitHubApiService } from "@/modules/github/github-api.service";
import { scanCommitHistory } from "./secret-scan.engine";

function makeDiff(filePath: string, addedLines: string[]): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,0 +1,${addedLines.length} @@`,
    ...addedLines.map((l) => `+${l}`),
  ].join("\n");
}

/** A diff that adds one line to each of several files. */
const multiFileDiff = (files: Record<string, string>): string =>
  Object.entries(files)
    .map(([path, line]) => makeDiff(path, [line]))
    .join("\n");

function createMockGitHubApi(diffs: Record<string, string>): GitHubApiService {
  return {
    listCommits: mock(() => Promise.resolve(Object.keys(diffs).map((sha) => ({ sha })))),
    getCommitDiff: mock((_uid: string, _owner: string, _repo: string, sha: string) => {
      const diff = diffs[sha];
      return diff === undefined
        ? Promise.reject(new Error(`No diff for ${sha}`))
        : Promise.resolve(diff);
    }),
  } as unknown as GitHubApiService;
}

const awsPattern = {
  id: "p-aws",
  name: "AWS Access Key ID",
  regex: "AKIA[0-9A-Z]{16}",
  severity: "CRITICAL" as const,
  remediation: "Rotate the AWS key immediately.",
};

const genericSecretPattern = {
  id: "p-secret",
  name: "Generic Secret",
  regex: "(secret|password)\\s*[:=]\\s*['\"][^\\s'\"]{8,}['\"]",
  severity: "MEDIUM" as const,
};

const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const OTHER_AWS_KEY = "AKIA0000000000000000";

type ScanPatterns = Parameters<typeof scanCommitHistory>[4];

const scan = (diffs: Record<string, string>, patterns: ScanPatterns = [awsPattern]) =>
  scanCommitHistory(createMockGitHubApi(diffs), "user1", "owner", "repo", patterns);

describe("scanCommitHistory", () => {
  it("should report a detection with its location, severity, and remediation", async () => {
    const result = await scan({ abc123: makeDiff("config.ts", [`const key = "${AWS_KEY}";`]) });

    expect(result.commitsScanned).toBe(1);
    expect(result.detections).toEqual([
      expect.objectContaining({
        patternId: "p-aws",
        commitHash: "abc123",
        filePath: "config.ts",
        lineNumber: 1,
        severity: "CRITICAL",
        remediationSteps: "Rotate the AWS key immediately.",
      }),
    ]);
  });

  it.each([
    [
      "a long match keeps the first and last four characters",
      awsPattern,
      AWS_KEY,
      "AKIA************MPLE",
    ],
    [
      "a short match (<= 12 chars) keeps only the first four",
      { id: "p-short", name: "Short", regex: "SK_[A-Z]{5}", severity: "HIGH" as const },
      "SK_ABCDE",
      "SK_A****",
    ],
  ])("should redact the snippet: %s", async (_, pattern, secret, snippet) => {
    const result = await scan({ c1: makeDiff("app.ts", [`key = "${secret}"`]) }, [pattern]);

    expect(result.detections[0]!.matchSnippet).toBe(snippet);
  });

  it("should set remediationSteps to null when the pattern has none", async () => {
    const result = await scan({ c1: makeDiff("app.ts", [`password = "supersecretpw1"`]) }, [
      genericSecretPattern,
    ]);

    expect(result.detections[0]!.remediationSteps).toBeNull();
  });

  it.each([
    [
      "one per commit",
      { c1: makeDiff("a.ts", [AWS_KEY]), c2: makeDiff("b.ts", [OTHER_AWS_KEY]) },
      2,
    ],
    ["one per line", { c1: makeDiff("a.ts", [AWS_KEY, OTHER_AWS_KEY]) }, 2],
    [
      "one per pattern per line (two keys on a line)",
      { c1: makeDiff("a.ts", [`${AWS_KEY} ${OTHER_AWS_KEY}`]) },
      1,
    ],
    ["none for clean code", { c1: makeDiff("a.ts", ['const greeting = "hello";']) }, 0],
    ["none in diffs over 1MB", { c1: makeDiff("big.ts", ["x".repeat(1024 * 1024 + 1)]) }, 0],
    [
      "none in lock files or node_modules",
      { c1: multiFileDiff({ "package-lock.json": AWS_KEY, "node_modules/pkg/index.js": AWS_KEY }) },
      0,
    ],
  ])("should find %s", async (_, diffs, count) => {
    const result = await scan(diffs);

    expect(result.detections).toHaveLength(count);
  });

  it("should run every pattern against the same diff", async () => {
    const result = await scan(
      {
        c1: makeDiff("config.ts", [`aws_key = "${AWS_KEY}"`, 'secret = "supersecretpassword123"']),
      },
      [awsPattern, genericSecretPattern],
    );

    expect(result.detections.map((d) => d.patternId).sort()).toEqual(["p-aws", "p-secret"]);
  });

  it("should only scan added lines, not deleted or context lines", async () => {
    const diff = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,3 +1,3 @@",
      " safe context line",
      `-old_key = "${AWS_KEY}"`,
      "+clean_replacement = 42",
    ].join("\n");

    const result = await scan({ c1: diff });

    expect(result.detections).toHaveLength(0);
  });

  it("should skip test files", async () => {
    const result = await scan({
      c1: multiFileDiff({ "src/auth.service.test.ts": AWS_KEY, "src/config.ts": OTHER_AWS_KEY }),
    });

    expect(result.detections.map((d) => d.filePath)).toEqual(["src/config.ts"]);
  });

  it("should keep scanning when one commit's diff fails to load", async () => {
    const api = createMockGitHubApi({ ok: makeDiff("file.ts", [AWS_KEY]) });
    (api.listCommits as ReturnType<typeof mock>).mockResolvedValueOnce([
      { sha: "fail" },
      { sha: "ok" },
    ]);

    const result = await scanCommitHistory(api, "user1", "owner", "repo", [awsPattern]);

    expect(result.commitsScanned).toBe(2);
    expect(result.detections.map((d) => d.commitHash)).toEqual(["ok"]);
  });

  it("should pass maxCommits to listCommits", async () => {
    const api = createMockGitHubApi({});

    const result = await scanCommitHistory(api, "user1", "owner", "repo", [awsPattern], 50);

    expect(result.commitsScanned).toBe(0);
    expect(api.listCommits).toHaveBeenCalledWith("user1", "owner", "repo", 50);
  });
});

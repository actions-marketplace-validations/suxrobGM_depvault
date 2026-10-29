using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Services.Scan;

/// <summary>
/// What <c>scan</c> found. <see cref="Analyses"/> and <see cref="UnsyncedFiles"/> are empty when the scan ran
/// without a linked project (e.g. in CI), since both need the server.
/// </summary>
public sealed record ScanReport(List<FileAnalysis> Analyses, List<SecretDetection> Leaks, List<string> UnsyncedFiles);

/// <summary>Scans a repository: leaked secrets locally, plus dependency analysis and unsynced secret files when linked.</summary>
public sealed class RepoScanner(
    IFileScanner fileScanner,
    ISecretDetector secretDetector,
    ILocalFileScanner localFileScanner,
    AnalysisClient analysisClient,
    IRepoFilesApi filesApi)
{
    public async Task<ScanReport> ScanAsync(string repoPath, ProjectLink? link, CancellationToken ct)
    {
        var leaksTask = Task.Run(() => secretDetector.ScanDirectory(repoPath), ct);
        if (link is null)
        {
            return new ScanReport([], await leaksTask, []);
        }

        var storedTask = filesApi.ListAsync(link.ProjectId, ct);
        var candidatesTask = Task.Run(() => localFileScanner.FindCandidates(link.Root, link.Ignore), ct);
        var files = fileScanner.FindDependencyFiles(repoPath);
        var analyses = new FileAnalysis[files.Count];
        await Parallel.ForAsync(0, files.Count, new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = ct },
            async (i, token) => analyses[i] = await analysisClient.TryAnalyzeAsync(link.ProjectId, files[i], null, token));

        var stored = (await storedTask).Select(r => r.Path).ToHashSet(StringComparer.Ordinal);
        var unsynced = (await candidatesTask).Where(p => !stored.Contains(p)).ToList();
        return new ScanReport([.. analyses], await leaksTask, unsynced);
    }

    /// <summary>Appends files to the repo's .gitignore, skipping ones already listed; returns how many were added.</summary>
    public static int AddToGitignore(string repoPath, IEnumerable<string> files)
    {
        var gitignorePath = Path.Combine(repoPath, ".gitignore");
        var existing = File.Exists(gitignorePath) ? File.ReadAllLines(gitignorePath).ToHashSet() : [];
        var entries = files.Distinct()
            .Where(f => !existing.Contains(f) && !existing.Contains(Path.GetFileName(f)))
            .ToList();

        if (entries.Count > 0)
        {
            File.AppendAllLines(gitignorePath, ["", "# Secret files detected by depvault scan", .. entries]);
        }

        return entries.Count;
    }

    /// <summary>Parses a server or <c>--fail-on</c> severity name; unknown names count as none.</summary>
    public static Severity ParseSeverity(string? name) =>
        Enum.TryParse<Severity>(name, ignoreCase: true, out var severity) ? severity : Severity.None;
}

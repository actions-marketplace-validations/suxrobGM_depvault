using DepVault.Cli.Services.Sync;
using Microsoft.Kiota.Abstractions;

namespace DepVault.Cli.Services.Scan;

/// <summary>One dependency file's analysis, or why it couldn't be analyzed.</summary>
public sealed record FileAnalysis(string File, AnalysisResult? Result, string? Error);

/// <summary>
/// What <c>scan</c> found. <see cref="Analyses"/> and <see cref="UnsyncedFiles"/> are empty when the scan ran
/// without a linked project (e.g. in CI), since both need the server.
/// </summary>
public sealed record ScanReport(List<FileAnalysis> Analyses, List<SecretDetection> Leaks, List<string> UnsyncedFiles);

public enum Severity
{
    None,
    Low,
    Medium,
    High,
    Critical
}

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
        var leaks = await Task.Run(() => secretDetector.ScanDirectory(repoPath), ct);
        if (link is null)
        {
            return new ScanReport([], leaks, []);
        }

        var analyses = new List<FileAnalysis>();
        foreach (var file in fileScanner.FindDependencyFiles(repoPath))
        {
            analyses.Add(await AnalyzeAsync(link.ProjectId, file, ct));
        }

        var stored = (await filesApi.ListAsync(link.ProjectId, ct)).Select(r => r.Path).ToHashSet(StringComparer.Ordinal);
        var unsynced = localFileScanner.FindCandidates(link.Root, link.Ignore).Where(p => !stored.Contains(p)).ToList();
        return new ScanReport(analyses, leaks, unsynced);
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

    /// <summary>Parses a server or detector severity name; unknown names count as none.</summary>
    public static Severity ParseSeverity(string? name) =>
        Enum.TryParse<Severity>(name, ignoreCase: true, out var severity) ? severity : Severity.None;

    private async Task<FileAnalysis> AnalyzeAsync(string projectId, DiscoveredFile file, CancellationToken ct)
    {
        if (EcosystemResolver.Resolve(file.FileName) is not { } ecosystem)
        {
            return new FileAnalysis(file.RelativePath, null, "unknown ecosystem");
        }

        try
        {
            return new FileAnalysis(file.RelativePath, await analysisClient.AnalyzeFileAsync(projectId, file, ecosystem, ct), null);
        }
        catch (Exception ex) when (ex is ApiException or IOException)
        {
            return new FileAnalysis(file.RelativePath, null, ex.Message);
        }
    }
}

using DepVault.Cli.ApiClient.Api.Projects.Item.Analyses;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Output;
using Microsoft.Kiota.Abstractions;

namespace DepVault.Cli.Services;

/// <summary>Result of analyzing one dependency file.</summary>
public sealed record AnalysisResult(double HealthScore, List<AnalysesPostResponse_dependencies> Dependencies)
{
    public IEnumerable<string> VulnerabilitySeverities =>
        Dependencies.SelectMany(d => d.Vulnerabilities ?? []).Select(v => v.Severity ?? "");

    public AnalysisJson ToJson(string file) => new(file, HealthScore, Dependencies
        .Select(d => new DependencyJson(d.Name ?? "", d.CurrentVersion ?? "", d.LatestVersion, d.Status, d.License,
            d.Vulnerabilities?.Count ?? 0))
        .ToList());
}

/// <summary>One dependency file's analysis, or why it couldn't be analyzed.</summary>
public sealed record FileAnalysis(string File, AnalysisResult? Result, string? Error);

/// <summary>Uploads a dependency file for server-side analysis (shared by <c>analyze</c> and <c>scan</c>).</summary>
public sealed class AnalysisClient(IApiClientFactory clientFactory)
{
    /// <summary>
    /// Analyzes one file, turning per-file failures into <see cref="FileAnalysis.Error"/>. Auth and plan-limit
    /// errors still throw so they reach their dedicated panels instead of a "failed" row.
    /// </summary>
    public async Task<FileAnalysis> TryAnalyzeAsync(
        string projectId, DiscoveredFile file, AnalysesPostRequestBody_ecosystem? ecosystem, CancellationToken ct)
    {
        if ((ecosystem ?? EcosystemResolver.Resolve(file.FileName)) is not { } resolved)
        {
            return new FileAnalysis(file.RelativePath, null, "unknown ecosystem; pass --ecosystem");
        }

        try
        {
            return new FileAnalysis(file.RelativePath, await AnalyzeFileAsync(projectId, file, resolved, ct), null);
        }
        catch (Exception ex) when (ex is IOException
                                   || (ex is ApiException && !ApiErrors.IsAuth(ex) && !ApiErrors.IsPlanLimit(ex)))
        {
            return new FileAnalysis(file.RelativePath, null, ex.Message);
        }
    }

    private async Task<AnalysisResult> AnalyzeFileAsync(
        string projectId, DiscoveredFile file, AnalysesPostRequestBody_ecosystem ecosystem, CancellationToken ct)
    {
        var response = await clientFactory.Create().Api.Projects[projectId].Analyses.PostAsync(
            new AnalysesPostRequestBody
            {
                FileName = file.FileName,
                FilePath = file.RelativePath,
                Content = await File.ReadAllTextAsync(file.FullPath, ct),
                Ecosystem = ecosystem
            }, cancellationToken: ct) ?? throw new CliException("Analysis returned no results.");

        return new AnalysisResult(response.HealthScore ?? 0, response.Dependencies ?? []);
    }
}

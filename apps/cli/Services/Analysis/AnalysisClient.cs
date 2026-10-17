using DepVault.Cli.ApiClient.Api.Projects.Item.Analyses;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Output;

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

/// <summary>Uploads a dependency file for server-side analysis (shared by <c>analyze</c> and <c>scan</c>).</summary>
public sealed class AnalysisClient(IApiClientFactory clientFactory)
{
    public async Task<AnalysisResult> AnalyzeFileAsync(
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

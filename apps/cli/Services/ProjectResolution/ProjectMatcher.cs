using DepVault.Cli.ApiClient.Api.Projects;
using DepVault.Cli.Common;

namespace DepVault.Cli.Services.ProjectResolution;

/// <summary>Matches the current repo against the caller's project list (repo URL, then name).</summary>
internal static class ProjectMatcher
{
    /// <summary>Matches by normalized repo URL (when both are non-empty), then case-insensitive name; null if none.</summary>
    public static ProjectsGetResponse_items? Match(
        IReadOnlyList<ProjectsGetResponse_items> items, string? repoUrl, string? repoName)
    {
        var normalizedUrl = GitUrl.Normalize(repoUrl);
        if (normalizedUrl is not null)
        {
            var byUrl = items.FirstOrDefault(p =>
                GitUrl.Normalize(p.RepositoryUrl) is { } u &&
                string.Equals(u, normalizedUrl, StringComparison.OrdinalIgnoreCase));
            if (byUrl is not null)
            {
                return byUrl;
            }
        }

        if (!string.IsNullOrEmpty(repoName))
        {
            return items.FirstOrDefault(p =>
                string.Equals(p.Name, repoName, StringComparison.OrdinalIgnoreCase));
        }

        return null;
    }
}

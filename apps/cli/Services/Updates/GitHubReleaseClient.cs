using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DepVault.Cli.Services;

/// <summary>Reads CLI releases from GitHub.</summary>
public interface IGitHubReleaseClient
{
    /// <summary>The latest CLI version (e.g. "1.2.0"), or null when GitHub can't be reached.</summary>
    Task<string?> GetLatestCliVersionAsync(CancellationToken ct = default);

    /// <summary>Download URL of a release asset, e.g. an archive or <c>SHA256SUMS</c>.</summary>
    string AssetUrl(string version, string assetName);
}

public sealed class GitHubReleaseClient : IGitHubReleaseClient
{
    private static readonly HttpClient Http = new()
    {
        DefaultRequestHeaders =
        {
            { "User-Agent", "depvault-cli" },
            { "Accept", "application/vnd.github+json" }
        },
        Timeout = TimeSpan.FromSeconds(5)
    };

    /// <summary>Highest CLI-tagged version among the last 20 releases, by version rather than release order.</summary>
    public async Task<string?> GetLatestCliVersionAsync(CancellationToken ct = default)
    {
        try
        {
            var url = $"https://api.github.com/repos/{Constants.GitHubRepo}/releases?per_page=20";
            var releases = await Http.GetFromJsonAsync(url, GitHubJsonContext.Default.GitHubReleaseArray, ct) ?? [];

            return releases
                .Select(r => r.TagName)
                .Where(tag => tag?.StartsWith(Constants.GitHubReleaseTagPrefix, StringComparison.Ordinal) == true)
                .Select(tag => Version.TryParse(tag![Constants.GitHubReleaseTagPrefix.Length..], out var v) ? v : null)
                .Max()
                ?.ToString(3);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            // Offline or rate-limited: no answer this time.
            return null;
        }
    }

    public string AssetUrl(string version, string assetName) =>
        $"https://github.com/{Constants.GitHubRepo}/releases/download/{Constants.GitHubReleaseTagPrefix}{version}/{assetName}";
}

internal sealed class GitHubRelease
{
    [JsonPropertyName("tag_name")]
    public string? TagName { get; set; }
}

[JsonSerializable(typeof(GitHubRelease[]))]
internal partial class GitHubJsonContext : JsonSerializerContext;

using System.Text.Json;
using System.Text.Json.Serialization;
using DepVault.Cli.Output;

namespace DepVault.Cli.Services;

/// <summary>Checks whether a newer CLI version is available, caching the answer for a day.</summary>
public interface IVersionChecker
{
    /// <summary>The latest released version (e.g. "1.2.0"), or null when it can't be fetched.</summary>
    Task<string?> GetLatestVersionAsync(CancellationToken ct = default);

    string GetCurrentVersion();

    /// <summary>Prints a one-line notice on stderr when a newer version exists.</summary>
    Task PrintUpdateHintAsync(CancellationToken ct = default);
}

public sealed class VersionChecker(IGitHubReleaseClient gitHub, Ui ui) : IVersionChecker
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);

    public string GetCurrentVersion() => typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";

    public async Task<string?> GetLatestVersionAsync(CancellationToken ct = default)
    {
        var version = await gitHub.GetLatestCliVersionAsync(ct);
        if (version is not null)
        {
            SaveCache(version);
        }

        return version;
    }

    public async Task PrintUpdateHintAsync(CancellationToken ct = default)
    {
        var latest = ReadCache() ?? await GetLatestVersionAsync(ct);
        if (latest is not null && IsNewer(latest, GetCurrentVersion()))
        {
            ui.Warn($"DepVault CLI v{latest} is available (current: v{GetCurrentVersion()}). Run 'depvault update'.");
        }
    }

    internal static bool IsNewer(string latest, string current) =>
        Version.TryParse(latest, out var latestVersion)
        && Version.TryParse(current, out var currentVersion)
        && latestVersion > currentVersion;

    private static string? ReadCache()
    {
        try
        {
            var cache = File.Exists(Constants.VersionCheckPath)
                ? JsonSerializer.Deserialize(File.ReadAllText(Constants.VersionCheckPath), VersionCheckJsonContext.Default.VersionCheckCache)
                : null;
            return cache is not null && DateTime.UtcNow - cache.CheckedAt <= CheckInterval ? cache.LatestVersion : null;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static void SaveCache(string version)
    {
        try
        {
            Directory.CreateDirectory(Constants.ConfigDir);
            File.WriteAllText(Constants.VersionCheckPath, JsonSerializer.Serialize(
                new VersionCheckCache { LatestVersion = version, CheckedAt = DateTime.UtcNow },
                VersionCheckJsonContext.Default.VersionCheckCache));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // The cache only saves a request next time.
        }
    }
}

internal sealed class VersionCheckCache
{
    [JsonPropertyName("latestVersion")]
    public string LatestVersion { get; set; } = "";

    [JsonPropertyName("checkedAt")]
    public DateTime CheckedAt { get; set; }
}

[JsonSerializable(typeof(VersionCheckCache))]
[JsonSourceGenerationOptions(WriteIndented = true)]
internal partial class VersionCheckJsonContext : JsonSerializerContext;

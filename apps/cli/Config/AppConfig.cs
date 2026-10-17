using System.Text.Json;
using System.Text.Json.Serialization;
using DepVault.Cli.Common;

namespace DepVault.Cli.Config;

public sealed class AppConfigData
{
    [JsonPropertyName("server")]
#if DEBUG
    public string Server { get; set; } = "http://localhost:4000";
#else
    public string Server { get; set; } = "https://depvault.com";
#endif
}

public interface IConfigService
{
    AppConfigData Load();

    /// <summary>Validates and saves the API server URL.</summary>
    void SetServer(string url);
}

/// <summary>Per-machine settings in <c>~/.depvault/config.json</c>.</summary>
public sealed class ConfigService : IConfigService
{
    private static readonly string ConfigPath = Path.Combine(Constants.ConfigDir, "config.json");

    private AppConfigData? cached;

    public AppConfigData Load()
    {
        if (cached is not null)
        {
            return cached;
        }

        cached = File.Exists(ConfigPath)
            ? JsonSerializer.Deserialize(File.ReadAllText(ConfigPath), ConfigJsonContext.Default.AppConfigData)
            : null;
        return cached ??= new AppConfigData();
    }

    public void SetServer(string url)
    {
        var config = Load();
        config.Server = NormalizeServer(url);
        Directory.CreateDirectory(Constants.ConfigDir);
        File.WriteAllText(ConfigPath, JsonSerializer.Serialize(config, ConfigJsonContext.Default.AppConfigData));
    }

    /// <summary>An absolute http(s) URL without a trailing slash; throws a usage error otherwise.</summary>
    public static string NormalizeServer(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
        {
            throw new CliException($"'{url}' is not an http(s) URL.", ExitCodes.Usage);
        }

        return url.TrimEnd('/');
    }
}

[JsonSerializable(typeof(AppConfigData))]
[JsonSourceGenerationOptions(WriteIndented = true)]
internal partial class ConfigJsonContext : JsonSerializerContext;

namespace DepVault.Cli;

internal static class Constants
{
    public const string CiTokenEnvVar = "DEPVAULT_TOKEN";
    public const string GitHubRepo = "suxrobGM/depvault";
    public const string GitHubReleaseTagPrefix = "cli/v";

    /// <summary>Per-user CLI state; <c>DEPVAULT_HOME</c> overrides it (separate profiles, tests).</summary>
    public static readonly string ConfigDir = Environment.GetEnvironmentVariable("DEPVAULT_HOME") is { Length: > 0 } home
        ? Path.GetFullPath(home)
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".depvault");

    public static readonly string VersionCheckPath = Path.Combine(ConfigDir, "version-check.json");
}

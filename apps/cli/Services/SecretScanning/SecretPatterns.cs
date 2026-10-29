using System.Text.RegularExpressions;

namespace DepVault.Cli.Services.SecretScanning;

internal record PatternDefinition(string Name, Severity Severity, Regex Regex);

/// <summary>Regex patterns for detecting hardcoded secrets, split by confidence level.</summary>
internal static partial class SecretPatterns
{
    /// <summary>High-confidence patterns safe to use on all file types including source code.</summary>
    public static readonly PatternDefinition[] HighConfidence =
    [
        new("AWS Access Key", Severity.Critical, AwsAccessKeyRegex()),
        new("Private Key", Severity.Critical, PrivateKeyRegex()),
        new("GitHub Token", Severity.Critical, GitHubTokenRegex()),
        new("Slack Token", Severity.High, SlackTokenRegex()),
        new("JWT Token", Severity.Medium, JwtTokenRegex())
    ];

    /// <summary>All patterns, used only for config files (.env, .yml, .json, Dockerfile).</summary>
    public static readonly PatternDefinition[] All =
    [
        .. HighConfidence,
        new("AWS Secret Key", Severity.Critical, AwsSecretKeyRegex()),
        new("Generic API Key", Severity.High, GenericApiKeyRegex()),
        new("Generic Secret/Password", Severity.High, GenericSecretRegex()),
        new("Connection String", Severity.High, ConnectionStringRegex()),
        new("Database URI", Severity.Medium, DatabaseUriRegex())
    ];

    [GeneratedRegex("AKIA[0-9A-Z]{16}", RegexOptions.Compiled)]
    private static partial Regex AwsAccessKeyRegex();

    [GeneratedRegex(@"-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP)\s+PRIVATE\s+KEY-----", RegexOptions.Compiled)]
    private static partial Regex PrivateKeyRegex();

    [GeneratedRegex("gh[ps]_[A-Za-z0-9_]{36,}", RegexOptions.Compiled)]
    private static partial Regex GitHubTokenRegex();

    [GeneratedRegex(@"xox[bpors]-[A-Za-z0-9\-]+", RegexOptions.Compiled)]
    private static partial Regex SlackTokenRegex();

    [GeneratedRegex(@"eyJ[A-Za-z0-9\-_]{10,}\.eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}", RegexOptions.Compiled)]
    private static partial Regex JwtTokenRegex();

    [GeneratedRegex(@"aws_secret_access_key\s*[=:]\s*[A-Za-z0-9/+=]{20,}",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex AwsSecretKeyRegex();

    [GeneratedRegex(@"(?:api[_\-]?key|apikey)\s*[=:]\s*['""]?[A-Za-z0-9\-_]{16,}",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex GenericApiKeyRegex();

    [GeneratedRegex("""(?:secret|password|passwd|pwd)\s*=\s*['"]?[^\s'"\$\{<][^\s'"]{7,}""",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex GenericSecretRegex();

    [GeneratedRegex(@"(?:Server|Data Source)=.*(?:Password|Pwd)=[^\s;]{4,}",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex ConnectionStringRegex();

    [GeneratedRegex(@"(?:mongodb|postgresql|mysql|redis|amqp):\/\/[^@\s:]+:[^@\s]+@(?!localhost)[^\s]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase)]
    private static partial Regex DatabaseUriRegex();
}

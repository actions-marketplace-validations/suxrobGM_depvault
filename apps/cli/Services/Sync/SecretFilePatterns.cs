namespace DepVault.Cli.Services.Sync;

/// <summary>
/// Which file names look like env/secret files worth offering for tracking. Discovery only offers
/// candidates git ignores (see <see cref="LocalFileScanner"/>), so committed templates such as
/// <c>.env.example</c> or a base <c>appsettings.json</c> never show up; anything else can be tracked
/// explicitly with <c>depvault push &lt;path&gt;</c>.
/// </summary>
internal static class SecretFilePatterns
{
    private static readonly HashSet<string> ExactNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ".env", ".envrc", ".dev.vars", ".npmrc", ".pypirc", ".netrc",
        "secrets.json", "secrets.yaml", "secrets.yml", "credentials.json",
        "google-services.json", "GoogleService-Info.plist",
        "local.properties", "key.properties", "keystore.properties"
    };

    private static readonly HashSet<string> Extensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pem", ".key", ".p8", ".p12", ".pfx", ".jks", ".keystore", ".tfvars"
    };

    private static readonly string[] NameFragments =
    [
        "serviceaccount", "service-account", "service_account", "firebase-adminsdk"
    ];

    /// <summary>Template/backup suffixes that never hold the real values.</summary>
    private static readonly string[] TemplateSuffixes =
        [".example", ".sample", ".template", ".dist", ".defaults", ".bak", ".orig"];

    /// <summary>
    /// Folders never searched: VCS internals, dependency caches and build output. Deliberately narrower
    /// than dependency scanning's exclusions — <c>packages/</c>, <c>deploy/</c>, <c>generated/</c> etc. can hold real env files.
    /// </summary>
    public static readonly IReadOnlySet<string> SkippedDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".hg", ".svn", "node_modules", ".yarn", ".pnpm-store", "bower_components",
        "__pycache__", ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache",
        "bin", "obj", ".nuget", "target", "vendor", ".gradle", "Pods", "DerivedData",
        "dist", ".next", ".nuxt", ".angular", ".turbo", ".nx", ".parcel-cache", ".cache", ".vite",
        ".svelte-kit", ".output", ".vs", ".idea", "coverage", ".terraform"
    };

    public static bool IsCandidate(string fileName)
    {
        if (TemplateSuffixes.Any(s => fileName.EndsWith(s, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        if (ExactNames.Contains(fileName) || Extensions.Contains(Path.GetExtension(fileName)))
        {
            return true;
        }

        // .env.local, .env.production, backend.env, backend.env.staging, ...
        if (fileName.StartsWith(".env.", StringComparison.OrdinalIgnoreCase)
            || fileName.EndsWith(".env", StringComparison.OrdinalIgnoreCase)
            || fileName.Contains(".env.", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (fileName.StartsWith("appsettings", StringComparison.OrdinalIgnoreCase)
            && fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
               && NameFragments.Any(f => fileName.Contains(f, StringComparison.OrdinalIgnoreCase));
    }
}

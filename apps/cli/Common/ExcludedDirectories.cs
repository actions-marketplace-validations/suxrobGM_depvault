namespace DepVault.Cli.Common;

/// <summary>Shared set of directory names to skip during file scanning.</summary>
internal static class ExcludedDirectories
{
    public static readonly IReadOnlySet<string> Names = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".hg", ".svn",

        "node_modules", ".yarn", ".pnpm-store", "bower_components",

        "__pycache__", ".venv", "venv", ".tox", ".mypy_cache",
        ".pytest_cache", ".ruff_cache", "__pypackages__", ".eggs",

        "bin", "obj", ".nuget", "packages", "TestResults", "publish", "artifacts",

        "target",

        "vendor",

        ".gradle", ".mvn",

        ".bundle",

        "dist", "build", "out", ".output",

        ".next", ".angular", ".turbo", ".nx", ".parcel-cache",
        ".cache", ".vite", ".svelte-kit",

        ".vs", ".idea", ".vscode",

        "coverage", "generated", "logs", "temp", "tmp"
    };

    /// <summary>Fixture/sample-data directories, excluded on top of <see cref="Names"/> when scanning for secrets.</summary>
    public static readonly IReadOnlySet<string> FixtureDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "fixtures", "testdata", "tests", "__tests__", "docs"
    };
}

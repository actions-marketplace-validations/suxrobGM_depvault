using System.Diagnostics.CodeAnalysis;

namespace DepVault.Cli.Common;

/// <summary>Converts between OS paths and canonical repo-relative paths (forward slashes, no <c>./</c>).</summary>
internal static class RepoPath
{
    public static string ToRelative(string root, string fullPath)
    {
        return Path.GetRelativePath(root, fullPath).Replace('\\', '/');
    }

    /// <summary>Repo-relative path of a CLI path argument; a usage error when it points outside <paramref name="root"/>.</summary>
    public static string FromArgument(string root, string fullPath, string arg)
    {
        var relative = ToRelative(root, fullPath);
        return IsInside(relative)
            ? relative
            : throw new CliException($"{arg} is outside the linked folder {root}.", ExitCodes.Usage);
    }

    /// <summary>True when a repo-relative path stays inside the root (no <c>..</c>, not rooted or on another drive).</summary>
    public static bool IsInside(string relativePath)
    {
        return relativePath.Length > 0
               && !Path.IsPathRooted(relativePath)
               && !relativePath.Split('/').Contains("..");
    }

    /// <summary>
    /// Resolves a server-supplied repo-relative path under <paramref name="root"/>, refusing anything
    /// that would escape it.
    /// </summary>
    public static string ToFull(string root, string relativePath)
    {
        return TryToFull(root, relativePath, out var fullPath)
            ? fullPath
            : throw new InvalidOperationException($"Refusing to write '{relativePath}' outside '{root}'.");
    }

    /// <summary>Non-throwing <see cref="ToFull"/>: false when the path would escape <paramref name="root"/>.</summary>
    public static bool TryToFull(string root, string relativePath, [NotNullWhen(true)] out string? fullPath)
    {
        fullPath = null;
        if (!IsInside(relativePath))
        {
            return false;
        }

        var baseDir = Path.GetFullPath(root);
        var resolved = Path.GetFullPath(Path.Combine(baseDir, relativePath));
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        var basePrefix = baseDir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;

        if (!resolved.StartsWith(basePrefix, comparison))
        {
            return false;
        }

        fullPath = resolved;
        return true;
    }
}

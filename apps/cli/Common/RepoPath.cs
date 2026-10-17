namespace DepVault.Cli.Common;

/// <summary>Converts between OS paths and canonical repo-relative paths (forward slashes, no <c>./</c>).</summary>
internal static class RepoPath
{
    public static string ToRelative(string root, string fullPath)
    {
        return Path.GetRelativePath(root, fullPath).Replace('\\', '/');
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
        var baseDir = Path.GetFullPath(root);
        var resolved = Path.GetFullPath(Path.Combine(baseDir, relativePath));
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        var basePrefix = baseDir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;

        if (!RepoPath.IsInside(relativePath) || !resolved.StartsWith(basePrefix, comparison))
        {
            throw new InvalidOperationException($"Refusing to write '{relativePath}' outside '{root}'.");
        }

        return resolved;
    }
}

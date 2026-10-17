using DepVault.Cli.Common;

namespace DepVault.Cli.Services.Sync;

/// <summary>
/// Path arguments resolved against the linked root: existing files to always consider, globs to filter by,
/// and the literal paths named, which count as explicit intent for deletions.
/// </summary>
public sealed record PathFilter(IReadOnlyList<string> ExplicitFiles, IReadOnlyList<string> Globs, IReadOnlySet<string> Literals)
{
    public bool IsEmpty => Globs.Count == 0;

    public bool NamesExactly(SyncEntry entry) => Literals.Contains(entry.Path);

    public bool Matches(string path) => IsEmpty || PathGlob.MatchesAny(Globs, path);

    /// <summary>Renames match by either their new or previous path.</summary>
    public bool Matches(SyncEntry entry) =>
        Matches(entry.Path) || (entry.FromPath is not null && Matches(entry.FromPath));

    /// <summary>
    /// Existing files become anchored explicit paths, folders become <c>folder/**</c>, wildcard patterns stay
    /// gitignore-style globs, and other literals (e.g. deleted files) stay anchored. Paths resolve against
    /// <paramref name="cwd"/>; anything outside <paramref name="root"/> is a usage error.
    /// </summary>
    public static PathFilter Resolve(string root, string cwd, IEnumerable<string> args)
    {
        var explicitFiles = new List<string>();
        var globs = new List<string>();
        var literals = new HashSet<string>(StringComparer.Ordinal);

        foreach (var arg in args)
        {
            if (arg.IndexOfAny(['*', '?']) >= 0)
            {
                globs.Add(arg.Replace('\\', '/'));
                continue;
            }

            var full = Path.GetFullPath(arg, cwd);
            var relative = RepoPath.ToRelative(root, full);
            if (relative == ".")
            {
                globs.Add("**");
                continue;
            }

            if (!RepoPath.IsInside(relative))
            {
                throw new CliException($"{arg} is outside the linked folder {root}.", ExitCodes.Usage);
            }

            if (Directory.Exists(full))
            {
                globs.Add($"/{relative}/**");
                continue;
            }

            if (File.Exists(full))
            {
                explicitFiles.Add(relative);
            }

            literals.Add(relative);
            globs.Add("/" + relative);
        }

        return new PathFilter(explicitFiles, globs, literals);
    }
}

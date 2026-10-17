using DepVault.Cli.Common;

namespace DepVault.Cli.Services.Sync;

/// <summary>Finds untracked-but-trackable files: secret-looking names that git ignores.</summary>
public interface ILocalFileScanner
{
    /// <summary>Repo-relative (forward-slash) paths of candidate files under <paramref name="root"/>.</summary>
    IReadOnlyList<string> FindCandidates(string root, IReadOnlyList<string> ignoreGlobs);
}

public sealed class LocalFileScanner(IGitCheckIgnore gitCheckIgnore) : ILocalFileScanner
{
    /// <summary>Server-side per-file cap; bigger files are never secrets worth syncing.</summary>
    private const long MaxFileSize = 10 * 1024 * 1024;

    public IReadOnlyList<string> FindCandidates(string root, IReadOnlyList<string> ignoreGlobs)
    {
        var found = new List<string>();
        Walk(new DirectoryInfo(root), root, found);

        var candidates = found
            .Where(path => !PathGlob.MatchesAny(ignoreGlobs, path))
            .ToList();

        return KeepGitIgnored(root, candidates).Order(StringComparer.Ordinal).ToList();
    }

    private static void Walk(DirectoryInfo dir, string root, List<string> found)
    {
        IEnumerable<FileSystemInfo> entries;
        try
        {
            entries = dir.EnumerateFileSystemInfos();
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            return;
        }

        foreach (var entry in entries)
        {
            // Never follow symlinked folders: they can loop or leave the repo.
            if (entry.Attributes.HasFlag(FileAttributes.ReparsePoint))
            {
                continue;
            }

            if (entry is DirectoryInfo sub)
            {
                if (!SecretFilePatterns.SkippedDirectories.Contains(sub.Name))
                {
                    Walk(sub, root, found);
                }

                continue;
            }

            if (entry is FileInfo file && SecretFilePatterns.IsCandidate(file.Name) && file.Length <= MaxFileSize)
            {
                found.Add(RepoPath.ToRelative(root, file.FullName));
            }
        }
    }

    /// <summary>
    /// Keeps only files git ignores (committed files are already safe in git). Paths are checked
    /// against their nearest repository so submodules apply their own .gitignore; files outside any
    /// git repository are all kept.
    /// </summary>
    private IEnumerable<string> KeepGitIgnored(string root, List<string> paths)
    {
        var rootFull = Path.GetFullPath(root);
        var gitRootByDir = new Dictionary<string, string?>(StringComparer.Ordinal);
        var byRepo = paths.GroupBy(p =>
        {
            var dir = Path.GetDirectoryName(Path.GetFullPath(Path.Combine(root, p)))!;
            if (!gitRootByDir.TryGetValue(dir, out var gitRoot))
            {
                gitRoot = FindGitRoot(rootFull, dir);
                gitRootByDir[dir] = gitRoot;
            }

            return gitRoot;
        });

        foreach (var group in byRepo)
        {
            var repoRoot = group.Key;
            Dictionary<string, string>? relativeToRepo = null;
            GitCheckIgnoreResult? check = null;
            if (repoRoot is not null)
            {
                relativeToRepo = group.ToDictionary(p => RepoPath.ToRelative(repoRoot, Path.Combine(root, p)), p => p);
                check = gitCheckIgnore.Run(repoRoot, relativeToRepo.Keys, StringComparer.Ordinal);
            }

            // Outside any repository, or git unavailable: offer everything rather than nothing.
            if (check is not { InRepository: true })
            {
                foreach (var path in group)
                {
                    yield return path;
                }

                continue;
            }

            foreach (var (repoRelative, path) in relativeToRepo!)
            {
                if (check.Ignored.Contains(repoRelative))
                {
                    yield return path;
                }
            }
        }
    }

    private static string? FindGitRoot(string rootFull, string startDir)
    {
        for (var dir = startDir; dir is not null; dir = Path.GetDirectoryName(dir))
        {
            // `.git` is a file in submodules and worktrees.
            var gitPath = Path.Combine(dir, ".git");
            if (Directory.Exists(gitPath) || File.Exists(gitPath))
            {
                return dir;
            }

            if (string.Equals(dir, rootFull, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }
        }

        return RepositoryLocator.FindGitRootFrom(rootFull);
    }
}

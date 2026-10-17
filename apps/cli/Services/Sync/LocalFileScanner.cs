using System.Diagnostics;
using DepVault.Cli.Common;

namespace DepVault.Cli.Services.Sync;

/// <summary>Finds untracked-but-trackable files: secret-looking names that git ignores.</summary>
public interface ILocalFileScanner
{
    /// <summary>Repo-relative (forward-slash) paths of candidate files under <paramref name="root"/>.</summary>
    IReadOnlyList<string> FindCandidates(string root, IReadOnlyList<string> ignoreGlobs);
}

public sealed class LocalFileScanner : ILocalFileScanner
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
    private static IEnumerable<string> KeepGitIgnored(string root, List<string> paths)
    {
        var byRepo = paths.GroupBy(p => FindGitRoot(root, p));
        foreach (var group in byRepo)
        {
            if (group.Key is null)
            {
                foreach (var path in group)
                {
                    yield return path;
                }

                continue;
            }

            var repoRoot = group.Key;
            var relativeToRepo = group.ToDictionary(
                p => RepoPath.ToRelative(repoRoot, Path.Combine(root, p)), p => p);
            var ignored = CheckIgnore(repoRoot, relativeToRepo.Keys);
            if (ignored is null)
            {
                // git unavailable: offer everything rather than nothing.
                foreach (var path in group)
                {
                    yield return path;
                }

                continue;
            }

            foreach (var (repoRelative, path) in relativeToRepo)
            {
                if (ignored.Contains(repoRelative))
                {
                    yield return path;
                }
            }
        }
    }

    private static string? FindGitRoot(string root, string relativePath)
    {
        var rootFull = Path.GetFullPath(root);
        var dir = Path.GetDirectoryName(Path.GetFullPath(Path.Combine(root, relativePath)));
        while (dir is not null)
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

            dir = Path.GetDirectoryName(dir);
        }

        return RepositoryLocator.FindGitRootFrom(rootFull);
    }

    /// <summary>Runs <c>git check-ignore --stdin</c>; null when git can't run in this folder.</summary>
    private static HashSet<string>? CheckIgnore(string repoRoot, IEnumerable<string> paths)
    {
        try
        {
            var psi = new ProcessStartInfo("git", "check-ignore --stdin")
            {
                WorkingDirectory = repoRoot,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process is null)
            {
                return null;
            }

            var stdout = process.StandardOutput.ReadToEndAsync();
            process.StandardInput.Write(string.Join('\n', paths));
            process.StandardInput.Close();
            var output = stdout.GetAwaiter().GetResult();
            process.WaitForExit(10_000);

            // Exit 0 = some ignored, 1 = none ignored, anything else (128) = not a usable repo.
            if (process.ExitCode is not (0 or 1))
            {
                return null;
            }

            return output.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim().Replace('\\', '/'))
                .ToHashSet(StringComparer.Ordinal);
        }
        catch
        {
            return null;
        }
    }
}

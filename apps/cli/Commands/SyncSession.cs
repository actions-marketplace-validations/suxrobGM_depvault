using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Crypto;
using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>
/// Path arguments resolved against the linked root: existing files to always consider, globs to filter by,
/// and the literal (wildcard-free) paths named, which count as explicit intent for deletions.
/// </summary>
public sealed record PathFilter(IReadOnlyList<string> ExplicitFiles, IReadOnlyList<string> Globs, IReadOnlySet<string> Literals)
{
    public bool IsEmpty => Globs.Count == 0;

    public bool NamesExactly(SyncEntry entry) => Literals.Contains(entry.Path);

    public bool Matches(string path) => IsEmpty || PathGlob.MatchesAny(Globs, path);

    /// <summary>Renames match by either their new or previous path.</summary>
    public bool Matches(SyncEntry entry) =>
        Matches(entry.Path) || (entry.FromPath is not null && Matches(entry.FromPath));
}

/// <summary>Shared setup for status/push/pull/purge: auth, project link, vault key and a fresh sync plan.</summary>
public sealed class SyncSession(
    AuthContext ctx,
    ProjectLinker projectLinker,
    DekService dekService,
    SyncService syncService)
{
    public static Argument<string[]> PathsArgument(string description) => new("paths")
    {
        Arity = ArgumentArity.ZeroOrMore,
        Description = description
    };

    public static Option<string?> ProjectOption() => new("--project")
    {
        Description = "Project ID (defaults to the one in .depvault.json)"
    };

    /// <summary>
    /// Returns the plan plus its entries matching the path args, or null after printing why it couldn't be
    /// built (exit code set).
    /// </summary>
    public async Task<(SyncSnapshot Snapshot, PathFilter Filter, List<SyncEntry> Entries)?> OpenAsync(
        string? explicitProjectId, string[] paths, CancellationToken ct)
    {
        if (!ctx.RequireAuth())
        {
            return Fail();
        }

        if (ctx.IsCiMode())
        {
            ctx.Output.PrintError("CI tokens are read-only: use 'depvault pull' in pipelines.");
            return Fail();
        }

        var link = await projectLinker.ResolveAsync(explicitProjectId, ct);
        if (link is null)
        {
            return Fail();
        }

        var filter = ResolvePaths(link.Root, paths);
        if (filter is null)
        {
            return Fail();
        }

        var dek = await dekService.CollectPasswordAndResolveAsync(link.ProjectId, ct);
        if (dek is null)
        {
            return Fail();
        }

        var snapshot = await AnsiConsole.Status()
            .Spinner(Spinner.Known.Dots)
            .StartAsync("Comparing with DepVault...", async _ =>
                await syncService.LoadAsync(link, dek, filter.ExplicitFiles, ct));

        return (snapshot, filter, snapshot.Entries.Where(filter.Matches).ToList());
    }

    /// <summary>
    /// Existing files (relative to the current folder) become explicit, always-considered paths; folders
    /// become <c>folder/**</c>; anything else is a glob relative to the linked root.
    /// </summary>
    public PathFilter? ResolvePaths(string root, string[] paths)
    {
        var explicitFiles = new List<string>();
        var globs = new List<string>();
        var literals = new HashSet<string>(StringComparer.Ordinal);

        foreach (var arg in paths)
        {
            var full = Path.GetFullPath(arg);
            var isFile = File.Exists(full);
            if (isFile || Directory.Exists(full))
            {
                var relative = RepoPath.ToRelative(root, full);
                if (!RepoPath.IsInside(relative) && relative != ".")
                {
                    ctx.Output.PrintError($"{arg} is outside the linked folder {root}.");
                    return null;
                }

                // Anchored, so "depvault push .env" means the root .env, not every .env.
                if (isFile)
                {
                    explicitFiles.Add(relative);
                    literals.Add(relative);
                    globs.Add("/" + relative);
                }
                else
                {
                    globs.Add(relative == "." ? "**" : $"/{relative}/**");
                }

                continue;
            }

            // A literal path that no longer exists (e.g. a deleted file) stays anchored like an existing one;
            // only patterns with wildcards keep .gitignore-style matching at any depth.
            if (arg.IndexOfAny(['*', '?']) >= 0)
            {
                globs.Add(arg.Replace('\\', '/'));
            }
            else
            {
                var relative = RepoPath.ToRelative(root, full);
                literals.Add(relative);
                globs.Add("/" + relative);
            }
        }

        return new PathFilter(explicitFiles, globs, literals);
    }

    private static (SyncSnapshot, PathFilter, List<SyncEntry>)? Fail()
    {
        Environment.ExitCode = 1;
        return null;
    }
}

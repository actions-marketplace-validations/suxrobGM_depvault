using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Output;
using DepVault.Cli.Services.Sync;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>
/// Git-like file sync: <c>init</c> links a folder, <c>status</c> shows drift, <c>push</c>/<c>pull</c> move
/// changes, <c>untrack</c> stops syncing a file. Change detection is three-way (local / server / last sync).
/// </summary>
public sealed class SyncCommands(
    AuthContext ctx,
    SyncSession session,
    SyncService syncService,
    ProjectLinker projectLinker,
    IProjectLinkStore linkStore,
    CiPuller ciPuller,
    ConsoleRenderer renderer)
{
    public Command CreateInitCommand()
    {
        var projectOpt = new Option<string?>("--project") { Description = "Link to this project ID without prompting" };
        var cmd = new Command("init", "Link this folder to a DepVault project (writes .depvault.json)") { projectOpt };

        cmd.SetAction(async (parseResult, ct) =>
        {
            if (!ctx.RequireAuth())
            {
                Environment.ExitCode = 1;
                return;
            }

            var existing = linkStore.Find();
            if (existing is not null && parseResult.GetValue(projectOpt) is null)
            {
                ctx.Output.PrintSuccess(
                    $"Already linked to '{existing.DisplayName}' ({existing.Root}).");
                return;
            }

            if (await projectLinker.LinkAsync(parseResult.GetValue(projectOpt), ct) is null)
            {
                Environment.ExitCode = 1;
                return;
            }

            AnsiConsole.MarkupLine("[grey]Next:[/] [cyan1]depvault status[/] [grey]to see which files will sync, then[/] [cyan1]depvault push[/][grey].[/]");
        });

        return cmd;
    }

    public Command CreateStatusCommand()
    {
        var pathsArg = SyncSession.PathsArgument("Only show these files, folders or globs");
        var projectOpt = SyncSession.ProjectOption();
        var cmd = new Command("status", "Show which files differ between this folder and DepVault") { pathsArg, projectOpt };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var opened = await session.OpenAsync(parseResult.GetValue(projectOpt), parseResult.GetValue(pathsArg)!, ct);
            if (opened is null)
            {
                return;
            }

            var (snapshot, _, entries) = opened.Value;
            PrintHeader(snapshot.Link);

            if (entries.All(e => e.Kind == SyncKind.InSync))
            {
                ctx.Output.PrintSuccess(entries.Count == 0
                    ? "No files tracked yet and no new secret files found. Track one with 'depvault push <path>'."
                    : $"All {entries.Count} file(s) are in sync.");
                return;
            }

            renderer.PrintSyncEntries(entries);
            renderer.PrintSyncSummary(entries);
            PrintHints(entries);
        });

        return cmd;
    }

    public Command CreatePushCommand()
    {
        var pathsArg = SyncSession.PathsArgument("Only push these files, folders or globs (any file path can be tracked this way)");
        var projectOpt = SyncSession.ProjectOption();
        var messageOpt = new Option<string?>("--message", "-m") { Description = "Note stored with the new versions" };
        var yesOpt = new Option<bool>("--yes", "-y")
        { Description = "Don't prompt; push all changes except deletions of files not named exactly" };
        var forceOpt = new Option<bool>("--force") { Description = "Overwrite conflicting server changes with local files" };
        var cmd = new Command("push", "Upload local changes (new, modified, renamed and deleted files)")
        {
            pathsArg, projectOpt, messageOpt, yesOpt, forceOpt
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var opened = await session.OpenAsync(parseResult.GetValue(projectOpt), parseResult.GetValue(pathsArg)!, ct);
            if (opened is null)
            {
                return;
            }

            var (snapshot, filter, entries) = opened.Value;
            var force = parseResult.GetValue(forceOpt);
            var conflicts = entries.Where(e => e.Kind == SyncKind.Conflict).ToList();

            if (conflicts.Count > 0 && !force)
            {
                renderer.PrintSyncEntries(conflicts);
                ctx.Output.PrintError(
                    "Nothing pushed: resolve conflicts first. 'depvault pull --force <path>' takes the server copy, 'depvault push --force <path>' keeps yours.");
                Environment.ExitCode = 1;
                return;
            }

            var changes = entries.Where(e => e.IsLocalChange || e.Kind == SyncKind.Conflict).ToList();
            var toPush = SelectChanges(changes, filter, parseResult.GetValue(yesOpt));
            if (toPush is null)
            {
                return;
            }

            if (toPush.Count == 0)
            {
                ctx.Output.PrintSuccess("Nothing to push.");
                HintIncoming(entries);
                return;
            }

            try
            {
                var pushed = await AnsiConsole.Status()
                    .Spinner(Spinner.Known.Dots)
                    .StartAsync("Pushing...", async _ =>
                        await syncService.PushAsync(snapshot, toPush, parseResult.GetValue(messageOpt), ct));

                renderer.PrintSyncEntries(toPush);
                ctx.Output.PrintSuccess($"Pushed {pushed} change(s).");
                HintIncoming(entries);
            }
            catch (ApiException ex) when (ex.ResponseStatusCode == 409)
            {
                ctx.Output.PrintError($"{ex.Message} Nothing in that batch was saved; run 'depvault pull' and push again.");
                Environment.ExitCode = 1;
            }
        });

        return cmd;
    }

    public Command CreatePullCommand()
    {
        var pathsArg = SyncSession.PathsArgument("Only pull these files, folders or globs");
        var projectOpt = SyncSession.ProjectOption();
        var forceOpt = new Option<bool>("--force") { Description = "Overwrite conflicting local files with the server copy" };
        var cmd = new Command("pull", "Download server changes (in CI, with DEPVAULT_TOKEN, writes every allowed file)")
        {
            pathsArg, projectOpt, forceOpt
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var paths = parseResult.GetValue(pathsArg)!;
            if (ctx.IsCiMode())
            {
                Environment.ExitCode = await ciPuller.PullAsync(paths, ct);
                return;
            }

            var opened = await session.OpenAsync(parseResult.GetValue(projectOpt), paths, ct);
            if (opened is null)
            {
                return;
            }

            var (snapshot, _, entries) = opened.Value;
            var force = parseResult.GetValue(forceOpt);
            var conflicts = entries.Where(e => e.Kind == SyncKind.Conflict).ToList();
            var toPull = entries.Where(e => e.IsRemoteChange || (force && e.Kind == SyncKind.Conflict)).ToList();

            if (toPull.Count > 0)
            {
                var result = await AnsiConsole.Status()
                    .Spinner(Spinner.Known.Dots)
                    .StartAsync("Pulling...", async _ => await syncService.PullAsync(snapshot, toPull, ct));

                renderer.PrintSyncEntries(toPull);
                result.Errors.ForEach(ctx.Output.PrintError);
                ctx.Output.PrintSuccess($"Pulled {result.Applied} change(s).");
                if (result.Errors.Count > 0)
                {
                    Environment.ExitCode = 1;
                }
            }
            else
            {
                ctx.Output.PrintSuccess("Already up to date.");
            }

            if (!force && conflicts.Count > 0)
            {
                AnsiConsole.WriteLine();
                renderer.PrintSyncEntries(conflicts);
                ctx.Output.PrintError("Skipped conflicts: 'depvault pull --force <path>' takes the server copy.");
                Environment.ExitCode = 1;
            }

            var localChanges = entries.Count(e => e.IsLocalChange);
            if (localChanges > 0)
            {
                AnsiConsole.MarkupLine($"[grey]{localChanges} local change(s) not pushed yet — run[/] [cyan1]depvault push[/][grey].[/]");
            }
        });

        return cmd;
    }

    public Command CreateUntrackCommand()
    {
        var pathsArg = new Argument<string[]>("paths") { Arity = ArgumentArity.OneOrMore, Description = "Files or globs to stop syncing" };
        var projectOpt = SyncSession.ProjectOption();
        var yesOpt = new Option<bool>("--yes", "-y") { Description = "Don't prompt" };
        var cmd = new Command("untrack", "Stop syncing files: delete them from DepVault (local copies stay) and ignore them from now on")
        {
            pathsArg, projectOpt, yesOpt
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            if (!ctx.RequireAuth())
            {
                Environment.ExitCode = 1;
                return;
            }

            var link = await projectLinker.ResolveAsync(parseResult.GetValue(projectOpt), ct);
            var filter = link is null ? null : session.ResolvePaths(link.Root, parseResult.GetValue(pathsArg)!);
            if (link is null || filter is null)
            {
                Environment.ExitCode = 1;
                return;
            }

            var remote = (await syncService.ListRemoteAsync(link, ct))
                .Where(r => filter.Matches(r.Path))
                .ToList();

            if (remote.Count > 0)
            {
                remote.ForEach(r => AnsiConsole.MarkupLine($"  [red]untrack[/]   {Markup.Escape(r.Path)}"));
                if (!parseResult.GetValue(yesOpt) && !ctx.Prompter.Confirm(
                        $"Delete {remote.Count} file(s) and their history from DepVault? Local copies are kept.", false))
                {
                    return;
                }

                await syncService.UntrackAsync(link, remote, ct);
            }

            foreach (var glob in filter.Globs)
            {
                linkStore.AddIgnore(link, glob);
            }

            ctx.Output.PrintSuccess(
                $"Untracked {remote.Count} file(s); added {filter.Globs.Count} ignore pattern(s) to .depvault.json.");
        });

        return cmd;
    }

    private List<SyncEntry>? SelectChanges(List<SyncEntry> changes, PathFilter filter, bool yes)
    {
        var deletions = changes.Where(e => e.Kind == SyncKind.Deleted).ToList();
        var others = changes.Except(deletions).ToList();

        // Without a prompt, only a deletion named by its exact path is intent enough: a wiped working
        // tree (e.g. git clean -X) must never empty the vault.
        if (yes || !ctx.Prompter.IsInteractive)
        {
            var named = deletions.Where(filter.NamesExactly).ToList();
            var skipped = deletions.Count - named.Count;
            if (skipped > 0)
            {
                AnsiConsole.MarkupLine(
                    $"[yellow]Skipped {skipped} deletion(s): confirm interactively or name each file, e.g. 'depvault push --yes <path>'.[/]");
            }

            return [.. others, .. named];
        }

        // Everything but deletions is preselected: Enter pushes all, space toggles.
        var selected = others.Count == 0
            ? []
            : ctx.Prompter.MultiSelect("Push these changes?", others, Describe);

        if (deletions.Count > 0)
        {
            renderer.PrintSyncEntries(deletions);
            if (ctx.Prompter.Confirm(
                    $"Also delete these {deletions.Count} file(s) and their history from DepVault?", false))
            {
                selected.AddRange(deletions);
            }
        }

        return selected;
    }

    private static string Describe(SyncEntry e)
    {
        // A forced push resolves a conflict by overwriting the server copy, so say that instead of "conflict".
        var label = e.Kind == SyncKind.Conflict ? "[red]overwrite[/]" : ConsoleRenderer.SyncLabel(e.Kind, 8);
        var path = e.FromPath is not null ? $"{e.FromPath} → {e.Path}" : e.Path;
        return $"{label} {Markup.Escape(path)}";
    }

    private static void PrintHeader(ProjectLink link)
    {
        AnsiConsole.MarkupLine(
            $"[grey]Project[/] [white]{Markup.Escape(link.DisplayName)}[/] [grey]· {Markup.Escape(link.Root)}[/]");
        AnsiConsole.WriteLine();
    }

    private static void PrintHints(List<SyncEntry> entries)
    {
        if (entries.Any(e => e.Kind == SyncKind.Untracked))
        {
            AnsiConsole.MarkupLine("[grey]Not a secret? Skip a new file for good with[/] [cyan1]depvault untrack <path>[/][grey].[/]");
        }
    }

    private static void HintIncoming(List<SyncEntry> entries)
    {
        var incoming = entries.Count(e => e.IsRemoteChange);
        if (incoming > 0)
        {
            AnsiConsole.MarkupLine($"[grey]{incoming} change(s) on the server — run[/] [cyan1]depvault pull[/][grey].[/]");
        }
    }
}

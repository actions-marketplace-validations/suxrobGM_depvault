using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Output;
using DepVault.Cli.Services.Sync;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>
/// Git-like file sync: <c>init</c> links a folder, <c>status</c> shows drift, <c>push</c>/<c>pull</c> move changes,
/// <c>untrack</c> stops syncing a file. Change detection is three-way (local / server / last sync).
/// </summary>
public sealed class SyncCommands(
    Session session,
    CliEnvironment env,
    SyncSession syncSession,
    SyncService syncService,
    IRepoFilesApi filesApi,
    ProjectLinker projectLinker,
    IProjectLinkStore linkStore,
    CiPuller ciPuller,
    IConsolePrompter prompter,
    SyncView view,
    Ui ui)
{
    public Command CreateInitCommand()
    {
        var projectOpt = new Option<string?>("--project") { Description = "Link to this project ID without prompting" };
        var cmd = new Command("init", "Link this folder to a DepVault project (writes .depvault.json)") { projectOpt };

        cmd.SetAction(async (parseResult, ct) =>
        {
            session.RequireUser();
            var projectId = parseResult.GetValue(projectOpt);
            if (linkStore.Find() is { } existing && projectId is null)
            {
                ui.Success($"Already linked to '{existing.DisplayName}' ({existing.Root}).");
                return ExitCodes.Ok;
            }

            await projectLinker.LinkAsync(projectId, ct);
            ui.Hint("Next: `depvault status` to see which files will sync, then `depvault push`.");
            return ExitCodes.Ok;
        });

        return cmd;
    }

    public Command CreateStatusCommand()
    {
        var pathsArg = CliOptions.Paths("Only show these files, folders or globs");
        var projectOpt = CliOptions.Project();
        var cmd = new Command("status", "Show which files differ between this folder and DepVault")
        {
            pathsArg, projectOpt, CliOptions.Json
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var (snapshot, _, entries) = await syncSession.OpenAsync(
                parseResult.GetValue(projectOpt), parseResult.GetValue(pathsArg)!, ct);
            var link = snapshot.Link;

            if (ui.Json)
            {
                ui.WriteJson(new StatusJson(link.ProjectId, link.Root, SyncView.ToJson(entries)),
                    CliJsonContext.Default.StatusJson);
                return ExitCodes.Ok;
            }

            ui.Line($"[grey]Project[/] [white]{Markup.Escape(link.DisplayName)}[/] [grey]· {Markup.Escape(link.Root)}[/]");
            ui.Line();
            if (entries.All(e => e.Kind == SyncKind.InSync))
            {
                ui.Success(entries.Count == 0
                    ? "No files tracked yet and no new secret files found. Track one with 'depvault push <path>'."
                    : $"All {entries.Count} file(s) are in sync.");
                return ExitCodes.Ok;
            }

            view.PrintEntries(entries);
            view.PrintSummary(entries);
            if (entries.Any(e => e.Kind == SyncKind.Untracked))
            {
                ui.Hint("Not a secret? Skip a new file for good with `depvault untrack <path>`.");
            }

            return ExitCodes.Ok;
        });

        return cmd;
    }

    public Command CreatePushCommand()
    {
        var pathsArg = CliOptions.Paths("Only push these files, folders or globs (any file path can be tracked this way)");
        var projectOpt = CliOptions.Project();
        var messageOpt = new Option<string?>("--message", "-m") { Description = "Note stored with the new versions" };
        var yesOpt = CliOptions.Yes("Don't prompt; push all changes except deletions of files not named exactly");
        var forceOpt = new Option<bool>("--force") { Description = "Overwrite conflicting server changes with local files" };
        var dryRunOpt = CliOptions.DryRun();
        var cmd = new Command("push", "Upload local changes (new, modified, renamed and deleted files)")
        {
            pathsArg, projectOpt, messageOpt, yesOpt, forceOpt, dryRunOpt, CliOptions.Json
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var (snapshot, filter, entries) = await syncSession.OpenAsync(
                parseResult.GetValue(projectOpt), parseResult.GetValue(pathsArg)!, ct);
            var yes = parseResult.GetValue(yesOpt);

            var conflicts = entries.Where(e => e.Kind == SyncKind.Conflict).ToList();
            if (conflicts.Count > 0 && !parseResult.GetValue(forceOpt))
            {
                view.PrintEntries(conflicts);
                throw new CliException("Nothing pushed: resolve conflicts first. 'depvault pull --force <path>' takes "
                                       + "the server copy, 'depvault push --force <path>' keeps yours.", ExitCodes.Conflict);
            }

            var changes = entries.Where(e => e.IsLocalChange || e.Kind == SyncKind.Conflict).ToList();
            if (parseResult.GetValue(dryRunOpt))
            {
                return Report(changes, 0, [], dryRun: true, "push");
            }

            var deletions = changes.Where(e => e.Kind == SyncKind.Deleted).ToList();
            var others = changes.Except(deletions).ToList();
            var selected = yes || !prompter.IsInteractive
                ? others
                : prompter.MultiSelect("Push these changes?", others, Describe);
            selected.AddRange(syncSession.ConfirmDeletions(deletions, filter, yes, "push",
                $"Also delete these {deletions.Count} file(s) and their history from DepVault?"));

            int pushed;
            try
            {
                pushed = selected.Count == 0
                    ? 0
                    : await ui.SpinAsync("Pushing...",
                        () => syncService.PushAsync(snapshot, selected, parseResult.GetValue(messageOpt), ct));
            }
            catch (ApiException ex) when (ApiErrors.HasStatus(ex, 409))
            {
                throw new CliException($"{ex.Message} Nothing in that batch was saved; run 'depvault pull' and push again.",
                    ExitCodes.Conflict);
            }

            Report(selected, pushed, [], dryRun: false, "push");
            HintCount(entries.Count(e => e.IsRemoteChange), "change(s) on the server — run `depvault pull`.");
            return ExitCodes.Ok;
        });

        return cmd;
    }

    public Command CreatePullCommand()
    {
        var pathsArg = CliOptions.Paths("Only pull these files, folders or globs");
        var projectOpt = CliOptions.Project();
        var yesOpt = CliOptions.Yes("Don't prompt; apply server deletions only for files named exactly");
        var forceOpt = new Option<bool>("--force") { Description = "Overwrite conflicting local files with the server copy" };
        var dryRunOpt = CliOptions.DryRun();
        var cmd = new Command("pull", "Download server changes (with DEPVAULT_TOKEN: every file the token can read)")
        {
            pathsArg, projectOpt, yesOpt, forceOpt, dryRunOpt, CliOptions.Json
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var paths = parseResult.GetValue(pathsArg)!;
            if (env.IsCi)
            {
                return await CiPullAsync(paths, ct);
            }

            var (snapshot, filter, entries) = await syncSession.OpenAsync(parseResult.GetValue(projectOpt), paths, ct);
            var force = parseResult.GetValue(forceOpt);
            var conflicts = entries.Where(e => e.Kind == SyncKind.Conflict).ToList();
            var deletions = entries.Where(e => e.Kind == SyncKind.DeletedOnServer).ToList();
            var toPull = entries
                .Where(e => (e.IsRemoteChange && e.Kind != SyncKind.DeletedOnServer) || (force && e.Kind == SyncKind.Conflict))
                .ToList();

            if (parseResult.GetValue(dryRunOpt))
            {
                return Report([.. toPull, .. deletions], 0, [], dryRun: true, "pull");
            }

            toPull.AddRange(syncSession.ConfirmDeletions(deletions, filter, parseResult.GetValue(yesOpt), "pull",
                $"Also delete these {deletions.Count} local file(s)? They were removed from DepVault."));

            var result = toPull.Count == 0
                ? new SyncResult(0, [])
                : await ui.SpinAsync("Pulling...", () => syncService.PullAsync(snapshot, toPull, ct));
            var exitCode = Report(toPull, result.Applied, result.Errors, dryRun: false, "pull");

            if (!force && conflicts.Count > 0)
            {
                ui.Line();
                view.PrintEntries(conflicts);
                ui.Error("Skipped conflicts: 'depvault pull --force <path>' takes the server copy.");
                exitCode = ExitCodes.Conflict;
            }

            HintCount(entries.Count(e => e.IsLocalChange), "local change(s) not pushed yet — run `depvault push`.");
            return exitCode;
        });

        return cmd;
    }

    public Command CreateUntrackCommand()
    {
        var pathsArg = new Argument<string[]>("paths") { Arity = ArgumentArity.OneOrMore, Description = "Files or globs to stop syncing" };
        var projectOpt = CliOptions.Project();
        var yesOpt = CliOptions.Yes();
        var cmd = new Command("untrack", "Stop syncing files: remove them from DepVault and ignore them (local copies stay)")
        {
            pathsArg, projectOpt, yesOpt
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            session.RequireUser();
            var link = await projectLinker.ResolveAsync(parseResult.GetValue(projectOpt), ct);
            var filter = PathFilter.Resolve(link.Root, Directory.GetCurrentDirectory(), parseResult.GetValue(pathsArg)!);
            var remote = (await filesApi.ListAsync(link.ProjectId, ct)).Where(r => filter.Matches(r.Path)).ToList();

            if (remote.Count > 0)
            {
                remote.ForEach(r => ui.Line($"  [red]untrack[/]   {Markup.Escape(r.Path)}"));
                if (!parseResult.GetValue(yesOpt))
                {
                    if (!prompter.IsInteractive)
                    {
                        throw new CliException("Pass --yes to untrack without a prompt.", ExitCodes.Usage);
                    }

                    if (!prompter.Confirm($"Delete {remote.Count} file(s) and their history from DepVault? Local copies are kept.", false))
                    {
                        return ExitCodes.Ok;
                    }
                }

                await syncService.UntrackAsync(link, remote, ct);
            }

            foreach (var glob in filter.Globs)
            {
                linkStore.AddIgnore(link, glob);
            }

            ui.Success($"Untracked {remote.Count} file(s); added {filter.Globs.Count} ignore pattern(s) to .depvault.json.");
            return ExitCodes.Ok;
        });

        return cmd;
    }

    private async Task<int> CiPullAsync(string[] paths, CancellationToken ct)
    {
        var result = await ciPuller.PullAsync(paths, ct);
        if (ui.Json)
        {
            var files = result.Written.Select(p => new SyncFileJson(p, null, "newOnServer", null)).ToList();
            ui.WriteJson(new SyncResultJson(false, result.Written.Count, files, result.Errors),
                CliJsonContext.Default.SyncResultJson);
        }
        else
        {
            result.Written.ForEach(p => ui.Success($"  {p}"));
            result.Errors.ForEach(ui.Error);
            ui.Success($"Pulled {result.Written.Count} file(s) into {result.Root}.");
        }

        return result.Errors.Count > 0 ? ExitCodes.Error : ExitCodes.Ok;
    }

    /// <summary>Prints what was (or would be) applied; failures exit non-zero.</summary>
    private int Report(List<SyncEntry> entries, int applied, List<string> errors, bool dryRun, string verb)
    {
        if (ui.Json)
        {
            ui.WriteJson(new SyncResultJson(dryRun, applied, SyncView.ToJson(entries), errors),
                CliJsonContext.Default.SyncResultJson);
        }
        else if (entries.Count == 0)
        {
            ui.Success(verb == "push" ? "Nothing to push." : "Already up to date.");
        }
        else
        {
            view.PrintEntries(entries);
            errors.ForEach(ui.Error);
            ui.Success(dryRun ? $"Would {verb} {entries.Count} change(s)." : $"{(verb == "push" ? "Pushed" : "Pulled")} {applied} change(s).");
        }

        return errors.Count > 0 ? ExitCodes.Error : ExitCodes.Ok;
    }

    private void HintCount(int count, string text)
    {
        if (count > 0)
        {
            ui.Hint($"{count} {text}");
        }
    }

    /// <summary>A forced push resolves a conflict by overwriting the server copy, so it says that.</summary>
    private static string Describe(SyncEntry e)
    {
        var label = e.Kind == SyncKind.Conflict ? "[red]overwrite[/]" : SyncView.Label(e.Kind, 8);
        return $"{label} {SyncView.DisplayPath(e)}";
    }
}

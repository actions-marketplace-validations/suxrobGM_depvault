using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>Deletes local copies of synced files (e.g. before handing a machine back). Server copies are untouched.</summary>
public sealed class PurgeCommands(AuthContext ctx, SyncSession session, ISyncStateStore stateStore)
{
    public Command CreatePurgeCommand()
    {
        var pathsArg = SyncSession.PathsArgument("Only purge these files, folders or globs");
        var projectOpt = SyncSession.ProjectOption();
        var dryRunOpt = new Option<bool>("--dry-run") { Description = "List what would be deleted" };
        var forceOpt = new Option<bool>("--force", "--yes", "-y")
        { Description = "Don't prompt, and also delete files with unpushed changes" };
        var cmd = new Command("purge", "Delete local copies of files stored in DepVault (unpushed changes are kept)")
        {
            pathsArg, projectOpt, dryRunOpt, forceOpt
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var opened = await session.OpenAsync(parseResult.GetValue(projectOpt), parseResult.GetValue(pathsArg)!, ct);
            if (opened is null)
            {
                return;
            }

            var (snapshot, filter) = opened.Value;
            var force = parseResult.GetValue(forceOpt);
            var local = snapshot.Entries
                .Where(filter.Matches)
                .Where(e => e.Remote is not null && e.LocalHash is not null)
                .ToList();
            var safe = local.Where(e => e.Kind == SyncKind.InSync || e.Kind == SyncKind.Behind).ToList();
            var unpushed = local.Except(safe).ToList();
            var targets = force ? local : safe;

            if (!force && unpushed.Count > 0)
            {
                AnsiConsole.MarkupLine($"[yellow]Keeping {unpushed.Count} file(s) with unpushed changes (push first, or --force).[/]");
            }

            if (targets.Count == 0)
            {
                ctx.Output.PrintSuccess("Nothing to purge.");
                return;
            }

            targets.ForEach(e => AnsiConsole.MarkupLine($"  [red]delete[/]  {Markup.Escape(e.Path)}"));
            if (parseResult.GetValue(dryRunOpt))
            {
                return;
            }

            if (!force && !ctx.Prompter.Confirm($"Delete these {targets.Count} local file(s)?", false))
            {
                return;
            }

            // Forget the base too, so the files show as incoming (not "deleted locally") and pull restores them.
            foreach (var entry in targets)
            {
                File.Delete(RepoPath.ToFull(snapshot.Link.Root, entry.Path));
                snapshot.State.Files.Remove(entry.Remote!.Id);
            }

            stateStore.Save(snapshot.Link, snapshot.State);

            ctx.Output.PrintSuccess($"Deleted {targets.Count} local file(s). Restore them with 'depvault pull'.");
        });

        return cmd;
    }
}

using System.CommandLine;
using DepVault.Cli.Common;
using DepVault.Cli.Output;
using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>Deletes local copies of synced files (e.g. before handing a machine back). Server copies are untouched.</summary>
public sealed class PurgeCommands(SyncSession syncSession, SyncService syncService, IConsolePrompter prompter, Ui ui)
{
    public Command CreatePurgeCommand()
    {
        var pathsArg = CliOptions.Paths("Only purge these files, folders or globs");
        var projectOpt = CliOptions.Project();
        var dryRunOpt = CliOptions.DryRun();
        var yesOpt = CliOptions.Yes();
        var forceOpt = new Option<bool>("--force") { Description = "Also delete files with unpushed changes" };
        var cmd = new Command("purge", "Delete local copies of synced files (unpushed changes are kept)")
        {
            pathsArg, projectOpt, dryRunOpt, yesOpt, forceOpt
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var (snapshot, _, entries) = await syncSession.OpenAsync(
                parseResult.GetValue(projectOpt), parseResult.GetValue(pathsArg)!, ct);
            var local = entries.Where(e => e.Remote is not null && e.LocalHash is not null).ToList();
            var safe = local.Where(e => e.Kind is SyncKind.InSync or SyncKind.Behind).ToList();
            var targets = parseResult.GetValue(forceOpt) ? local : safe;

            if (targets.Count < local.Count)
            {
                ui.Warn($"Keeping {local.Count - targets.Count} file(s) with unpushed changes (push first, or --force).");
            }

            if (targets.Count == 0)
            {
                ui.Success("Nothing to purge.");
                return ExitCodes.Ok;
            }

            targets.ForEach(e => ui.Line($"  [red]delete[/]  {Markup.Escape(e.Path)}"));
            if (parseResult.GetValue(dryRunOpt))
            {
                return ExitCodes.Ok;
            }

            if (!parseResult.GetValue(yesOpt))
            {
                if (!prompter.IsInteractive)
                {
                    throw new CliException("Pass --yes to purge without a prompt.", ExitCodes.Usage);
                }

                if (!prompter.Confirm($"Delete these {targets.Count} local file(s)?", false))
                {
                    return ExitCodes.Ok;
                }
            }

            syncService.Purge(snapshot, targets);
            ui.Success($"Deleted {targets.Count} local file(s). Restore them with 'depvault pull'.");
            return ExitCodes.Ok;
        });

        return cmd;
    }
}

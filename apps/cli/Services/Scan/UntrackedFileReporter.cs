using DepVault.Cli.Output;
using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Services.Scan;

/// <summary>Scan step: lists git-ignored secret files that aren't stored in DepVault yet (no key or upload needed).</summary>
internal sealed class UntrackedFileReporter(ILocalFileScanner scanner, SyncService syncService)
{
    public async Task RunAsync(ProjectLink link, ScanResults results, CancellationToken ct)
    {
        var stored = (await syncService.ListRemoteAsync(link, ct)).Select(r => r.Path).ToHashSet(StringComparer.Ordinal);
        var untracked = scanner.FindCandidates(link.Root, link.Ignore).Where(p => !stored.Contains(p)).ToList();
        results.UntrackedSecretFiles = untracked.Count;

        if (untracked.Count == 0)
        {
            AnsiConsole.MarkupLine("[green]No unsynced secret files found.[/]");
            return;
        }

        foreach (var path in untracked)
        {
            AnsiConsole.MarkupLine($"  {ConsoleRenderer.SyncLabel(SyncKind.Untracked, 10)}{Markup.Escape(path)}");
        }

        AnsiConsole.MarkupLine("[grey]Store them with[/] [cyan1]depvault push[/][grey], or skip one with[/] [cyan1]depvault untrack <path>[/][grey].[/]");
    }
}

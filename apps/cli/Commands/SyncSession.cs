using DepVault.Cli.Auth;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Commands;

public sealed record OpenedSync(SyncSnapshot Snapshot, PathFilter Filter, List<SyncEntry> Entries);

/// <summary>Shared setup for the file commands: auth, project link, project key and a fresh sync plan.</summary>
public sealed class SyncSession(
    Session session,
    ProjectLinker projectLinker,
    DekService dekService,
    SyncService syncService,
    IConsolePrompter prompter,
    SyncView view,
    Ui ui)
{
    /// <summary>The plan plus its entries matching the path arguments.</summary>
    public async Task<OpenedSync> OpenAsync(string? projectId, string[] paths, CancellationToken ct)
    {
        session.RequireUser();
        var link = await projectLinker.ResolveAsync(projectId, ct);
        var filter = PathFilter.Resolve(link.Root, Directory.GetCurrentDirectory(), paths);
        var dek = await dekService.GetAsync(link.ProjectId, ct);
        var snapshot = await ui.SpinAsync("Comparing with DepVault...",
            () => syncService.LoadAsync(link, dek, filter.ExplicitFiles, ct));

        return new OpenedSync(snapshot, filter, snapshot.Entries.Where(filter.Matches).ToList());
    }

    /// <summary>
    /// Deletions the user means: confirmed interactively, else only files named by exact path. A wiped working
    /// tree must never empty the vault, and a teammate's untrack must never wipe this machine unasked.
    /// </summary>
    public List<SyncEntry> ConfirmDeletions(
        List<SyncEntry> deletions, PathFilter filter, bool yes, string command, string question)
    {
        if (deletions.Count == 0)
        {
            return [];
        }

        if (yes || !prompter.IsInteractive)
        {
            var named = deletions.Where(filter.NamesExactly).ToList();
            if (named.Count < deletions.Count)
            {
                ui.Warn($"Skipped {deletions.Count - named.Count} deletion(s): confirm interactively or name each file, "
                        + $"e.g. 'depvault {command} --yes <path>'.");
            }

            return named;
        }

        view.PrintEntries(deletions);
        return prompter.Confirm(question, false) ? deletions : [];
    }
}

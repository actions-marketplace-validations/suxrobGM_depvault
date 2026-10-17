namespace DepVault.Cli.Services.Sync;

/// <summary>A file as the server lists it (metadata only).</summary>
public sealed record RemoteFile(string Id, string Path, int Version, string ContentHash);

public enum SyncKind
{
    InSync,

    /// <summary>Changed locally since the last sync — push uploads it.</summary>
    Modified,

    /// <summary>New local file not on the server yet — push creates it.</summary>
    Untracked,

    /// <summary>Deleted locally — push deletes it from the server (only when confirmed).</summary>
    Deleted,

    /// <summary>Moved/renamed locally with identical content — push moves it on the server.</summary>
    Renamed,

    /// <summary>Changed or moved on the server, unchanged locally — pull updates it.</summary>
    Behind,

    /// <summary>On the server, not on this machine — pull writes it.</summary>
    NewOnServer,

    /// <summary>Deleted on the server, unchanged locally — pull removes the local copy.</summary>
    DeletedOnServer,

    /// <summary>Both sides changed; neither push nor pull touches it without <c>--force</c>.</summary>
    Conflict
}

/// <summary>
/// One file's sync status. <see cref="Path"/> is where the file is (or will be) locally; <see cref="FromPath"/>
/// is the previous path for renames and server-side moves.
/// </summary>
public sealed record SyncEntry(
    SyncKind Kind,
    string Path,
    RemoteFile? Remote = null,
    string? LocalHash = null,
    string? FromPath = null,
    string? Reason = null)
{
    /// <summary>A push sends this entry (conflicts only with --force).</summary>
    public bool IsLocalChange => Kind is SyncKind.Modified or SyncKind.Untracked or SyncKind.Deleted or SyncKind.Renamed;

    /// <summary>A pull applies this entry (conflicts only with --force).</summary>
    public bool IsRemoteChange => Kind is SyncKind.Behind or SyncKind.NewOnServer or SyncKind.DeletedOnServer;
}

/// <summary>
/// Pure three-way comparison of local files, the server listing, and this machine's last-synced base.
/// Changes are detected by keyed content hash, so no file content ever needs downloading to plan.
/// </summary>
public static class SyncPlanner
{
    /// <param name="remote">Server listing.</param>
    /// <param name="synced">Last synced state on this machine, keyed by file id.</param>
    /// <param name="local">Content hash of every relevant local file that exists, keyed by repo-relative path.</param>
    /// <param name="candidates">Discovered trackable paths (a subset of <paramref name="local"/>'s keys).</param>
    public static List<SyncEntry> Plan(
        IReadOnlyList<RemoteFile> remote,
        IReadOnlyDictionary<string, SyncedFile> synced,
        IReadOnlyDictionary<string, string> local,
        IEnumerable<string> candidates)
    {
        var entries = new List<SyncEntry>();
        var claimed = new HashSet<string>(StringComparer.Ordinal);
        var remoteIds = remote.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);

        foreach (var r in remote)
        {
            entries.Add(synced.TryGetValue(r.Id, out var s)
                ? PlanSynced(r, s, local)
                : PlanUnsynced(r, local));
            claimed.Add(r.Path);
            if (s is not null)
            {
                claimed.Add(s.Path);
            }
        }

        foreach (var (id, s) in synced)
        {
            if (remoteIds.Contains(id) || !claimed.Add(s.Path))
            {
                continue;
            }

            // Deleted on the server. Both deleted -> nothing left to report.
            if (local.TryGetValue(s.Path, out var hash))
            {
                entries.Add(hash == s.ContentHash
                    ? new SyncEntry(SyncKind.DeletedOnServer, s.Path, LocalHash: hash)
                    : new SyncEntry(SyncKind.Conflict, s.Path, LocalHash: hash,
                        Reason: "changed locally, deleted on server"));
            }
        }

        foreach (var path in candidates.Where(p => !claimed.Contains(p) && local.ContainsKey(p)))
        {
            entries.Add(new SyncEntry(SyncKind.Untracked, path, LocalHash: local[path]));
        }

        PairRenames(entries);
        return entries.OrderBy(e => e.Path, StringComparer.Ordinal).ToList();
    }

    private static SyncEntry PlanSynced(
        RemoteFile r, SyncedFile s, IReadOnlyDictionary<string, string> local)
    {
        var remoteChanged = r.Version != s.Version;
        var hasLocal = local.TryGetValue(s.Path, out var localHash);
        var localChanged = !hasLocal || localHash != s.ContentHash;

        if (!remoteChanged)
        {
            if (!hasLocal)
            {
                return new SyncEntry(SyncKind.Deleted, s.Path, r);
            }

            return localChanged
                ? new SyncEntry(SyncKind.Modified, s.Path, r, localHash)
                : new SyncEntry(SyncKind.InSync, s.Path, r, localHash);
        }

        if (!localChanged)
        {
            var moved = r.Path != s.Path;
            // A server-side move onto a path that already holds a different local file must not overwrite it.
            if (moved && local.TryGetValue(r.Path, out var occupant) && occupant != r.ContentHash)
            {
                return new SyncEntry(SyncKind.Conflict, r.Path, r, occupant, s.Path,
                    "moved on server onto an existing local file");
            }

            return new SyncEntry(SyncKind.Behind, r.Path, r, localHash, moved ? s.Path : null);
        }

        if (hasLocal && localHash == r.ContentHash && r.Path == s.Path)
        {
            return new SyncEntry(SyncKind.InSync, r.Path, r, localHash);
        }

        return new SyncEntry(SyncKind.Conflict, s.Path, r, localHash,
            Reason: hasLocal ? "changed locally and on server" : "deleted locally, changed on server");
    }

    /// <summary>A server file this machine never synced: adopt an identical local copy, else pull it.</summary>
    private static SyncEntry PlanUnsynced(RemoteFile r, IReadOnlyDictionary<string, string> local)
    {
        if (!local.TryGetValue(r.Path, out var hash))
        {
            return new SyncEntry(SyncKind.NewOnServer, r.Path, r);
        }

        return hash == r.ContentHash
            ? new SyncEntry(SyncKind.InSync, r.Path, r, hash)
            : new SyncEntry(SyncKind.Conflict, r.Path, r, hash, Reason: "local copy differs from server");
    }

    /// <summary>A local delete plus an untracked file with the same content is a rename (exact match, 1:1).</summary>
    private static void PairRenames(List<SyncEntry> entries)
    {
        var deleted = entries.Where(e => e.Kind == SyncKind.Deleted).ToList();
        var untrackedByHash = entries
            .Where(e => e.Kind == SyncKind.Untracked)
            .GroupBy(e => e.LocalHash!)
            .Where(g => g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single());

        foreach (var del in deleted)
        {
            var baseHash = del.Remote!.ContentHash;
            if (!untrackedByHash.Remove(baseHash, out var target))
            {
                continue;
            }

            entries.Remove(del);
            entries.Remove(target);
            entries.Add(new SyncEntry(SyncKind.Renamed, target.Path, del.Remote, target.LocalHash, del.Path));
        }
    }
}

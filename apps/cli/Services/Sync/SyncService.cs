using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Crypto;
using Change = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Changes.ChangesPostRequestBody_changes;
using ChangeContent = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Changes.ChangesPostRequestBody_changes_content;
using ChangesBody = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Changes.ChangesPostRequestBody;
using DownloadBody = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Download.DownloadPostRequestBody;

namespace DepVault.Cli.Services.Sync;

/// <summary>Everything a status/push/pull needs, computed once: the plan plus the inputs it came from.</summary>
public sealed record SyncSnapshot(ProjectLink Link, byte[] Dek, SyncStateFile State, List<SyncEntry> Entries);

/// <summary>Outcome of applying a push or pull.</summary>
public sealed record SyncResult(int Applied, List<string> Errors);

/// <summary>Plans and applies syncs between a linked folder and its DepVault project.</summary>
public sealed class SyncService(
    IApiClientFactory clientFactory,
    ILocalFileScanner scanner,
    ISyncStateStore stateStore)
{
    // Keep each request well under server body limits while staying one round trip for typical repos.
    private const int MaxChangesPerRequest = 50;
    private const long MaxBytesPerRequest = 20 * 1024 * 1024;

    /// <summary>
    /// Lists the server, scans the folder and hashes local files with the DEK's content-tag key.
    /// <paramref name="explicitPaths"/> are always considered, even when discovery wouldn't offer them.
    /// </summary>
    public async Task<SyncSnapshot> LoadAsync(
        ProjectLink link, byte[] dek, IReadOnlyList<string> explicitPaths, CancellationToken ct)
    {
        var remote = await ListRemoteAsync(link, ct);
        var state = stateStore.Load(link);
        var candidates = scanner.FindCandidates(link.Root, link.Ignore).Concat(explicitPaths).Distinct().ToList();

        var relevant = candidates
            .Concat(state.Files.Values.Select(s => s.Path))
            .Concat(remote.Select(r => r.Path))
            .Distinct(StringComparer.Ordinal);

        var local = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var path in relevant)
        {
            var full = Path.Combine(link.Root, path);
            if (RepoPath.IsInside(path) && File.Exists(full))
            {
                local[path] = VaultCrypto.ComputeContentTag(await File.ReadAllBytesAsync(full, ct), dek);
            }
        }

        var entries = SyncPlanner.Plan(remote, state.Files, local, candidates);
        return new SyncSnapshot(link, dek, state, entries);
    }

    /// <summary>
    /// Uploads local changes; each request is atomic and the server rejects it (409) if any file changed
    /// since this machine's base. Conflicts in <paramref name="entries"/> are forced local-wins. The base
    /// is saved even when a later request fails, so applied batches are never re-sent as conflicts.
    /// </summary>
    public async Task<int> PushAsync(
        SyncSnapshot snapshot, IReadOnlyList<SyncEntry> entries, string? message, CancellationToken ct)
    {
        var client = clientFactory.Create().Api.Projects[snapshot.Link.ProjectId].Files.Changes;
        var applied = 0;

        try
        {
            foreach (var batch in await BuildBatchesAsync(snapshot, entries, ct))
            {
                var response = await client.PostAsync(new ChangesBody { Changes = batch, Message = message },
                    cancellationToken: ct);

                foreach (var file in response?.Files ?? [])
                {
                    snapshot.State.Files[file.Id!] = new SyncedFile
                    {
                        Path = file.Path!, Version = file.Version ?? 0, ContentHash = file.ContentHash!
                    };
                }

                foreach (var id in response?.DeletedIds ?? [])
                {
                    snapshot.State.Files.Remove(id);
                }

                applied += batch.Count;
            }
        }
        finally
        {
            AdoptInSync(snapshot);
            stateStore.Save(snapshot.Link, snapshot.State);
        }

        return applied;
    }

    /// <summary>Writes server changes to disk. Conflicts in <paramref name="entries"/> are forced server-wins.</summary>
    public async Task<SyncResult> PullAsync(SyncSnapshot snapshot, IReadOnlyList<SyncEntry> entries, CancellationToken ct)
    {
        var errors = new List<string>();
        var applied = 0;
        var root = snapshot.Link.Root;

        var toDownload = entries.Where(e => e.Remote is not null).ToList();
        var blobs = await DownloadAsync(snapshot.Link.ProjectId, toDownload.Select(e => e.Remote!.Id), ct);

        foreach (var entry in entries)
        {
            try
            {
                if (entry.Remote is null)
                {
                    DeleteLocal(root, entry.Path);
                    RemoveFromState(snapshot.State, entry.Path);
                }
                else if (blobs.TryGetValue(entry.Remote.Id, out var blob))
                {
                    var bytes = VaultCrypto.DecryptBytes(blob.EncryptedContent, blob.Iv, blob.AuthTag, snapshot.Dek);
                    SecureFileWriter.WriteFileOwnerOnly(RepoPath.ToFull(root, entry.Remote.Path), bytes);
                    if (entry.FromPath is not null && entry.Kind == SyncKind.Behind)
                    {
                        DeleteLocal(root, entry.FromPath);
                    }

                    snapshot.State.Files[entry.Remote.Id] = ToSynced(entry.Remote);
                }
                else
                {
                    errors.Add($"{entry.Path}: no longer on the server");
                    continue;
                }

                applied++;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException
                                           or System.Security.Cryptography.CryptographicException)
            {
                errors.Add($"{entry.Path}: {ex.Message}");
            }
        }

        AdoptInSync(snapshot);
        stateStore.Save(snapshot.Link, snapshot.State);
        return new SyncResult(applied, errors);
    }

    /// <summary>Server listing (metadata only, no content or key needed).</summary>
    public async Task<List<RemoteFile>> ListRemoteAsync(ProjectLink link, CancellationToken ct)
    {
        var listing = await clientFactory.Create().Api.Projects[link.ProjectId].Files.GetAsync(cancellationToken: ct);
        return (listing?.Items ?? [])
            .Select(f => new RemoteFile(f.Id!, f.Path!, f.Version ?? 0, f.ContentHash ?? ""))
            .ToList();
    }

    /// <summary>Deletes files from the server and from this machine's base, keeping local copies.</summary>
    public async Task UntrackAsync(ProjectLink link, IReadOnlyList<RemoteFile> files, CancellationToken ct)
    {
        var state = stateStore.Load(link);
        await clientFactory.Create().Api.Projects[link.ProjectId].Files.Changes.PostAsync(
            new ChangesBody
            {
                Changes = files
                    .Select(f => new Change { FileId = Guid.Parse(f.Id), BaseVersion = f.Version, Delete = true })
                    .ToList(),
                Message = "Untracked"
            }, cancellationToken: ct);

        foreach (var file in files)
        {
            state.Files.Remove(file.Id);
        }

        stateStore.Save(link, state);
    }

    /// <summary>Records files that already match the server so later runs have a base for them.</summary>
    private static void AdoptInSync(SyncSnapshot snapshot)
    {
        foreach (var entry in snapshot.Entries.Where(e => e.Kind == SyncKind.InSync && e.Remote is not null))
        {
            snapshot.State.Files[entry.Remote!.Id] = ToSynced(entry.Remote);
        }
    }

    private static SyncedFile ToSynced(RemoteFile r) =>
        new() { Path = r.Path, Version = r.Version, ContentHash = r.ContentHash };

    private static void RemoveFromState(SyncStateFile state, string path)
    {
        foreach (var id in state.Files.Where(kv => kv.Value.Path == path).Select(kv => kv.Key).ToList())
        {
            state.Files.Remove(id);
        }
    }

    private static void DeleteLocal(string root, string path)
    {
        var full = RepoPath.ToFull(root, path);
        if (File.Exists(full))
        {
            File.Delete(full);
        }
    }

    private async Task<List<List<Change>>> BuildBatchesAsync(
        SyncSnapshot snapshot, IReadOnlyList<SyncEntry> entries, CancellationToken ct)
    {
        var batches = new List<List<Change>>();
        var current = new List<Change>();
        long currentBytes = 0;

        foreach (var entry in entries)
        {
            var (change, size) = await BuildChangeAsync(snapshot, entry, ct);
            if (current.Count > 0 && (current.Count >= MaxChangesPerRequest || currentBytes + size > MaxBytesPerRequest))
            {
                batches.Add(current);
                current = [];
                currentBytes = 0;
            }

            current.Add(change);
            currentBytes += size;
        }

        if (current.Count > 0)
        {
            batches.Add(current);
        }

        return batches;
    }

    private static async Task<(Change Change, long Size)> BuildChangeAsync(
        SyncSnapshot snapshot, SyncEntry entry, CancellationToken ct)
    {
        var remote = entry.Remote;
        var hasLocal = entry.LocalHash is not null;

        // Deleted locally (or a forced "deleted locally, changed on server" conflict).
        if (!hasLocal)
        {
            return (new Change { FileId = Guid.Parse(remote!.Id), BaseVersion = remote.Version, Delete = true }, 0);
        }

        if (entry.Kind == SyncKind.Renamed)
        {
            return (new Change { FileId = Guid.Parse(remote!.Id), BaseVersion = remote.Version, Path = entry.Path }, 0);
        }

        var bytes = await File.ReadAllBytesAsync(RepoPath.ToFull(snapshot.Link.Root, entry.Path), ct);
        var (ciphertext, iv, tag) = VaultCrypto.EncryptBytes(bytes, snapshot.Dek);
        var content = new ChangeContent
        {
            EncryptedContent = ciphertext,
            Iv = iv,
            AuthTag = tag,
            ContentHash = VaultCrypto.ComputeContentTag(bytes, snapshot.Dek),
            FileSize = bytes.Length,
            IsBinary = BinaryDetector.IsBinary(bytes)
        };

        // A forced conflict on a file the server moved keeps the local layout by moving it back.
        var change = remote is null
            ? new Change { Path = entry.Path, Content = content }
            : new Change
            {
                FileId = Guid.Parse(remote.Id),
                BaseVersion = remote.Version,
                Content = content,
                Path = remote.Path == entry.Path ? null : entry.Path
            };
        return (change, ciphertext.Length);
    }

    private sealed record Blob(string EncryptedContent, string Iv, string AuthTag);

    private async Task<Dictionary<string, Blob>> DownloadAsync(
        string projectId, IEnumerable<string> ids, CancellationToken ct)
    {
        var client = clientFactory.Create().Api.Projects[projectId].Files.Download;
        var result = new Dictionary<string, Blob>(StringComparer.Ordinal);

        foreach (var chunk in ids.Distinct().Chunk(MaxChangesPerRequest))
        {
            var response = await client.PostAsync(
                new DownloadBody { FileIds = chunk.Select(id => (Guid?)Guid.Parse(id)).ToList() },
                cancellationToken: ct);

            foreach (var item in response?.Items ?? [])
            {
                result[item.Id!] = new Blob(item.EncryptedContent!, item.Iv!, item.AuthTag!);
            }
        }

        return result;
    }
}

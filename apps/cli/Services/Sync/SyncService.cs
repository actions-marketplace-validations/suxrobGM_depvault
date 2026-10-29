using DepVault.Cli.Common;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Services.Sync;

/// <summary>Everything a status/push/pull needs, computed once: the plan plus the inputs it came from.</summary>
public sealed record SyncSnapshot(ProjectLink Link, byte[] Dek, SyncStateFile State, List<SyncEntry> Entries);

/// <summary>Outcome of applying a push or pull; failed files are listed and skipped.</summary>
public sealed record SyncResult(int Applied, List<string> Errors);

/// <summary>Plans and applies syncs between a linked folder and its DepVault project.</summary>
public sealed class SyncService(IRepoFilesApi api, ILocalFileScanner scanner, ISyncStateStore stateStore)
{
    // Stays well under the server body limit while keeping typical repos to one request.
    private const long MaxBytesPerRequest = 20 * 1024 * 1024;

    /// <summary>
    /// Lists the server, scans the folder and hashes local files. <paramref name="explicitPaths"/> are always
    /// considered, even when discovery wouldn't offer them.
    /// </summary>
    public async Task<SyncSnapshot> LoadAsync(
        ProjectLink link, byte[] dek, IReadOnlyList<string> explicitPaths, CancellationToken ct)
    {
        // The listing is network-bound and the scan disk/git-bound, so overlap them.
        var remoteTask = api.ListAsync(link.ProjectId, ct);
        var scanTask = Task.Run(() => scanner.FindCandidates(link.Root, link.Ignore), ct);
        var remote = await remoteTask;
        var candidates = (await scanTask).Concat(explicitPaths).Distinct().ToList();
        var state = stateStore.Load(link);

        var relevant = candidates
            .Concat(state.Files.Values.Select(s => s.Path))
            .Concat(remote.Select(r => r.Path))
            .Distinct(StringComparer.Ordinal);

        var local = new Dictionary<string, string>(StringComparer.Ordinal);
        using var tagKey = VaultCrypto.DeriveContentTagKey(dek);
        foreach (var path in relevant)
        {
            if (RepoPath.TryToFull(link.Root, path, out var full) && File.Exists(full))
            {
                local[path] = VaultCrypto.ComputeContentTag(await File.ReadAllBytesAsync(full, ct), tagKey);
            }
        }

        return new SyncSnapshot(link, dek, state, SyncPlanner.Plan(remote, state.Files, local, candidates));
    }

    /// <summary>
    /// Uploads local changes in atomic, version-checked batches; conflicts in <paramref name="entries"/> are forced
    /// local-wins. The base is saved even when a later batch fails, so applied ones aren't re-sent as conflicts.
    /// </summary>
    public async Task<int> PushAsync(
        SyncSnapshot snapshot, IReadOnlyList<SyncEntry> entries, string? message, CancellationToken ct)
    {
        var applied = 0;
        try
        {
            foreach (var batch in await BuildBatchesAsync(snapshot, entries, ct))
            {
                var result = await api.ApplyAsync(snapshot.Link.ProjectId, batch, message, ct);
                result.Files.ForEach(f => snapshot.State.Files[f.Id] = ToSynced(f));
                result.DeletedIds.ForEach(id => snapshot.State.Files.Remove(id));
                applied += batch.Count;
            }
        }
        finally
        {
            Save(snapshot);
        }

        return applied;
    }

    /// <summary>Writes server changes to disk; conflicts in <paramref name="entries"/> are forced server-wins.</summary>
    public async Task<SyncResult> PullAsync(SyncSnapshot snapshot, IReadOnlyList<SyncEntry> entries, CancellationToken ct)
    {
        var errors = new List<string>();
        var applied = 0;
        var root = snapshot.Link.Root;
        var blobs = await api.DownloadAsync(
            snapshot.Link.ProjectId, entries.Where(e => e.Remote is not null).Select(e => e.Remote!.Id), ct);

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
                    WriteLocal(root, entry.Remote.Path, blob, snapshot.Dek);
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
            catch (Exception ex) when (IsWriteFailure(ex))
            {
                errors.Add($"{entry.Path}: {ex.Message}");
            }
        }

        Save(snapshot);
        return new SyncResult(applied, errors);
    }

    /// <summary>Deletes files from the server and from this machine's base, keeping local copies.</summary>
    public async Task UntrackAsync(ProjectLink link, IReadOnlyList<RemoteFile> files, CancellationToken ct)
    {
        var state = stateStore.Load(link);
        foreach (var batch in files.Chunk(RepoFilesApi.MaxFilesPerRequest))
        {
            await api.ApplyAsync(link.ProjectId,
                batch.Select(f => new FileChange(f.Id, f.Version, null, null, Delete: true)).ToList(), "Untracked", ct);
            foreach (var file in batch)
            {
                state.Files.Remove(file.Id);
            }
        }

        stateStore.Save(link, state);
    }

    /// <summary>Forgets the base of deleted local copies, so they show as incoming and a pull restores them.</summary>
    public void Purge(SyncSnapshot snapshot, IReadOnlyList<SyncEntry> entries)
    {
        foreach (var entry in entries)
        {
            DeleteLocal(snapshot.Link.Root, entry.Path);
            snapshot.State.Files.Remove(entry.Remote!.Id);
        }

        stateStore.Save(snapshot.Link, snapshot.State);
    }

    /// <summary>Decrypts a blob and writes it owner-only under the root (refusing paths that escape it).</summary>
    public static void WriteLocal(string root, string path, EncryptedBlob blob, byte[] dek)
    {
        var bytes = VaultCrypto.DecryptBytes(blob.Ciphertext, blob.Iv, blob.AuthTag, dek);
        SecureFileWriter.WriteFileOwnerOnly(RepoPath.ToFull(root, path), bytes);
    }

    /// <summary>Failures writing one file (bad path, disk, or decrypt) that skip just that file.</summary>
    public static bool IsWriteFailure(Exception ex) =>
        ex is IOException or UnauthorizedAccessException or InvalidOperationException
            or System.Security.Cryptography.CryptographicException;

    /// <summary>Records files that already match the server so later runs have a base for them.</summary>
    private void Save(SyncSnapshot snapshot)
    {
        foreach (var entry in snapshot.Entries.Where(e => e.Kind == SyncKind.InSync && e.Remote is not null))
        {
            snapshot.State.Files[entry.Remote!.Id] = ToSynced(entry.Remote);
        }

        stateStore.Save(snapshot.Link, snapshot.State);
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

    private static async Task<List<List<FileChange>>> BuildBatchesAsync(
        SyncSnapshot snapshot, IReadOnlyList<SyncEntry> entries, CancellationToken ct)
    {
        var batches = new List<List<FileChange>>();
        var current = new List<FileChange>();
        long currentBytes = 0;
        using var tagKey = VaultCrypto.DeriveContentTagKey(snapshot.Dek);

        foreach (var entry in entries)
        {
            var change = await BuildChangeAsync(snapshot, entry, tagKey, ct);
            var size = change.Content?.Blob.Ciphertext.Length ?? 0;
            if (current.Count > 0
                && (current.Count >= RepoFilesApi.MaxFilesPerRequest || currentBytes + size > MaxBytesPerRequest))
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

    private static async Task<FileChange> BuildChangeAsync(
        SyncSnapshot snapshot, SyncEntry entry, ContentTagKey tagKey, CancellationToken ct)
    {
        var remote = entry.Remote;

        // Deleted locally (or a forced "deleted locally, changed on server" conflict).
        if (entry.LocalHash is null)
        {
            return new FileChange(remote!.Id, remote.Version, null, null, Delete: true);
        }

        if (entry.Kind == SyncKind.Renamed)
        {
            return new FileChange(remote!.Id, remote.Version, entry.Path, null);
        }

        // Re-read rather than reuse the planned hash: the file may have changed since the plan.
        var bytes = await File.ReadAllBytesAsync(RepoPath.ToFull(snapshot.Link.Root, entry.Path), ct);
        var (ciphertext, iv, tag) = VaultCrypto.EncryptBytes(bytes, snapshot.Dek);
        var content = new FileContent(new EncryptedBlob(ciphertext, iv, tag),
            VaultCrypto.ComputeContentTag(bytes, tagKey), bytes.Length, BinaryDetector.IsBinary(bytes));

        // A forced conflict on a file the server moved keeps the local layout by moving it back.
        return remote is null
            ? new FileChange(null, null, entry.Path, content)
            : new FileChange(remote.Id, remote.Version, remote.Path == entry.Path ? null : entry.Path, content);
    }
}

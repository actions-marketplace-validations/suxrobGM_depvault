using DepVault.Cli.Config;
using DepVault.Cli.Crypto;
using DepVault.Cli.Services.Sync;
using Microsoft.Kiota.Abstractions;

namespace DepVault.Cli.Tests;

/// <summary>
/// Deterministic, cross-platform KEK protector for tests: base64 round-trip with no OS dependency
/// (avoids DPAPI's user binding and the POSIX protector-key file). Not for production use.
/// </summary>
internal sealed class IdentityKekProtector : IKekProtector
{
    public string Protect(byte[] kek) => Convert.ToBase64String(kek);

    public byte[]? Unprotect(string protectedBlob)
    {
        try
        {
            return Convert.FromBase64String(protectedBlob);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    public void Reset() { }
}

/// <summary>In-memory DepVault project: version-checked atomic batches, like the real <c>/files/changes</c>.</summary>
internal sealed class FakeFilesApi : IRepoFilesApi
{
    public sealed record StoredFile(string Path, int Version, string ContentHash, EncryptedBlob Blob);

    public Dictionary<string, StoredFile> Files { get; } = [];

    public int ApplyCalls { get; private set; }

    public Task<List<RemoteFile>> ListAsync(string projectId, CancellationToken ct) =>
        Task.FromResult(Files.Select(kv => new RemoteFile(kv.Key, kv.Value.Path, kv.Value.Version, kv.Value.ContentHash)).ToList());

    public Task<Dictionary<string, EncryptedBlob>> DownloadAsync(string projectId, IEnumerable<string> fileIds, CancellationToken ct) =>
        Task.FromResult(fileIds.Where(Files.ContainsKey).ToDictionary(id => id, id => Files[id].Blob));

    public Task<AppliedChanges> ApplyAsync(
        string projectId, IReadOnlyList<FileChange> changes, string? message, CancellationToken ct)
    {
        ApplyCalls++;
        if (changes.Any(c => c.FileId is not null && (!Files.TryGetValue(c.FileId, out var f) || f.Version != c.BaseVersion)))
        {
            throw new ApiException("A file changed since your base version.") { ResponseStatusCode = 409 };
        }

        var written = new List<RemoteFile>();
        var deleted = new List<string>();
        foreach (var change in changes)
        {
            if (change.Delete)
            {
                Files.Remove(change.FileId!);
                deleted.Add(change.FileId!);
                continue;
            }

            var id = change.FileId ?? Guid.NewGuid().ToString();
            var old = Files.GetValueOrDefault(id);
            var file = new StoredFile(
                change.Path ?? old!.Path,
                (old?.Version ?? 0) + 1,
                change.Content?.ContentHash ?? old!.ContentHash,
                change.Content?.Blob ?? old!.Blob);
            Files[id] = file;
            written.Add(new RemoteFile(id, file.Path, file.Version, file.ContentHash));
        }

        return Task.FromResult(new AppliedChanges(written, deleted));
    }

    public Task<List<FileVersion>> ListVersionsAsync(string projectId, string fileId, CancellationToken ct) =>
        throw new NotSupportedException();

    public Task<EncryptedBlob> GetVersionAsync(string projectId, string fileId, int version, CancellationToken ct) =>
        throw new NotSupportedException();
}

internal sealed class MemorySyncStateStore : ISyncStateStore
{
    private SyncStateFile? state;

    public SyncStateFile Load(ProjectLink link) => state ??= new SyncStateFile { ProjectId = link.ProjectId, Root = link.Root };

    public void Save(ProjectLink link, SyncStateFile saved) => state = saved;
}

/// <summary>Offers every file under the root, skipping the git ignore check.</summary>
internal sealed class AllFilesScanner : ILocalFileScanner
{
    public IReadOnlyList<string> FindCandidates(string root, IReadOnlyList<string> ignoreGlobs) =>
        Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
            .Select(f => Path.GetRelativePath(root, f).Replace('\\', '/'))
            .Order(StringComparer.Ordinal)
            .ToList();
}

internal sealed class MemoryCredentialStore(StoredCredentials? credentials) : ICredentialStore
{
    public StoredCredentials? Load() => credentials;

    public void Save(StoredCredentials saved) => credentials = saved;

    public void Delete() => credentials = null;
}

internal sealed class FixedConfigService(string server) : IConfigService
{
    private readonly AppConfigData config = new() { Server = server };

    public AppConfigData Load() => config;

    public void SetServer(string url) => config.Server = url;
}

/// <summary>A temp folder deleted on dispose.</summary>
internal sealed class TempDir : IDisposable
{
    public string Path { get; } = Directory.CreateTempSubdirectory("depvault-test-").FullName;

    public string Write(string relativePath, string content)
    {
        var full = System.IO.Path.Combine(Path, relativePath);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content);
        return full;
    }

    public string Read(string relativePath) => File.ReadAllText(System.IO.Path.Combine(Path, relativePath));

    public bool Exists(string relativePath) => File.Exists(System.IO.Path.Combine(Path, relativePath));

    public void Dispose()
    {
        try
        {
            Directory.Delete(Path, recursive: true);
        }
        catch (IOException)
        {
            // Best-effort temp cleanup.
        }
    }
}

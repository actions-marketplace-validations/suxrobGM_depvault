using DepVault.Cli.Auth;
using Change = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Changes.ChangesPostRequestBody_changes;
using ChangeContent = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Changes.ChangesPostRequestBody_changes_content;
using ChangesBody = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Changes.ChangesPostRequestBody;
using DownloadBody = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Download.DownloadPostRequestBody;

namespace DepVault.Cli.Services.Sync;

/// <summary>Client-encrypted file content, as the server stores it.</summary>
public sealed record EncryptedBlob(string Ciphertext, string Iv, string AuthTag);

public sealed record FileContent(EncryptedBlob Blob, string ContentHash, int FileSize, bool IsBinary);

/// <summary>A create (no id), update or move (id + base version + content/path), or delete.</summary>
public sealed record FileChange(string? FileId, int? BaseVersion, string? Path, FileContent? Content, bool Delete = false);

public sealed record AppliedChanges(List<RemoteFile> Files, List<string> DeletedIds);

public sealed record FileVersion(
    int Version, string Path, string ContentHash, int FileSize, bool IsBinary, string? Message, string Author,
    DateTimeOffset? Date);

/// <summary>The project file endpoints, in the CLI's own types.</summary>
public interface IRepoFilesApi
{
    Task<List<RemoteFile>> ListAsync(string projectId, CancellationToken ct);

    Task<Dictionary<string, EncryptedBlob>> DownloadAsync(string projectId, IEnumerable<string> fileIds, CancellationToken ct);

    /// <summary>Applies one atomic batch; 409 when any base version is stale.</summary>
    Task<AppliedChanges> ApplyAsync(string projectId, IReadOnlyList<FileChange> changes, string? message, CancellationToken ct);

    /// <summary>Every version of a file, newest (current) first.</summary>
    Task<List<FileVersion>> ListVersionsAsync(string projectId, string fileId, CancellationToken ct);

    Task<EncryptedBlob> GetVersionAsync(string projectId, string fileId, int version, CancellationToken ct);
}

public sealed class RepoFilesApi(IApiClientFactory clientFactory) : IRepoFilesApi
{
    /// <summary>Server cap on files per download or change request.</summary>
    public const int MaxFilesPerRequest = 50;

    public async Task<List<RemoteFile>> ListAsync(string projectId, CancellationToken ct)
    {
        var listing = await Files(projectId).GetAsync(cancellationToken: ct);
        return (listing?.Items ?? [])
            .Select(f => new RemoteFile(f.Id!, f.Path!, f.Version ?? 0, f.ContentHash ?? ""))
            .ToList();
    }

    public async Task<Dictionary<string, EncryptedBlob>> DownloadAsync(
        string projectId, IEnumerable<string> fileIds, CancellationToken ct)
    {
        var result = new Dictionary<string, EncryptedBlob>(StringComparer.Ordinal);
        foreach (var chunk in fileIds.Distinct().Chunk(MaxFilesPerRequest))
        {
            var response = await Files(projectId).Download.PostAsync(
                new DownloadBody { FileIds = chunk.Select(id => (Guid?)Guid.Parse(id)).ToList() }, cancellationToken: ct);

            foreach (var item in response?.Items ?? [])
            {
                result[item.Id!] = new EncryptedBlob(item.EncryptedContent!, item.Iv!, item.AuthTag!);
            }
        }

        return result;
    }

    public async Task<AppliedChanges> ApplyAsync(
        string projectId, IReadOnlyList<FileChange> changes, string? message, CancellationToken ct)
    {
        var response = await Files(projectId).Changes.PostAsync(
            new ChangesBody { Changes = changes.Select(ToRequest).ToList(), Message = message }, cancellationToken: ct);

        return new AppliedChanges(
            (response?.Files ?? []).Select(f => new RemoteFile(f.Id!, f.Path!, f.Version ?? 0, f.ContentHash ?? "")).ToList(),
            response?.DeletedIds ?? []);
    }

    public async Task<List<FileVersion>> ListVersionsAsync(string projectId, string fileId, CancellationToken ct)
    {
        var response = await Files(projectId)[Guid.Parse(fileId)].Versions.GetAsync(cancellationToken: ct);
        return (response?.Items ?? [])
            .Select(v => new FileVersion(v.Version ?? 0, v.Path!, v.ContentHash ?? "", v.FileSize ?? 0,
                v.IsBinary ?? false, v.Message, v.ChangedBy?.Name ?? "", v.CreatedAt))
            .ToList();
    }

    public async Task<EncryptedBlob> GetVersionAsync(string projectId, string fileId, int version, CancellationToken ct)
    {
        var v = await Files(projectId)[Guid.Parse(fileId)].Versions[version].GetAsync(cancellationToken: ct);
        return new EncryptedBlob(v!.EncryptedContent!, v.Iv!, v.AuthTag!);
    }

    private ApiClient.Api.Projects.Item.Files.FilesRequestBuilder Files(string projectId) =>
        clientFactory.Create().Api.Projects[projectId].Files;

    private static Change ToRequest(FileChange c) => new()
    {
        FileId = c.FileId is null ? null : Guid.Parse(c.FileId),
        BaseVersion = c.BaseVersion,
        Path = c.Path,
        Delete = c.Delete ? true : null,
        Content = c.Content is null
            ? null
            : new ChangeContent
            {
                EncryptedContent = c.Content.Blob.Ciphertext,
                Iv = c.Content.Blob.Iv,
                AuthTag = c.Content.Blob.AuthTag,
                ContentHash = c.Content.ContentHash,
                FileSize = c.Content.FileSize,
                IsBinary = c.Content.IsBinary
            }
    };
}

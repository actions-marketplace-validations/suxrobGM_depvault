using System.Security.Cryptography;
using DepVault.Cli.Services.Sync;
using Microsoft.Kiota.Abstractions;

namespace DepVault.Cli.Tests.Services;

/// <summary>Push/pull/purge against an in-memory server: what reaches the server, the disk and the sync base.</summary>
public sealed class SyncServiceTests : IDisposable
{
    private readonly TempDir repo = new();
    private readonly FakeFilesApi server = new();
    private readonly MemorySyncStateStore state = new();
    private readonly byte[] dek = RandomNumberGenerator.GetBytes(32);
    private readonly SyncService sync;
    private readonly ProjectLink link;

    public SyncServiceTests()
    {
        sync = new SyncService(server, new AllFilesScanner(), state);
        link = new ProjectLink(repo.Path, "project", "Project", []);
    }

    public void Dispose() => repo.Dispose();

    private Task<SyncSnapshot> LoadAsync() => sync.LoadAsync(link, dek, [], CancellationToken.None);

    private async Task PushAllAsync()
    {
        var snapshot = await LoadAsync();
        await sync.PushAsync(snapshot, snapshot.Entries.Where(e => e.IsLocalChange).ToList(), null, CancellationToken.None);
    }

    private static SyncEntry Single(SyncSnapshot snapshot, SyncKind kind) => Assert.Single(snapshot.Entries, e => e.Kind == kind);

    [Fact]
    public async Task Push_Then_Load_Is_InSync()
    {
        repo.Write(".env", "A=1");

        await PushAllAsync();

        Assert.Single(server.Files);
        Assert.All((await LoadAsync()).Entries, e => Assert.Equal(SyncKind.InSync, e.Kind));
    }

    [Fact]
    public async Task Pull_Writes_Decrypted_Content_From_Another_Machine()
    {
        repo.Write(".env", "A=1");
        await PushAllAsync();

        using var other = new TempDir();
        var otherLink = link with { Root = other.Path };
        var otherSync = new SyncService(server, new AllFilesScanner(), new MemorySyncStateStore());
        var snapshot = await otherSync.LoadAsync(otherLink, dek, [], CancellationToken.None);
        var result = await otherSync.PullAsync(snapshot, snapshot.Entries.Where(e => e.IsRemoteChange).ToList(), CancellationToken.None);

        Assert.Equal(1, result.Applied);
        Assert.Equal("A=1", other.Read(".env"));
    }

    [Fact]
    public async Task Local_Edit_Is_Pushed_As_A_New_Version()
    {
        repo.Write(".env", "A=1");
        await PushAllAsync();
        repo.Write(".env", "A=2");

        var snapshot = await LoadAsync();
        await sync.PushAsync(snapshot, [Single(snapshot, SyncKind.Modified)], "edit", CancellationToken.None);

        Assert.Equal(2, server.Files.Values.Single().Version);
        Assert.All((await LoadAsync()).Entries, e => Assert.Equal(SyncKind.InSync, e.Kind));
    }

    [Fact]
    public async Task Rename_Moves_The_Server_File_Without_Reuploading()
    {
        repo.Write(".env", "A=1");
        await PushAllAsync();
        var id = server.Files.Keys.Single();
        File.Move(Path.Combine(repo.Path, ".env"), Path.Combine(repo.Path, ".env.local"));

        var snapshot = await LoadAsync();
        await sync.PushAsync(snapshot, [Single(snapshot, SyncKind.Renamed)], null, CancellationToken.None);

        Assert.Equal(".env.local", server.Files[id].Path);
    }

    [Fact]
    public async Task Stale_Base_Is_Rejected_And_Nothing_Changes()
    {
        repo.Write(".env", "A=1");
        await PushAllAsync();
        var id = server.Files.Keys.Single();
        repo.Write(".env", "A=2");
        var snapshot = await LoadAsync();
        server.Files[id] = server.Files[id] with { Version = 5 };

        await Assert.ThrowsAsync<ApiException>(() =>
            sync.PushAsync(snapshot, [Single(snapshot, SyncKind.Modified)], null, CancellationToken.None));

        Assert.Equal(5, server.Files[id].Version);
    }

    [Fact]
    public async Task Server_Deletion_Removes_The_Local_Copy_Only_When_Pulled()
    {
        repo.Write(".env", "A=1");
        await PushAllAsync();
        server.Files.Clear();

        var snapshot = await LoadAsync();
        var deletion = Single(snapshot, SyncKind.DeletedOnServer);
        Assert.True(repo.Exists(".env"));

        await sync.PullAsync(snapshot, [deletion], CancellationToken.None);

        Assert.False(repo.Exists(".env"));
        Assert.Empty((await LoadAsync()).Entries);
    }

    [Fact]
    public async Task Base_Is_Saved_For_Batches_Applied_Before_A_Failure()
    {
        for (var i = 0; i < RepoFilesApi.MaxFilesPerRequest + 1; i++)
        {
            repo.Write($"secrets/{i:D3}.env", $"V={i}");
        }

        await PushAllAsync();
        repo.Write("secrets/000.env", "changed");
        repo.Write("secrets/050.env", "changed");
        var snapshot = await LoadAsync();
        var lastId = server.Files.Single(f => f.Value.Path == "secrets/050.env").Key;
        server.Files[lastId] = server.Files[lastId] with { Version = 9 };

        var modified = snapshot.Entries.Where(e => e.Kind == SyncKind.Modified).ToList();
        var padding = snapshot.Entries.Where(e => e.Kind == SyncKind.InSync).Take(RepoFilesApi.MaxFilesPerRequest - 1)
            .Select(e => e with { Kind = SyncKind.Modified });
        await Assert.ThrowsAsync<ApiException>(() =>
            sync.PushAsync(snapshot, [modified[0], .. padding, modified[1]], null, CancellationToken.None));

        var after = await LoadAsync();
        Assert.Equal(SyncKind.InSync, after.Entries.Single(e => e.Path == "secrets/000.env").Kind);
        Assert.Equal(SyncKind.Conflict, after.Entries.Single(e => e.Path == "secrets/050.env").Kind);
    }

    [Fact]
    public async Task Purge_Deletes_Local_Copies_And_Pull_Restores_Them()
    {
        repo.Write(".env", "A=1");
        await PushAllAsync();

        var snapshot = await LoadAsync();
        sync.Purge(snapshot, snapshot.Entries);
        Assert.False(repo.Exists(".env"));

        snapshot = await LoadAsync();
        await sync.PullAsync(snapshot, [Single(snapshot, SyncKind.NewOnServer)], CancellationToken.None);
        Assert.Equal("A=1", repo.Read(".env"));
    }
}

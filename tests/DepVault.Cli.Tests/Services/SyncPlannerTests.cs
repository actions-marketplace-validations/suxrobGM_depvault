using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Tests.Services;

public class SyncPlannerTests
{
    private static RemoteFile Remote(string id, string path, int version, string hash) => new(id, path, version, hash);

    private static SyncedFile Synced(string path, int version, string hash) =>
        new() { Path = path, Version = version, ContentHash = hash };

    private static List<SyncEntry> Plan(
        RemoteFile[] remote,
        Dictionary<string, SyncedFile> synced,
        Dictionary<string, string> local,
        params string[] candidates)
    {
        return SyncPlanner.Plan(remote, synced, local, candidates);
    }

    private static SyncEntry Single(List<SyncEntry> entries) => Assert.Single(entries);

    [Fact]
    public void Unchanged_File_Is_InSync()
    {
        var entry = Single(Plan(
            [Remote("1", ".env", 1, "a")],
            new() { ["1"] = Synced(".env", 1, "a") },
            new() { [".env"] = "a" }));

        Assert.Equal(SyncKind.InSync, entry.Kind);
    }

    [Fact]
    public void Local_Edit_Is_Modified()
    {
        var entry = Single(Plan(
            [Remote("1", ".env", 1, "a")],
            new() { ["1"] = Synced(".env", 1, "a") },
            new() { [".env"] = "b" }));

        Assert.Equal(SyncKind.Modified, entry.Kind);
        Assert.Equal("b", entry.LocalHash);
    }

    [Fact]
    public void Server_Edit_With_Unchanged_Local_Is_Behind()
    {
        var entry = Single(Plan(
            [Remote("1", ".env", 2, "b")],
            new() { ["1"] = Synced(".env", 1, "a") },
            new() { [".env"] = "a" }));

        Assert.Equal(SyncKind.Behind, entry.Kind);
        Assert.Null(entry.FromPath);
    }

    [Fact]
    public void Server_Move_Is_Behind_With_FromPath()
    {
        var entry = Single(Plan(
            [Remote("1", "apps/api/.env.dev", 2, "a")],
            new() { ["1"] = Synced(".env.dev", 1, "a") },
            new() { [".env.dev"] = "a" }));

        Assert.Equal(SyncKind.Behind, entry.Kind);
        Assert.Equal("apps/api/.env.dev", entry.Path);
        Assert.Equal(".env.dev", entry.FromPath);
    }

    [Fact]
    public void Both_Sides_Changed_Is_Conflict()
    {
        var entry = Single(Plan(
            [Remote("1", ".env", 2, "b")],
            new() { ["1"] = Synced(".env", 1, "a") },
            new() { [".env"] = "c" }));

        Assert.Equal(SyncKind.Conflict, entry.Kind);
        Assert.Equal("changed locally and on server", entry.Reason);
    }

    [Fact]
    public void Both_Sides_Made_The_Same_Change_Is_InSync()
    {
        var entry = Single(Plan(
            [Remote("1", ".env", 2, "b")],
            new() { ["1"] = Synced(".env", 1, "a") },
            new() { [".env"] = "b" }));

        Assert.Equal(SyncKind.InSync, entry.Kind);
    }

    [Fact]
    public void Missing_Locally_Is_Deleted()
    {
        var entry = Single(Plan(
            [Remote("1", "apps/bot/.env", 1, "a")],
            new() { ["1"] = Synced("apps/bot/.env", 1, "a") },
            new()));

        Assert.Equal(SyncKind.Deleted, entry.Kind);
    }

    [Fact]
    public void Deleted_Locally_But_Changed_On_Server_Is_Conflict()
    {
        var entry = Single(Plan(
            [Remote("1", ".env", 2, "b")],
            new() { ["1"] = Synced(".env", 1, "a") },
            new()));

        Assert.Equal(SyncKind.Conflict, entry.Kind);
        Assert.Equal("deleted locally, changed on server", entry.Reason);
    }

    [Fact]
    public void Local_Rename_With_Same_Content_Is_Renamed()
    {
        var entry = Single(Plan(
            [Remote("1", ".env.dev", 1, "a")],
            new() { ["1"] = Synced(".env.dev", 1, "a") },
            new() { [".env.development"] = "a" },
            ".env.development"));

        Assert.Equal(SyncKind.Renamed, entry.Kind);
        Assert.Equal(".env.dev", entry.FromPath);
        Assert.Equal(".env.development", entry.Path);
        Assert.Equal("1", entry.Remote!.Id);
    }

    [Fact]
    public void Rename_Plus_Edit_Is_Delete_And_New()
    {
        var entries = Plan(
            [Remote("1", ".env.dev", 1, "a")],
            new() { ["1"] = Synced(".env.dev", 1, "a") },
            new() { [".env.development"] = "changed" },
            ".env.development");

        Assert.Equal([SyncKind.Deleted, SyncKind.Untracked], entries.Select(e => e.Kind).ToArray());
    }

    [Fact]
    public void Ambiguous_Rename_Targets_Are_Not_Paired()
    {
        var entries = Plan(
            [Remote("1", ".env", 1, "a")],
            new() { ["1"] = Synced(".env", 1, "a") },
            new() { ["a/.env"] = "a", ["b/.env"] = "a" },
            "a/.env", "b/.env");

        Assert.DoesNotContain(entries, e => e.Kind == SyncKind.Renamed);
    }

    [Fact]
    public void Candidate_Not_On_Server_Is_Untracked()
    {
        var entry = Single(Plan([], new(), new() { ["apps/shield/.env"] = "x" }, "apps/shield/.env"));

        Assert.Equal(SyncKind.Untracked, entry.Kind);
    }

    [Fact]
    public void Server_File_Missing_On_New_Machine_Is_NewOnServer()
    {
        var entry = Single(Plan([Remote("1", "deploy/.env", 3, "a")], new(), new()));

        Assert.Equal(SyncKind.NewOnServer, entry.Kind);
    }

    [Fact]
    public void Identical_Copy_On_New_Machine_Is_Adopted_As_InSync()
    {
        var entry = Single(Plan([Remote("1", "deploy/.env", 3, "a")], new(), new() { ["deploy/.env"] = "a" }, "deploy/.env"));

        Assert.Equal(SyncKind.InSync, entry.Kind);
    }

    [Fact]
    public void Different_Copy_On_New_Machine_Is_Conflict_Not_Untracked()
    {
        var entry = Single(Plan([Remote("1", "deploy/.env", 3, "a")], new(), new() { ["deploy/.env"] = "old" }, "deploy/.env"));

        Assert.Equal(SyncKind.Conflict, entry.Kind);
        Assert.Equal("local copy differs from server", entry.Reason);
    }

    [Fact]
    public void Deleted_On_Server_With_Unchanged_Local_Is_DeletedOnServer()
    {
        var entry = Single(Plan([], new() { ["1"] = Synced(".env", 1, "a") }, new() { [".env"] = "a" }, ".env"));

        Assert.Equal(SyncKind.DeletedOnServer, entry.Kind);
    }

    [Fact]
    public void Deleted_On_Server_With_Local_Edit_Is_Conflict()
    {
        var entry = Single(Plan([], new() { ["1"] = Synced(".env", 1, "a") }, new() { [".env"] = "b" }, ".env"));

        Assert.Equal(SyncKind.Conflict, entry.Kind);
    }

    [Fact]
    public void Deleted_On_Both_Sides_Reports_Nothing()
    {
        Assert.Empty(Plan([], new() { ["1"] = Synced(".env", 1, "a") }, new()));
    }

    [Fact]
    public void Server_Move_Onto_A_Different_Local_File_Is_Conflict()
    {
        var entries = Plan(
            [Remote("1", "b/.env", 2, "a")],
            new() { ["1"] = Synced("a/.env", 1, "a") },
            new() { ["a/.env"] = "a", ["b/.env"] = "other" },
            "a/.env", "b/.env");

        var entry = Assert.Single(entries);
        Assert.Equal(SyncKind.Conflict, entry.Kind);
    }

    [Fact]
    public void Push_And_Pull_Sets_Are_Disjoint()
    {
        foreach (var kind in Enum.GetValues<SyncKind>())
        {
            var entry = new SyncEntry(kind, "x");
            Assert.False(entry.IsLocalChange && entry.IsRemoteChange);
        }
    }
}

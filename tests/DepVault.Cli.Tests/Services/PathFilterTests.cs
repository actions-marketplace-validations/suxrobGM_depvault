using DepVault.Cli.Common;
using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Tests.Services;

public sealed class PathFilterTests : IDisposable
{
    private readonly TempDir repo = new();

    public void Dispose() => repo.Dispose();

    private PathFilter Resolve(string cwd, params string[] args) => PathFilter.Resolve(repo.Path, cwd, args);

    [Fact]
    public void No_Args_Matches_Everything()
    {
        var filter = Resolve(repo.Path);

        Assert.True(filter.IsEmpty);
        Assert.True(filter.Matches("any/file.env"));
    }

    [Fact]
    public void Existing_File_Is_Explicit_Literal_And_Anchored()
    {
        repo.Write(".env", "A=1");

        var filter = Resolve(repo.Path, ".env");

        Assert.Equal([".env"], filter.ExplicitFiles);
        Assert.Contains(".env", filter.Literals);
        Assert.True(filter.Matches(".env"));
        Assert.False(filter.Matches("apps/api/.env"));
    }

    [Fact]
    public void Paths_Resolve_From_The_Current_Folder()
    {
        repo.Write("apps/api/.env", "A=1");

        var filter = Resolve(Path.Combine(repo.Path, "apps", "api"), ".env");

        Assert.Equal(["apps/api/.env"], filter.ExplicitFiles);
    }

    [Fact]
    public void Folder_Matches_Everything_Under_It()
    {
        repo.Write("deploy/prod.env", "A=1");

        var filter = Resolve(repo.Path, "deploy");

        Assert.True(filter.Matches("deploy/prod.env"));
        Assert.False(filter.Matches("other/prod.env"));
        Assert.Empty(filter.Literals);
    }

    [Fact]
    public void Missing_Literal_Stays_Anchored_So_A_Deletion_Can_Be_Named()
    {
        var filter = Resolve(repo.Path, "gone.env");

        Assert.Empty(filter.ExplicitFiles);
        Assert.Contains("gone.env", filter.Literals);
        Assert.False(filter.Matches("sub/gone.env"));
    }

    [Fact]
    public void Wildcard_Is_A_Glob_And_Never_A_Literal()
    {
        var filter = Resolve(repo.Path, "*.env");

        Assert.True(filter.Matches("sub/a.env"));
        Assert.Empty(filter.Literals);
    }

    [Fact]
    public void Rename_Matches_By_Either_Path()
    {
        var filter = Resolve(repo.Path, "old.env");

        Assert.True(filter.Matches(new SyncEntry(SyncKind.Renamed, "new.env", FromPath: "old.env")));
    }

    [Fact]
    public void Path_Outside_The_Root_Is_A_Usage_Error()
    {
        var ex = Assert.Throws<CliException>(() => Resolve(repo.Path, "../elsewhere.env"));

        Assert.Equal(ExitCodes.Usage, ex.ExitCode);
    }
}

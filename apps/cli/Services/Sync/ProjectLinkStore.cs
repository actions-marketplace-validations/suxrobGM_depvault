using System.Text.Json;
using System.Text.Json.Serialization;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Services.Sync;

/// <summary>
/// Contents of <c>.depvault.json</c>, committed at the repo root: which project this repo syncs with,
/// plus globs of files never to offer for tracking. Holds no secrets.
/// </summary>
public sealed class ProjectLinkFile
{
    [JsonPropertyName("project")]
    public string Project { get; set; } = "";

    [JsonPropertyName("name")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Name { get; set; }

    [JsonPropertyName("ignore")]
    public List<string> Ignore { get; set; } = [];
}

/// <summary>A resolved link: the folder holding <c>.depvault.json</c> is the root all paths are relative to.</summary>
public sealed record ProjectLink(string Root, string ProjectId, string? ProjectName, IReadOnlyList<string> Ignore)
{
    /// <summary>The project name when <c>.depvault.json</c> has one, else its ID.</summary>
    public string DisplayName => ProjectName ?? ProjectId;
}

public interface IProjectLinkStore
{
    /// <summary>The nearest <c>.depvault.json</c> at or above the current directory, or null.</summary>
    ProjectLink? Find();

    void Save(string root, ProjectLinkFile file);

    /// <summary>Adds an ignore glob to the link file (no-op when already present).</summary>
    void AddIgnore(ProjectLink link, string glob);
}

public sealed class ProjectLinkStore : IProjectLinkStore
{
    public const string FileName = ".depvault.json";

    public ProjectLink? Find()
    {
        for (var dir = new DirectoryInfo(Directory.GetCurrentDirectory()); dir is not null; dir = dir.Parent)
        {
            var file = Load(dir.FullName);
            if (file is not null)
            {
                return new ProjectLink(dir.FullName, file.Project, file.Name, file.Ignore);
            }
        }

        return null;
    }

    public void Save(string root, ProjectLinkFile file)
    {
        var json = JsonSerializer.Serialize(file, SyncJsonContext.Default.ProjectLinkFile);
        File.WriteAllText(Path.Combine(root, FileName), json + Environment.NewLine);
    }

    public void AddIgnore(ProjectLink link, string glob)
    {
        var file = Load(link.Root) ?? new ProjectLinkFile { Project = link.ProjectId };
        if (!file.Ignore.Contains(glob, StringComparer.Ordinal))
        {
            file.Ignore.Add(glob);
            Save(link.Root, file);
        }
    }

    private static ProjectLinkFile? Load(string dir)
    {
        var path = Path.Combine(dir, FileName);
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var file = JsonSerializer.Deserialize(File.ReadAllText(path), SyncJsonContext.Default.ProjectLinkFile);
            return string.IsNullOrWhiteSpace(file?.Project) ? null : file;
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"{path} is not valid JSON: {ex.Message}");
        }
    }
}

/// <summary>Last state this machine synced for one file: the base for three-way change detection.</summary>
public sealed class SyncedFile
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("version")]
    public int Version { get; set; }

    [JsonPropertyName("contentHash")]
    public string ContentHash { get; set; } = "";
}

public sealed class SyncStateFile
{
    [JsonPropertyName("projectId")]
    public string ProjectId { get; set; } = "";

    [JsonPropertyName("root")]
    public string Root { get; set; } = "";

    /// <summary>Keyed by server file id, so renames keep their base.</summary>
    [JsonPropertyName("files")]
    public Dictionary<string, SyncedFile> Files { get; set; } = [];
}

public interface ISyncStateStore
{
    SyncStateFile Load(ProjectLink link);
    void Save(ProjectLink link, SyncStateFile state);
}

/// <summary>
/// Per-machine sync state in <c>~/.depvault/sync/</c>, one file per (project, checkout folder), so two
/// clones of the same repo on one machine don't share a base. Holds paths, versions and keyed hashes only.
/// </summary>
public sealed class SyncStateStore : ISyncStateStore
{
    private static readonly string Dir = System.IO.Path.Combine(Constants.ConfigDir, "sync");

    public SyncStateFile Load(ProjectLink link)
    {
        var path = PathFor(link);
        if (File.Exists(path))
        {
            try
            {
                var state = JsonSerializer.Deserialize(File.ReadAllText(path), SyncJsonContext.Default.SyncStateFile);
                if (state is not null && state.ProjectId == link.ProjectId)
                {
                    return state;
                }
            }
            catch (JsonException)
            {
                // A corrupt base only costs re-comparing against the server; start fresh.
            }
        }

        return new SyncStateFile { ProjectId = link.ProjectId, Root = link.Root };
    }

    public void Save(ProjectLink link, SyncStateFile state)
    {
        var json = JsonSerializer.Serialize(state, SyncJsonContext.Default.SyncStateFile);
        SecureFileWriter.WriteOwnerOnly(PathFor(link), json);
    }

    private static string PathFor(ProjectLink link)
    {
        var key = $"{link.ProjectId}|{System.IO.Path.GetFullPath(link.Root).ToLowerInvariant()}";
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(key)))[..16].ToLowerInvariant();
        return System.IO.Path.Combine(Dir, $"{hash}.json");
    }
}

[JsonSerializable(typeof(ProjectLinkFile))]
[JsonSerializable(typeof(SyncStateFile))]
[JsonSourceGenerationOptions(WriteIndented = true)]
internal partial class SyncJsonContext : JsonSerializerContext;

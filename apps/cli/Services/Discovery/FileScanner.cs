using DepVault.Cli.Common;

namespace DepVault.Cli.Services;

public record DiscoveredFile(string FullPath, string RelativePath, string FileName);

/// <summary>Finds dependency manifests (package.json, *.csproj, ...) for analysis.</summary>
public interface IFileScanner
{
    List<DiscoveredFile> FindDependencyFiles(string rootPath);
}

public sealed class FileScanner : IFileScanner
{
    public List<DiscoveredFile> FindDependencyFiles(string rootPath)
    {
        var results = new List<DiscoveredFile>();
        var fullRoot = Path.GetFullPath(rootPath);

        try
        {
            var files = Directory.EnumerateFiles(fullRoot, "*", new EnumerationOptions
            {
                RecurseSubdirectories = true,
                IgnoreInaccessible = true,
                MaxRecursionDepth = 10
            });

            foreach (var filePath in files)
            {
                var fileName = Path.GetFileName(filePath);
                if (!IsInExcludedDirectory(filePath, fullRoot) && EcosystemResolver.IsDependencyFile(fileName))
                {
                    results.Add(new DiscoveredFile(filePath, RepoPath.ToRelative(fullRoot, filePath), fileName));
                }
            }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or DirectoryNotFoundException)
        {
        }

        return results.OrderBy(f => f.RelativePath).ToList();
    }

    /// <summary>Drops files under excluded directories (node_modules, .git, ...) to avoid irrelevant suggestions.</summary>
    private static bool IsInExcludedDirectory(string filePath, string rootPath)
    {
        var parts = Path.GetRelativePath(rootPath, filePath)
            .Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (ExcludedDirectories.Names.Contains(parts[i]))
            {
                return true;
            }
        }

        return false;
    }
}

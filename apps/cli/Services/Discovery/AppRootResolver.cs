namespace DepVault.Cli.Services;

/// <summary>
/// Infers a file's owning app: the nearest ancestor up to the repo root containing a project marker
/// (a known dependency file, *.sln, or *.csproj).
/// </summary>
internal static class AppRootResolver
{
    /// <summary>
    /// Returns the marker directory's '/'-separated repo-relative <c>appPath</c> ("" for the root) and its
    /// last segment as <c>appName</c> ("Repository root" for the root). Accepts any path separator.
    /// </summary>
    public static (string appPath, string appName) Resolve(string repoRoot, string fileRelativePath)
    {
        var fullRoot = Path.GetFullPath(repoRoot);
        var normalizedRelative = fileRelativePath.Replace('\\', '/').TrimStart('/');
        var fullFile = Path.GetFullPath(Path.Combine(fullRoot, normalizedRelative));

        var fileDir = new DirectoryInfo(Path.GetDirectoryName(fullFile) ?? fullRoot);
        var rootDir = new DirectoryInfo(fullRoot);

        var dir = fileDir;
        DirectoryInfo? markerDir = null;

        while (dir is not null)
        {
            if (HasProjectMarker(dir.FullName))
            {
                markerDir = dir;
                break;
            }

            if (PathsEqual(dir.FullName, rootDir.FullName))
            {
                break;
            }

            dir = dir.Parent;
        }

        // No marker → repo-root App. Using the file's own directory would mint pseudo-apps for unmarked
        // folders (`config/`, `infra/`); nothing is lost since `relativePath` keeps the full path.
        var chosen = markerDir ?? rootDir;

        return BuildResult(rootDir.FullName, chosen.FullName);
    }

    private static (string appPath, string appName) BuildResult(string repoRoot, string appDirFullPath)
    {
        var relative = Path.GetRelativePath(repoRoot, appDirFullPath).Replace('\\', '/');

        if (relative is "." or "")
        {
            // Fixed name: the checkout folder varies per clone and would churn the App's display name.
            return ("", "Repository root");
        }

        relative = relative.Trim('/');
        var lastSlash = relative.LastIndexOf('/');
        var appName = lastSlash >= 0 ? relative[(lastSlash + 1)..] : relative;

        return (relative, appName);
    }

    /// <summary>True if the directory contains a recognised project/solution marker.</summary>
    private static bool HasProjectMarker(string dirFullPath)
    {
        try
        {
            foreach (var marker in EcosystemResolver.Map.Keys)
            {
                if (File.Exists(Path.Combine(dirFullPath, marker)))
                {
                    return true;
                }
            }

            // .NET project/solution files vary by name → glob the directory.
            if (Directory.EnumerateFiles(dirFullPath, "*.csproj").Any()
                || Directory.EnumerateFiles(dirFullPath, "*.sln").Any())
            {
                return true;
            }
        }
        catch (UnauthorizedAccessException)
        {
        }
        catch (DirectoryNotFoundException)
        {
        }

        return false;
    }

    private static bool PathsEqual(string a, string b)
    {
        return string.Equals(
            a.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
            b.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);
    }
}

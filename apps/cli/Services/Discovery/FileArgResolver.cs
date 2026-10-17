using System.CommandLine;
using DepVault.Cli.Output;
using Spectre.Console;

namespace DepVault.Cli.Services;

/// <summary>Resolves a file path from a <c>--file</c> option or interactive discovery.</summary>
public interface IFileArgResolver
{
    /// <summary>Checks the file exists, printing an error if not.</summary>
    bool RequireFile(string path);

    /// <summary>Returns the validated <c>--file</c> value, else a multi-select over discovered files; empty when nothing resolves.</summary>
    List<DiscoveredFile> ResolveFilesInteractive(
        ParseResult parseResult, Option<string?> fileOpt,
        Func<List<DiscoveredFile>> discoverFiles, string fileTypeLabel);
}

public sealed class FileArgResolver(IOutputFormatter output, IConsolePrompter prompter) : IFileArgResolver
{
    public bool RequireFile(string path)
    {
        if (File.Exists(path))
        {
            return true;
        }

        output.PrintError($"File not found: {path}");
        return false;
    }

    public List<DiscoveredFile> ResolveFilesInteractive(
        ParseResult parseResult, Option<string?> fileOpt,
        Func<List<DiscoveredFile>> discoverFiles, string fileTypeLabel)
    {
        var filePath = parseResult.GetValue(fileOpt);

        if (!string.IsNullOrEmpty(filePath))
        {
            if (!RequireFile(filePath))
            {
                return [];
            }

            var fullPath = Path.GetFullPath(filePath);
            return [new DiscoveredFile(fullPath, filePath, Path.GetFileName(fullPath))];
        }

        if (!prompter.IsInteractive)
        {
            output.PrintError("--file is required in non-interactive mode.");
            return [];
        }

        var discovered = discoverFiles();
        if (discovered.Count == 0)
        {
            output.PrintError($"No {fileTypeLabel} files found in current directory.");
            return [];
        }

        return prompter.MultiSelect($"Select {fileTypeLabel} files", discovered,
            f => Markup.Escape(f.RelativePath));
    }
}

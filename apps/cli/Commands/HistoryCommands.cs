using System.CommandLine;
using System.Text;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary><c>log</c>, <c>diff</c> and <c>restore</c>: a file's version history, decrypted locally.</summary>
public sealed class HistoryCommands(
    Session session,
    ProjectLinker projectLinker,
    DekService dekService,
    IRepoFilesApi filesApi,
    IConsolePrompter prompter,
    Ui ui)
{
    public Command CreateLogCommand()
    {
        var pathArg = new Argument<string>("path") { Description = "File to show the history of" };
        var projectOpt = CliOptions.Project();
        var cmd = new Command("log", "List a file's versions in DepVault, newest first") { pathArg, projectOpt, CliOptions.Json };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var (link, file) = await FindAsync(parseResult.GetValue(projectOpt), parseResult.GetValue(pathArg)!, ct);
            var versions = await filesApi.ListVersionsAsync(link.ProjectId, file.Id, ct);

            if (ui.Json)
            {
                ui.WriteJson(versions.Select(v => new VersionJson(v.Version, v.Path, v.Message, v.Author, v.Date, v.FileSize)).ToList(),
                    CliJsonContext.Default.ListVersionJson);
                return ExitCodes.Ok;
            }

            ui.Table(["VERSION", "DATE", "AUTHOR", "PATH", "MESSAGE"], versions.Select(v => new[]
            {
                v.Version == file.Version ? $"{v.Version} (current)" : v.Version.ToString(),
                v.Date?.LocalDateTime.ToString("g") ?? "", v.Author, v.Path, v.Message ?? ""
            }));
            ui.Hint("Compare with `depvault diff <path> --version <n>`, bring one back with `depvault restore`.");
            return ExitCodes.Ok;
        });

        return cmd;
    }

    public Command CreateDiffCommand()
    {
        var pathArg = new Argument<string>("path") { Description = "File to compare" };
        var versionOpt = VersionOption("Version to compare with (defaults to the current one)");
        var projectOpt = CliOptions.Project();
        var cmd = new Command("diff", "Show how the local file differs from its copy in DepVault") { pathArg, versionOpt, projectOpt };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var (link, file) = await FindAsync(parseResult.GetValue(projectOpt), parseResult.GetValue(pathArg)!, ct);
            var version = parseResult.GetValue(versionOpt) ?? file.Version;
            var server = await DownloadAsync(link, file, version, ct);
            var full = RepoPath.ToFull(link.Root, file.Path);
            var local = File.Exists(full) ? await File.ReadAllBytesAsync(full, ct) : [];

            if (server.AsSpan().SequenceEqual(local))
            {
                ui.Success("No differences.");
                return ExitCodes.Ok;
            }

            if (BinaryDetector.IsBinary(server) || BinaryDetector.IsBinary(local))
            {
                ui.Line("Binary files differ.");
                return ExitCodes.Ok;
            }

            var diff = LineDiff.Unified(
                LineDiff.SplitLines(Encoding.UTF8.GetString(server)), LineDiff.SplitLines(Encoding.UTF8.GetString(local)));
            if (diff is null)
            {
                ui.Line("Files differ (too large to diff line by line).");
                return ExitCodes.Ok;
            }

            ui.Line($"[bold]--- {Markup.Escape(file.Path)} (DepVault v{version})[/]");
            ui.Line($"[bold]+++ {Markup.Escape(file.Path)} (local)[/]");
            foreach (var line in diff)
            {
                var color = line[0] switch { '@' => "cyan1", '-' => "red", '+' => "green", _ => "default" };
                ui.Line($"[{color}]{Markup.Escape(line)}[/]");
            }

            return ExitCodes.Ok;
        });

        return cmd;
    }

    public Command CreateRestoreCommand()
    {
        var pathArg = new Argument<string>("path") { Description = "File to restore" };
        var versionOpt = VersionOption("Version to restore (see 'depvault log')");
        versionOpt.Required = true;
        var projectOpt = CliOptions.Project();
        var yesOpt = CliOptions.Yes("Overwrite the local file without prompting");
        var cmd = new Command("restore", "Write an older version of a file locally (push to make it current)")
        {
            pathArg, versionOpt, projectOpt, yesOpt
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var (link, file) = await FindAsync(parseResult.GetValue(projectOpt), parseResult.GetValue(pathArg)!, ct);
            var version = parseResult.GetValue(versionOpt)!.Value;
            var content = await DownloadAsync(link, file, version, ct);
            var full = RepoPath.ToFull(link.Root, file.Path);

            if (File.Exists(full) && !parseResult.GetValue(yesOpt)
                                  && !(await File.ReadAllBytesAsync(full, ct)).AsSpan().SequenceEqual(content)
                                  && !prompter.ConfirmDestructive($"Overwrite local {file.Path} with version {version}?",
                                      false, "overwrite the local file"))
            {
                return ExitCodes.Ok;
            }

            SecureFileWriter.WriteFileOwnerOnly(full, content);
            ui.Success($"Restored {file.Path} to version {version}.");
            ui.Hint("Run `depvault push` to make it the current version in DepVault.");
            return ExitCodes.Ok;
        });

        return cmd;
    }

    private static Option<int?> VersionOption(string description) => new("--version", "-v") { Description = description };

    /// <summary>The linked project and the stored file at <paramref name="pathArg"/> (relative to the current folder).</summary>
    private async Task<(ProjectLink Link, RemoteFile File)> FindAsync(string? projectId, string pathArg, CancellationToken ct)
    {
        session.RequireUser();
        var link = await projectLinker.ResolveAsync(projectId, ct);
        var path = RepoPath.FromArgument(link.Root, Path.GetFullPath(pathArg), pathArg);

        var files = await ui.SpinAsync("Fetching files...", () => filesApi.ListAsync(link.ProjectId, ct));
        var file = files.FirstOrDefault(f => f.Path == path)
                   ?? throw new CliException($"{path} isn't stored in DepVault. See 'depvault status'.");
        return (link, file);
    }

    private async Task<byte[]> DownloadAsync(ProjectLink link, RemoteFile file, int version, CancellationToken ct)
    {
        var blobTask = filesApi.GetVersionAsync(link.ProjectId, file.Id, version, ct);
        var dek = await dekService.GetAsync(link.ProjectId, ct);
        var blob = await blobTask;
        return VaultCrypto.DecryptBytes(blob.Ciphertext, blob.Iv, blob.AuthTag, dek);
    }
}

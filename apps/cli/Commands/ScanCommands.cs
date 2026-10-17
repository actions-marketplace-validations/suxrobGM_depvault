using System.CommandLine;
using DepVault.Cli.Services.Scan;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Sync;
using DepVault.Cli.Auth;
using Spectre.Console;

namespace DepVault.Cli.Commands;

internal sealed class ScanCommands(
    AuthContext ctx,
    ConsoleRenderer renderer,
    ProjectLinker projectLinker,
    DependencyScanner dependencyScanner,
    SecretLeakScanner secretLeakScanner,
    UntrackedFileReporter untrackedFileReporter,
    IRepositoryLocator repositoryLocator)
{
    public Command CreateScanCommand()
    {
        var pathOpt = new Option<string?>("--path")
        { Description = "Repository root path (defaults to current directory)" };
        var projectOpt = new Option<string?>("--project") { Description = "Project ID" };

        var cmd = new Command("scan", "Scan repository for vulnerable dependencies, leaked secrets and unsynced secret files")
        {
            pathOpt,
            projectOpt
        };

        cmd.SetAction(async (parseResult, cancellationToken) =>
        {
            if (!ctx.RequireAuth())
            {
                return;
            }

            if (!ctx.Prompter.IsInteractive)
            {
                ctx.Output.PrintError(
                    "The scan command requires interactive mode. Use individual commands (analyze, status) for non-interactive usage.");
                return;
            }

            renderer.PrintBanner();
            var repoPath = Path.GetFullPath(parseResult.GetValue(pathOpt) ?? repositoryLocator.FindRepoRoot());

            if (!Directory.Exists(repoPath))
            {
                ctx.Output.PrintError($"Directory not found: {repoPath}");
                return;
            }

            AnsiConsole.MarkupLine($"[cyan1]Scanning:[/] {Markup.Escape(repoPath)}");
            AnsiConsole.WriteLine();

            var link = await projectLinker.ResolveAsync(parseResult.GetValue(projectOpt), cancellationToken);
            if (link is null)
            {
                return;
            }

            var projectId = link.ProjectId;
            var results = new ScanResults();

            renderer.PrintRule("Dependency Analysis");
            await dependencyScanner.RunAsync(projectId, repoPath, results, cancellationToken);

            AnsiConsole.WriteLine();
            renderer.PrintRule("Secret Leak Detection");
            secretLeakScanner.Run(repoPath, results);

            AnsiConsole.WriteLine();
            renderer.PrintRule("Secret Files");
            await untrackedFileReporter.RunAsync(link, results, cancellationToken);

            AnsiConsole.WriteLine();
            ScanSummary.Print(results, projectId, ctx.Config.Load().Server);
        });

        return cmd;
    }
}

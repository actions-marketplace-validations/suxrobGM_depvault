using System.CommandLine;
using DepVault.Cli.Services.Scan;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using DepVault.Cli.Services.ProjectResolution;
using DepVault.Cli.Auth;
using Spectre.Console;

namespace DepVault.Cli.Commands;

internal sealed class ScanCommands(
    AuthContext ctx,
    ConsoleRenderer renderer,
    IProjectContextResolver projectContextResolver,
    DependencyScanner dependencyScanner,
    EnvFileScanner envFileScanner,
    SecretLeakScanner secretLeakScanner,
    SecretFileScanner secretFileScanner,
    DekService dekService,
    IRepositoryLocator repositoryLocator)
{
    public Command CreateScanCommand()
    {
        var pathOpt = new Option<string?>("--path")
        { Description = "Repository root path (defaults to current directory)" };
        var projectOpt = new Option<string?>("--project") { Description = "Project ID" };

        var cmd = new Command("scan", "Scan repository for dependencies, env files, and secrets")
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
                    "The scan command requires interactive mode. Use individual commands (analyze, push) for non-interactive usage.");
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

            var resolution = await projectContextResolver.ResolveAsync(
                parseResult.GetValue(projectOpt),
                ResolutionPolicy.AllowInteractive | ResolutionPolicy.AllowCreate | ResolutionPolicy.ConfirmActive,
                cancellationToken);
            if (resolution is null)
            {
                return;
            }

            var projectId = resolution.ProjectId;

            var results = new ScanResults();

            // Resolve the DEK lazily and at most once, so the password is only asked if a scanner needs it.
            var dek = new Lazy<Task<byte[]?>>(
                () => dekService.CollectPasswordAndResolveAsync(projectId, cancellationToken));

            renderer.PrintRule("Dependency Analysis");
            await dependencyScanner.RunAsync(projectId, repoPath, results, cancellationToken);

            AnsiConsole.WriteLine();
            renderer.PrintRule("Environment Files");
            await envFileScanner.RunAsync(projectId, repoPath, results, dek, cancellationToken);

            AnsiConsole.WriteLine();
            renderer.PrintRule("Secret Leak Detection");
            secretLeakScanner.Run(repoPath, results);

            AnsiConsole.WriteLine();
            renderer.PrintRule("Secret Files");
            await secretFileScanner.RunAsync(projectId, repoPath, results, dek, cancellationToken);

            AnsiConsole.WriteLine();
            ScanSummary.Print(results, projectId, ctx.Config.Load().Server);
        });

        return cmd;
    }
}

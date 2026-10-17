using System.CommandLine;
using DepVault.Cli.ApiClient.Api.Projects.Item.Analyses;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Sync;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary><c>analyze</c>: uploads dependency manifests for vulnerability, license and freshness analysis.</summary>
public sealed class AnalysisCommands(
    Session session,
    ProjectLinker projectLinker,
    AnalysisClient analysisClient,
    IFileScanner fileScanner,
    IRepositoryLocator repositoryLocator,
    IConsolePrompter prompter,
    Ui ui)
{
    public Command CreateAnalyzeCommand()
    {
        var fileOpt = new Option<string?>("--file") { Description = "Dependency file (default: every one found, or pick interactively)" };
        var projectOpt = CliOptions.Project();
        var ecosystemOpt = new Option<string?>("--ecosystem")
        {
            Description = $"Ecosystem, when the file name doesn't tell ({string.Join(", ", Enum.GetNames<AnalysesPostRequestBody_ecosystem>())})"
        };
        var cmd = new Command("analyze", "Analyze dependency files for vulnerabilities, licenses and updates")
        {
            fileOpt, projectOpt, ecosystemOpt, CliOptions.Json
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            session.RequireUser();
            var explicitEcosystem = ParseEcosystem(parseResult.GetValue(ecosystemOpt));
            var link = await projectLinker.ResolveAsync(parseResult.GetValue(projectOpt), ct);
            var files = SelectFiles(parseResult.GetValue(fileOpt));
            var results = new List<AnalysisJson>();
            var failures = 0;

            foreach (var file in files)
            {
                var ecosystem = explicitEcosystem ?? EcosystemResolver.Resolve(file.FileName);
                if (ecosystem is null)
                {
                    ui.Error($"Can't tell the ecosystem of {file.RelativePath}; pass --ecosystem.");
                    failures++;
                    continue;
                }

                try
                {
                    var result = await ui.SpinAsync($"Analyzing {file.RelativePath} ({ecosystem})...",
                        () => analysisClient.AnalyzeFileAsync(link.ProjectId, file, ecosystem.Value, ct));
                    results.Add(result.ToJson(file.RelativePath));
                    Print(file.RelativePath, result);
                }
                catch (ApiException ex) when (!ApiErrors.IsAuth(ex))
                {
                    ui.Error($"{file.RelativePath}: {ex.Message}");
                    failures++;
                }
            }

            if (ui.Json)
            {
                ui.WriteJson(results, CliJsonContext.Default.ListAnalysisJson);
            }

            return failures > 0 ? ExitCodes.Error : ExitCodes.Ok;
        });

        return cmd;
    }

    private static AnalysesPostRequestBody_ecosystem? ParseEcosystem(string? name)
    {
        if (name is null)
        {
            return null;
        }

        return Enum.TryParse<AnalysesPostRequestBody_ecosystem>(name, ignoreCase: true, out var ecosystem)
            ? ecosystem
            : throw new CliException(
                $"Unknown ecosystem '{name}'. Valid: {string.Join(", ", Enum.GetNames<AnalysesPostRequestBody_ecosystem>())}",
                ExitCodes.Usage);
    }

    private List<DiscoveredFile> SelectFiles(string? filePath)
    {
        if (!string.IsNullOrEmpty(filePath))
        {
            var full = Path.GetFullPath(filePath);
            return File.Exists(full)
                ? [new DiscoveredFile(full, filePath, Path.GetFileName(full))]
                : throw new CliException($"File not found: {filePath}", ExitCodes.Usage);
        }

        var discovered = fileScanner.FindDependencyFiles(repositoryLocator.FindRepoRoot());
        if (discovered.Count == 0)
        {
            throw new CliException("No dependency files found; pass --file.");
        }

        return prompter.IsInteractive
            ? prompter.MultiSelect("Analyze which files?", discovered, f => Markup.Escape(f.RelativePath))
            : discovered;
    }

    private void Print(string file, AnalysisResult result)
    {
        ui.Line();
        ui.Line($"[bold]{Markup.Escape(file)}[/] [grey]· health {result.HealthScore:F0}%[/]");
        if (result.Dependencies.Count == 0)
        {
            ui.Hint("No dependencies found.");
            return;
        }

        ui.Table(["PACKAGE", "VERSION", "LATEST", "STATUS", "LICENSE", "VULNS"], result.Dependencies.Select(d => new[]
        {
            d.Name ?? "", d.CurrentVersion ?? "", d.LatestVersion ?? "", d.Status ?? "", d.License ?? "",
            (d.Vulnerabilities?.Count ?? 0).ToString()
        }));
    }
}

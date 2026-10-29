using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Scan;
using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>
/// <c>scan</c>: leaked secrets (local, works in CI), plus dependency vulnerabilities and unsynced secret files when
/// logged in with a linked project. <c>--fail-on</c> turns it into a CI gate.
/// </summary>
public sealed class ScanCommands(
    Session session,
    IProjectLinkStore linkStore,
    ProjectLinker projectLinker,
    RepoScanner scanner,
    IRepositoryLocator repositoryLocator,
    IConfigService configService,
    IConsolePrompter prompter,
    Ui ui)
{
    private const int MaxLeakRows = 50;

    public Command CreateScanCommand()
    {
        var pathOpt = new Option<string?>("--path") { Description = "Repository root (defaults to the current repository)" };
        var projectOpt = CliOptions.Project();
        var failOnOpt = new Option<string>("--fail-on")
        {
            Description = "Exit with code 4 when a leak or vulnerability is at least this severe",
            DefaultValueFactory = _ => "none"
        };
        failOnOpt.AcceptOnlyFromAmong("none", "low", "medium", "high", "critical");
        var cmd = new Command("scan", "Scan for leaked secrets, vulnerable dependencies and unsynced secret files")
        {
            pathOpt, projectOpt, failOnOpt, CliOptions.Json
        };

        cmd.SetAction(async (parseResult, ct) =>
        {
            var repoPath = Path.GetFullPath(parseResult.GetValue(pathOpt) ?? repositoryLocator.FindRepoRoot());
            if (!Directory.Exists(repoPath))
            {
                throw new CliException($"Directory not found: {repoPath}", ExitCodes.Usage);
            }

            var link = await ResolveLinkAsync(parseResult.GetValue(projectOpt), ct);
            var report = await ui.SpinAsync($"Scanning {repoPath}...", () => scanner.ScanAsync(repoPath, link, ct));
            var threshold = RepoScanner.ParseSeverity(parseResult.GetValue(failOnOpt));
            var failed = threshold != Severity.None && Severities(report).Any(s => s >= threshold);

            if (ui.Json)
            {
                ui.WriteJson(ToJson(report, failed), CliJsonContext.Default.ScanJson);
                return failed ? ExitCodes.Findings : ExitCodes.Ok;
            }

            PrintLeaks(report.Leaks);
            if (link is not null)
            {
                PrintAnalyses(report.Analyses);
                PrintUnsynced(report.UnsyncedFiles);
                ui.Line();
                ui.Hint($"Full results: {configService.Load().Server}/projects/{link.ProjectId}");
            }

            if (report.Leaks.Count > 0 && prompter.Confirm("Add the files with leaked secrets to .gitignore?", false))
            {
                ui.Success($"Added {RepoScanner.AddToGitignore(repoPath, report.Leaks.Select(l => l.FilePath))} entries to .gitignore.");
            }

            if (failed)
            {
                ui.Error($"Found issues at or above '{threshold.ToString().ToLowerInvariant()}' severity.");
            }

            return failed ? ExitCodes.Findings : ExitCodes.Ok;
        });

        return cmd;
    }

    /// <summary>The project to analyze against, or null to check leaked secrets only.</summary>
    private async Task<ProjectLink?> ResolveLinkAsync(string? projectId, CancellationToken ct)
    {
        if (session.Mode != AuthMode.User)
        {
            ui.Warn("Not logged in: checking for leaked secrets only.");
            return null;
        }

        if (projectId is null && linkStore.Find() is null && !prompter.IsInteractive)
        {
            ui.Warn("This folder isn't linked to a project: checking for leaked secrets only.");
            return null;
        }

        return await projectLinker.ResolveAsync(projectId, ct);
    }

    private void PrintLeaks(List<SecretDetection> leaks)
    {
        Section("Secret leaks");
        if (leaks.Count == 0)
        {
            ui.Success("No leaked secrets found.");
            return;
        }

        ui.Table(["FILE", "LINE", "TYPE", "SEVERITY", "MATCH"], leaks.Take(MaxLeakRows).Select(d => new[]
        {
            d.FilePath, d.LineNumber.ToString(), d.PatternName, d.Severity.ToString(), d.MatchedSnippet
        }));
        if (leaks.Count > MaxLeakRows)
        {
            ui.Hint($"... and {leaks.Count - MaxLeakRows} more (see --json).");
        }
    }

    private void PrintAnalyses(List<FileAnalysis> analyses)
    {
        Section("Dependencies");
        if (analyses.Count == 0)
        {
            ui.Hint("No dependency files found.");
            return;
        }

        ui.Table(["FILE", "HEALTH", "DEPENDENCIES", "VULNERABILITIES"], analyses.Select(a => a.Result is { } r
            ? [a.File, $"{r.HealthScore:F0}%", r.Dependencies.Count.ToString(), r.VulnerabilitySeverities.Count().ToString()]
            : new[] { a.File, $"failed: {a.Error}", "", "" }));
    }

    private void PrintUnsynced(List<string> files)
    {
        Section("Secret files not in DepVault");
        if (files.Count == 0)
        {
            ui.Success("Every secret file is synced.");
            return;
        }

        files.ForEach(p => ui.Line($"  {SyncView.Label(SyncKind.Untracked, 10)}{Markup.Escape(p)}"));
        ui.Hint("Store them with `depvault push`, or skip one with `depvault untrack <path>`.");
    }

    private void Section(string title)
    {
        ui.Line();
        ui.Write(new Rule($"[cyan1]{Markup.Escape(title)}[/]") { Justification = Justify.Left, Style = new Style(Color.Grey) });
    }

    private static IEnumerable<Severity> Severities(ScanReport report) =>
        report.Leaks.Select(l => l.Severity)
            .Concat(report.Analyses.SelectMany(a => a.Result?.VulnerabilitySeverities ?? []).Select(RepoScanner.ParseSeverity));

    private static ScanJson ToJson(ScanReport report, bool failed) => new(
        report.Analyses.Where(a => a.Result is not null).Select(a => a.Result!.ToJson(a.File)).ToList(),
        report.Leaks.Select(l => new LeakJson(l.FilePath, l.LineNumber, l.PatternName, l.Severity, l.MatchedSnippet)).ToList(),
        report.UnsyncedFiles,
        failed);
}

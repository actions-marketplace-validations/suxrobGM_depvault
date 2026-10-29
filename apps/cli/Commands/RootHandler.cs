using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>Bare <c>depvault</c>: banner, where you are (folder, user, vault, project) and the command list.</summary>
public sealed class RootHandler(
    Session session,
    VaultUnlocker vaultUnlocker,
    IProjectLinkStore linkStore,
    IRepositoryLocator repositoryLocator,
    IVersionChecker versionChecker,
    Ui ui)
{
    private const string Brand = "#10B981";

    private static readonly string[] DepLines =
    [
        "██████╗ ███████╗██████╗ ",
        "██╔══██╗██╔════╝██╔══██╗",
        "██║  ██║█████╗  ██████╔╝",
        "██║  ██║██╔══╝  ██╔═══╝ ",
        "██████╔╝███████╗██║     ",
        "╚═════╝ ╚══════╝╚═╝     "
    ];

    private static readonly string[] VaultLines =
    [
        "██╗   ██╗ █████╗ ██╗   ██╗██╗  ████████╗",
        "██║   ██║██╔══██╗██║   ██║██║  ╚══██╔══╝",
        "██║   ██║███████║██║   ██║██║     ██║   ",
        "╚██╗ ██╔╝██╔══██║██║   ██║██║     ██║   ",
        " ╚████╔╝ ██║  ██║╚██████╔╝███████╗██║   ",
        "  ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝   "
    ];

    public void Configure(RootCommand rootCommand)
    {
        rootCommand.SetAction(_ =>
        {
            PrintBanner();
            PrintStatusLine();
            ui.Line();
            var commands = new Grid().AddColumn(new GridColumn().PadLeft(2).PadRight(2).NoWrap()).AddColumn();
            foreach (var command in rootCommand.Subcommands)
            {
                commands.AddRow($"[{Brand}]{command.Name}[/]", $"[grey]{Markup.Escape(command.Description ?? "")}[/]");
            }

            ui.Write(commands);
            ui.Line();
            ui.Hint("Run `depvault <command> --help` for details.");
            return ExitCodes.Ok;
        });
    }

    private void PrintBanner()
    {
        ui.Line();
        for (var i = 0; i < DepLines.Length; i++)
        {
            ui.Line($"  [bold white]{Markup.Escape(DepLines[i])}[/][bold {Brand}]{Markup.Escape(VaultLines[i])}[/]");
        }

        ui.Line($"  [grey]Secure your stack. Analyze. Vault. Ship.  v{versionChecker.GetCurrentVersion()}[/]");
        ui.Line();
    }

    /// <summary>Folder · repo · user · vault · linked project.</summary>
    private void PrintStatusLine()
    {
        var parts = new List<string> { $"[grey]{Markup.Escape(CollapseHome(Directory.GetCurrentDirectory()))}[/]" };
        if (repositoryLocator.GetRepoName() is { } repo)
        {
            parts.Add($"[white]{Markup.Escape(repo)}[/]");
        }

        parts.Add(session.Mode switch
        {
            AuthMode.CiToken => "[cyan1]CI token[/]",
            AuthMode.User => $"[cyan1]{Markup.Escape(session.User?.Email ?? "logged in")}[/]",
            _ => "[yellow]not logged in[/]"
        });

        if (session.Mode == AuthMode.User)
        {
            parts.Add(vaultUnlocker.IsRemembered ? "[green]vault unlocked[/]" : "[yellow]vault locked[/]");
        }

        try
        {
            if (linkStore.Find() is { } link)
            {
                parts.Add($"[white]{Markup.Escape(link.DisplayName)}[/]");
            }
        }
        catch (InvalidOperationException)
        {
            // A broken .depvault.json is reported by the command that needs it.
        }

        ui.Line($"  {string.Join(" [grey]·[/] ", parts)}");
    }

    private static string CollapseHome(string path)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return home.Length > 0 && path.StartsWith(home, StringComparison.Ordinal) ? "~" + path[home.Length..] : path;
    }
}

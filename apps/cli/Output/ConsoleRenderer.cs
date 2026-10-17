using DepVault.Cli.Config;
using DepVault.Cli.Crypto;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Sync;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace DepVault.Cli.Output;

/// <summary>Injectable renderer for banner, status line, and section rules.</summary>
public sealed class ConsoleRenderer(
    VaultState vaultState,
    RememberedUnlockService rememberedUnlockService,
    ICredentialStore credentialStore,
    IProjectLinkStore projectLinkStore,
    IRepositoryLocator repositoryLocator)
{
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

    /// <summary>Print the full ASCII banner with tagline, version, and status line.</summary>
    public void PrintBanner()
    {
        AnsiConsole.WriteLine();

        for (var i = 0; i < DepLines.Length; i++)
        {
            AnsiConsole.Markup($"  [bold white]{Markup.Escape(DepLines[i])}[/]");
            AnsiConsole.MarkupLine($"[bold {ConsoleTheme.BrandMarkup}]{Markup.Escape(VaultLines[i])}[/]");
        }

        var version = typeof(Program).Assembly.GetName().Version?.ToString(3);
        AnsiConsole.MarkupLine($"  [grey]Secure your stack. Analyze. Vault. Ship.[/]  [grey]v{version}[/]");
        AnsiConsole.MarkupLine($"  [grey]{new string('─', 65)}[/]");
        AnsiConsole.WriteLine();
    }

    /// <summary>Clears the screen, skipping redirected or bufferless (piped/CI) output where it would throw <see cref="IOException"/>.</summary>
    public void Clear()
    {
        if (Console.IsOutputRedirected)
        {
            return;
        }

        try
        {
            AnsiConsole.Clear();
        }
        catch (IOException)
        {
            // No usable console buffer — nothing to clear.
        }
    }

    /// <summary>Print the status line: cwd · repo · email · vault lock status · project name.</summary>
    public void PrintStatusLine()
    {
        var email = credentialStore.Load()?.Email;
        ProjectLink? link = null;
        try
        {
            link = projectLinkStore.Find();
        }
        catch (InvalidOperationException)
        {
            // A broken .depvault.json is reported by the command that needs it, not the status line.
        }

        var parts = new List<string>();

        var cwd = CollapseHome(Directory.GetCurrentDirectory());
        if (!string.IsNullOrEmpty(cwd))
        {
            parts.Add($"[grey]{Markup.Escape(cwd)}[/]");
        }

        var repoName = repositoryLocator.GetRepoName();
        if (!string.IsNullOrEmpty(repoName))
        {
            parts.Add($"[white]{Markup.Escape(repoName)}[/]");
        }

        if (email is not null)
        {
            parts.Add($"[cyan1]{Markup.Escape(email)}[/]");
        }

        if (vaultState.IsUnlocked)
        {
            parts.Add("[green]Unlocked[/]");
        }
        else
        {
            parts.Add(rememberedUnlockService.HasSession()
                ? "[yellow]Locked (remembered)[/]"
                : "[yellow]Locked[/]");
        }

        if (link is not null)
        {
            parts.Add($"[white]{Markup.Escape(link.ProjectName ?? link.ProjectId)}[/]");
        }

        if (parts.Count == 0)
        {
            return;
        }

        AnsiConsole.MarkupLine($"  {string.Join(" [grey]·[/] ", parts)}");
    }

    /// <summary>Collapses the user's home directory prefix to <c>~</c> for a compact path display.</summary>
    private static string? CollapseHome(string? path)
    {
        if (string.IsNullOrEmpty(path))
        {
            return path;
        }

        var home = Environment.GetEnvironmentVariable("HOME");
        if (string.IsNullOrEmpty(home))
        {
            home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        }

        return !string.IsNullOrEmpty(home) && path.StartsWith(home, StringComparison.Ordinal)
            ? "~" + path[home.Length..]
            : path;
    }

    /// <summary>Renders guidance after auto-creating this project's SELF key grant failed.</summary>
    public void PrintKeyGrantError(string? reason = null)
    {
        var rows = new List<IRenderable>
        {
            new Markup("[red]Could not create an encryption key for this project.[/]"),
        };

        if (!string.IsNullOrWhiteSpace(reason))
        {
            rows.Add(new Markup(""));
            rows.Add(new Markup($"[grey]Reason:[/] {Markup.Escape(reason)}"));
        }

        rows.Add(new Markup(""));
        rows.Add(new Markup("[grey]The CLI normally creates this key automatically on first push/pull.[/]"));
        rows.Add(new Markup("[grey]To fix this:[/]"));
        rows.Add(new Markup(""));
        rows.Add(new Markup("  [cyan1]1.[/] [grey]Make sure you are logged in ([bold]depvault whoami[/])[/]"));
        rows.Add(new Markup("  [cyan1]2.[/] [grey]Unlock your vault ([bold]depvault unlock[/])[/]"));
        rows.Add(new Markup("  [cyan1]3.[/] [grey]Check your network connection and try again[/]"));
        rows.Add(new Markup(""));
        rows.Add(new Markup("[grey]If you are a team member, ask an [bold]Editor[/] or [bold]Owner[/] to grant[/]"));
        rows.Add(new Markup("[grey]you access from the project's [bold]Team[/] settings page.[/]"));

        AnsiConsole.WriteLine();
        AnsiConsole.Write(new Panel(new Rows(rows))
            .Header("[red]Encryption Key Setup Failed[/]")
            .Border(BoxBorder.Rounded)
            .BorderStyle(new Style(Color.Red))
            .Padding(1, 0));
        AnsiConsole.WriteLine();
    }

    /// <summary>Print the REPL key-hint bar shown beneath the status line.</summary>
    public void PrintReplHints()
    {
        AnsiConsole.MarkupLine("  [grey]Enter run · Esc clear · help · exit[/]");
    }

    /// <summary>Prints one line per non-in-sync file plus a summary, like <c>git status</c>.</summary>
    public void PrintSyncEntries(IReadOnlyList<SyncEntry> entries)
    {
        foreach (var entry in entries.Where(e => e.Kind != SyncKind.InSync))
        {
            var (label, color) = Describe(entry.Kind);
            var path = entry.FromPath is not null
                ? $"{Markup.Escape(entry.FromPath)} [grey]→[/] {Markup.Escape(entry.Path)}"
                : Markup.Escape(entry.Path);
            var note = entry.Reason is not null ? $"  [grey]({Markup.Escape(entry.Reason)})[/]" : "";
            AnsiConsole.MarkupLine($"  [{color}]{label,-10}[/] {path}{note}");
        }
    }

    /// <summary>One-line totals: what push and pull would do, and what is blocked.</summary>
    public void PrintSyncSummary(IReadOnlyList<SyncEntry> entries)
    {
        var toPush = entries.Count(e => e.IsLocalChange);
        var toPull = entries.Count(e => e.IsRemoteChange);
        var conflicts = entries.Count(e => e.Kind == SyncKind.Conflict);
        var inSync = entries.Count(e => e.Kind == SyncKind.InSync);

        var parts = new List<string>();
        if (toPush > 0) parts.Add($"[cyan1]{toPush} to push[/]");
        if (toPull > 0) parts.Add($"[cyan1]{toPull} to pull[/]");
        if (conflicts > 0) parts.Add($"[red]{conflicts} conflict(s)[/]");
        parts.Add($"[grey]{inSync} in sync[/]");

        AnsiConsole.WriteLine();
        AnsiConsole.MarkupLine($"  {string.Join(" [grey]·[/] ", parts)}");
    }

    private static (string Label, string Color) Describe(SyncKind kind) => kind switch
    {
        SyncKind.Modified => ("modified", "yellow"),
        SyncKind.Untracked => ("new", "green"),
        SyncKind.Deleted => ("deleted", "red"),
        SyncKind.Renamed => ("renamed", "yellow"),
        SyncKind.Behind => ("incoming", "cyan1"),
        SyncKind.NewOnServer => ("incoming", "cyan1"),
        SyncKind.DeletedOnServer => ("removed", "cyan1"),
        SyncKind.Conflict => ("conflict", "red"),
        _ => ("in sync", "grey")
    };

    /// <summary>Print a titled section rule.</summary>
    public void PrintRule(string title)
    {
        var rule = new Rule($"[cyan1]{Markup.Escape(title)}[/]")
        {
            Justification = Justify.Left,
            Style = new Style(ConsoleTheme.Highlight)
        };
        AnsiConsole.Write(rule);
    }
}

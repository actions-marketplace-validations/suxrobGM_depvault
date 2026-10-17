using DepVault.Cli.Auth;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

namespace DepVault.Cli.Output;

/// <summary>
/// Classifies and renders auth and plan-limit API errors; used at the top level by <c>Program.cs</c>
/// (outside DI) and in-command via <c>IErrorHandler</c>.
/// </summary>
public static class ApiErrorHandler
{
    private const string limitReachedPattern = "limit reached";

    /// <summary>True for a plan-limit error (403 with "limit reached").</summary>
    public static bool IsPlanLimitError(Exception ex)
    {
        return (ex is ApiException { ResponseStatusCode: 403 }
                || ex.GetType().Name.Contains("403Error", StringComparison.Ordinal))
               && ex.Message.Contains(limitReachedPattern, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>True for a 401; Kiota's generated *401Error types don't always set ResponseStatusCode.</summary>
    public static bool IsAuthError(Exception ex)
    {
        return ex is ApiException { ResponseStatusCode: 401 }
               || ex.GetType().Name.Contains("401Error", StringComparison.Ordinal);
    }

    internal static void PrintAuthError()
    {
        var ciMode = AuthContext.CiToken is not null;
        AnsiConsole.WriteLine();
        AnsiConsole.Write(new Panel(
                new Rows(
                    new Markup(ciMode
                        ? "[red]DEPVAULT_TOKEN is invalid, expired or revoked.[/]"
                        : "[red]Your session has expired or your token is invalid.[/]"),
                    new Markup(""),
                    new Markup(ciMode
                        ? "[grey]Create a new CI token in the project's settings and update the pipeline secret.[/]"
                        : "[grey]Run[/] [cyan1]depvault login[/] [grey]to re-authenticate.[/]")))
            .Header("[red]Authentication Error[/]")
            .Border(BoxBorder.Rounded)
            .BorderStyle(new Style(Color.Red))
            .Padding(1, 0));
        AnsiConsole.WriteLine();
    }

    internal static void PrintPlanLimitError(string message)
    {
        AnsiConsole.WriteLine();
        AnsiConsole.Write(new Panel(
                new Rows(
                    new Markup($"[yellow]{Markup.Escape(message)}[/]"),
                    new Markup(""),
                    new Markup("[grey]Upgrade your plan at[/] [cyan1 underline]depvault.com/settings/billing[/]")))
            .Header("[yellow]Plan Limit Reached[/]")
            .Border(BoxBorder.Rounded)
            .BorderStyle(new Style(Color.Yellow))
            .Padding(1, 0));
        AnsiConsole.WriteLine();
    }
}

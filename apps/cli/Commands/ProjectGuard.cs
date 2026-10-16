using DepVault.Cli.Auth;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>
/// For push/pull, requires confirmation when an explicit <c>--project</c> differs from the active project.
/// Always allowed in CI or when no project is active.
/// </summary>
internal static class ProjectGuard
{
    public static bool ConfirmOverride(AuthContext ctx, string? explicitId)
    {
        if (string.IsNullOrEmpty(explicitId) || ctx.IsCiMode())
        {
            return true;
        }

        var activeId = ctx.Config.Load().ActiveProjectId;
        if (string.IsNullOrEmpty(activeId)
            || string.Equals(explicitId, activeId, StringComparison.Ordinal))
        {
            return true;
        }

        AnsiConsole.MarkupLine(
            $"[yellow]--project {Markup.Escape(explicitId)} differs from the active project ({Markup.Escape(activeId)}).[/]");
        return ctx.Prompter.Confirm("Continue?", false);
    }
}

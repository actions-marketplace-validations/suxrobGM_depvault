using System.CommandLine;

namespace DepVault.Cli.Commands;

/// <summary>Options several commands share.</summary>
public static class CliOptions
{
    /// <summary>One instance across commands, so <c>Program</c> can read it whichever command ran.</summary>
    public static readonly Option<bool> Json = new("--json") { Description = "Print machine-readable JSON to stdout" };

    public static Option<string?> Project() => new("--project")
    {
        Description = "Project ID (defaults to the one in .depvault.json)"
    };

    public static Argument<string[]> Paths(string description) => new("paths")
    {
        Arity = ArgumentArity.ZeroOrMore,
        Description = description
    };

    public static Option<bool> Yes(string description = "Don't prompt") => new("--yes", "-y") { Description = description };

    public static Option<bool> DryRun() => new("--dry-run") { Description = "Show what would change without changing anything" };
}

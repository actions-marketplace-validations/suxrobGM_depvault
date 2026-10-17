using System.CommandLine;
using DepVault.Cli.Output;

namespace DepVault.Cli.Commands;

/// <summary>Handles the bare root command by printing the banner, status line and command list.</summary>
public sealed class RootHandler(ConsoleRenderer renderer)
{
    public void Configure(RootCommand rootCommand)
    {
        rootCommand.SetAction(_ =>
        {
            renderer.PrintBanner();
            renderer.PrintStatusLine();
            Console.WriteLine();
            Console.WriteLine(rootCommand.Description);
            Console.WriteLine();
            Console.WriteLine("Usage: depvault [command] [options]");
            Console.WriteLine();
            Console.WriteLine("Commands:");
            foreach (var sub in rootCommand.Subcommands)
            {
                Console.WriteLine($"  {sub.Name,-16} {sub.Description}");
            }
        });
    }
}

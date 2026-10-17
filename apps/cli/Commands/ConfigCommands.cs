using System.CommandLine;
using DepVault.Cli.Auth;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>Per-machine CLI settings. The project is per folder (<c>.depvault.json</c>), not a setting.</summary>
public sealed class ConfigCommands(AuthContext ctx)
{
    public Command CreateConfigCommand()
    {
        var cmd = new Command("config", "Manage CLI configuration (server, output)");

        cmd.SetAction(_ =>
        {
            var config = ctx.Config.Load();
            ctx.Output.PrintTable(["KEY", "VALUE"], [["server", config.Server], ["output", config.OutputFormat]]);

            if (!ctx.Prompter.IsInteractive)
            {
                AnsiConsole.WriteLine();
                AnsiConsole.MarkupLine("[grey]Use[/] [cyan1]depvault config set <key> <value>[/] [grey]to update.[/]");
                return;
            }

            AnsiConsole.WriteLine();
            var setting = ctx.Prompter.Select("Change a setting", ["server", "output", "cancel"], key => key);
            switch (setting)
            {
                case "server":
                    var url = ctx.Prompter.Ask("Server URL", config.Server);
                    ctx.Config.Set("server", url);
                    ctx.Output.PrintSuccess($"Set server = {url}");
                    break;

                case "output":
                    var format = ctx.Prompter.Select("Output format", ["table", "json"], value => value);
                    ctx.Config.Set("output", format);
                    ctx.Output.PrintSuccess($"Set output = {format}");
                    break;
            }
        });

        var keyArg = new Argument<string>("key") { Description = "Config key (server, output)" };
        var valueArg = new Argument<string>("value") { Description = "Config value" };
        var setCmd = new Command("set", "Set a config value") { keyArg, valueArg };
        setCmd.SetAction(parseResult =>
        {
            var key = parseResult.GetValue(keyArg);
            var value = parseResult.GetValue(valueArg);
            if (ctx.Config.Set(key!, value!))
            {
                ctx.Output.PrintSuccess($"Set {key} = {value}");
            }
            else
            {
                ctx.Output.PrintError($"Unknown config key: {key}. Valid keys: server, output");
            }
        });

        var getKeyArg = new Argument<string>("key") { Description = "Config key (server, output)" };
        var getCmd = new Command("get", "Get a config value") { getKeyArg };
        getCmd.SetAction(parseResult =>
        {
            var key = parseResult.GetValue(getKeyArg);
            var value = ctx.Config.Get(key!);
            if (value is not null)
            {
                Console.WriteLine(value);
            }
            else
            {
                ctx.Output.PrintError($"Unknown config key: {key}");
            }
        });

        cmd.Add(setCmd);
        cmd.Add(getCmd);
        return cmd;
    }
}

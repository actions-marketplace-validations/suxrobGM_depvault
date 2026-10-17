using System.CommandLine;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Output;

namespace DepVault.Cli.Commands;

/// <summary>Per-machine CLI settings. The project is per folder (<c>.depvault.json</c>), not a setting.</summary>
public sealed class ConfigCommands(IConfigService configService, Ui ui)
{
    private const string ServerKey = "server";

    public Command CreateConfigCommand()
    {
        var cmd = new Command("config", "Show or change CLI settings (server)");
        cmd.SetAction(_ =>
        {
            ui.Table(["KEY", "VALUE"], [[ServerKey, configService.Load().Server]]);
            ui.Hint("Change it with `depvault config set server <url>`.");
            return ExitCodes.Ok;
        });

        var setKeyArg = KeyArgument();
        var valueArg = new Argument<string>("value") { Description = "New value" };
        var setCmd = new Command("set", "Set a config value") { setKeyArg, valueArg };
        setCmd.SetAction(parseResult =>
        {
            RequireKnownKey(parseResult.GetValue(setKeyArg)!);
            configService.SetServer(parseResult.GetValue(valueArg)!);
            ui.Success($"Set server = {configService.Load().Server}");
            ui.Hint("Log in to it with `depvault login`.");
            return ExitCodes.Ok;
        });

        var getKeyArg = KeyArgument();
        var getCmd = new Command("get", "Print a config value") { getKeyArg };
        getCmd.SetAction(parseResult =>
        {
            RequireKnownKey(parseResult.GetValue(getKeyArg)!);
            Console.WriteLine(configService.Load().Server);
            return ExitCodes.Ok;
        });

        cmd.Add(setCmd);
        cmd.Add(getCmd);
        return cmd;
    }

    private static Argument<string> KeyArgument() => new("key") { Description = "Config key (server)" };

    private static void RequireKnownKey(string key)
    {
        if (!string.Equals(key, ServerKey, StringComparison.OrdinalIgnoreCase))
        {
            throw new CliException($"Unknown config key '{key}'. Valid keys: {ServerKey}", ExitCodes.Usage);
        }
    }
}

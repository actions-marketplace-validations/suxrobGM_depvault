using System.CommandLine;
using DepVault.Cli.Common;
using DepVault.Cli.Services;

namespace DepVault.Cli.Commands;

public sealed class UpdateCommands(IUpdateService updateService, IVersionChecker versionChecker)
{
    public Command CreateUpdateCommand()
    {
        var cmd = new Command("update", "Update the DepVault CLI to the latest version");
        cmd.SetAction(async (_, ct) =>
        {
            await updateService.UpdateAsync(ct);
            return ExitCodes.Ok;
        });
        return cmd;
    }

    /// <summary>Prints just the version, for scripts.</summary>
    public Command CreateVersionCommand()
    {
        var cmd = new Command("version", "Print the CLI version");
        cmd.SetAction(_ =>
        {
            Console.WriteLine(versionChecker.GetCurrentVersion());
            return ExitCodes.Ok;
        });
        return cmd;
    }
}

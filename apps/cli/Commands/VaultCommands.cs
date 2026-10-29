using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;

namespace DepVault.Cli.Commands;

public sealed class VaultCommands(Session session, VaultUnlocker vaultUnlocker, Ui ui)
{
    public Command CreateUnlockCommand()
    {
        var cmd = new Command("unlock",
            $"Unlock the vault and remember this device for {VaultUnlocker.RememberFor.TotalDays:0} days");

        cmd.SetAction(async (_, ct) =>
        {
            session.RequireUser();
            ui.Success(await vaultUnlocker.UnlockAndRememberAsync(ct)
                ? $"Vault unlocked on this device until {DateTimeOffset.Now + VaultUnlocker.RememberFor:d}."
                : "Vault is already unlocked on this device.");
            return ExitCodes.Ok;
        });

        return cmd;
    }

    public Command CreateLockCommand()
    {
        var cmd = new Command("lock", "Forget the vault unlock on this device");

        cmd.SetAction(_ =>
        {
            var wasUnlocked = vaultUnlocker.IsRemembered;
            vaultUnlocker.Forget();
            ui.Success(wasUnlocked
                ? "Vault locked. This device will ask for your vault password again."
                : "Vault is already locked.");
            return ExitCodes.Ok;
        });

        return cmd;
    }
}

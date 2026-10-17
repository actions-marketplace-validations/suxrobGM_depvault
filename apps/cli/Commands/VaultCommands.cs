using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Crypto;
using Spectre.Console;

namespace DepVault.Cli.Commands;

public sealed class VaultCommands(
    AuthContext ctx,
    VaultState vaultState,
    RememberedUnlockService rememberedUnlockService,
    InteractiveVaultUnlocker vaultUnlocker)
{
    public Command CreateUnlockCommand()
    {
        var cmd = new Command("unlock", "Unlock the vault on this device (asks once, remembers for 30 days)");

        cmd.SetAction(async (_, cancellationToken) =>
        {
            if (ctx.RequireAuth())
            {
                await vaultUnlocker.UnlockAsync(cancellationToken);
            }
        });

        return cmd;
    }

    public Command CreateLockCommand()
    {
        var cmd = new Command("lock", "Lock the vault and forget it on this device");

        cmd.SetAction((_, _) =>
        {
            // A remembered unlock can exist on disk even when this process is locked — always clear it.
            var wasUnlocked = vaultState.IsUnlocked || rememberedUnlockService.HasSession();

            vaultState.Lock();
            rememberedUnlockService.Clear();

            AnsiConsole.MarkupLine(wasUnlocked
                ? "[green]Vault locked. This device will ask for your vault password again.[/]"
                : "[yellow]Vault is already locked.[/]");
            return Task.CompletedTask;
        });

        return cmd;
    }
}

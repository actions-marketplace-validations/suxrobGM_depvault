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
        var rememberOpt = new Option<bool>("--remember")
        { Description = "Persist the unlock so the password isn't needed next invocation" };
        var noRememberOpt = new Option<bool>("--no-remember")
        { Description = "Unlock for this session only; do not offer to persist" };
        var ttlOpt = new Option<string?>("--ttl", "--remember-for")
        { Description = "How long to stay unlocked, e.g. 8h, 7d (default 7d, max 30d)" };

        var cmd = new Command("unlock", "Unlock the vault (derive and cache KEK)")
        {
            rememberOpt, noRememberOpt, ttlOpt
        };

        cmd.SetAction(async (parseResult, cancellationToken) =>
        {
            if (!ctx.RequireAuth())
            {
                return;
            }

            await vaultUnlocker.UnlockAsync(
                parseResult.GetValue(rememberOpt),
                parseResult.GetValue(noRememberOpt),
                parseResult.GetValue(ttlOpt),
                cancellationToken);
        });

        return cmd;
    }

    public Command CreateLockCommand()
    {
        var cmd = new Command("lock", "Lock the vault (clear KEK and DEK cache)");

        cmd.SetAction((_, _) =>
        {
            // A remembered unlock can exist on disk even when this process is locked — always clear it.
            var wasUnlocked = vaultState.IsUnlocked;
            var hadSession = rememberedUnlockService.HasSession();

            vaultState.Lock();
            rememberedUnlockService.Clear();

            AnsiConsole.MarkupLine(wasUnlocked || hadSession
                ? "[green]Vault locked. KEK and DEK cache cleared.[/]"
                : "[yellow]Vault is already locked.[/]");
            return Task.CompletedTask;
        });

        return cmd;
    }
}

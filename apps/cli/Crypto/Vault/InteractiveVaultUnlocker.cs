using Spectre.Console;

namespace DepVault.Cli.Crypto;

/// <summary>Interactive unlock shared by <c>unlock</c> and post-login onboarding: prompt, verify, offer to remember.</summary>
public sealed class InteractiveVaultUnlocker(
    VaultState vaultState,
    VaultUnlockService vaultUnlockService,
    RememberedUnlockService rememberedUnlockService)
{
    public async Task UnlockAsync(CancellationToken cancellationToken)
    {
        if (vaultState.IsUnlocked || rememberedUnlockService.HasSession())
        {
            AnsiConsole.MarkupLine("[green]Vault is already unlocked on this device.[/]");
            return;
        }

        var passwordInput = vaultUnlockService.CollectVaultPassword();
        if (string.IsNullOrEmpty(passwordInput.Password))
        {
            return;
        }

        VaultUnlockResult result = default;
        await AnsiConsole.Status()
            .Spinner(Spinner.Known.Dots)
            .StartAsync("Deriving encryption key...", async _ =>
            {
                result = await vaultUnlockService.ResolveKekAsync(passwordInput.Password, cancellationToken);
            });

        if (result.Kek is null)
        {
            return;
        }

        AnsiConsole.MarkupLine("[green]Vault unlocked.[/]");
        if (passwordInput.FromPrompt)
        {
            rememberedUnlockService.OfferRemember();
        }
    }
}

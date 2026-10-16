using DepVault.Cli.Auth;
using Spectre.Console;

namespace DepVault.Cli.Crypto;

/// <summary>Interactive unlock shared by <c>unlock</c> and post-login onboarding: prompt, verify the KEK, offer to remember.</summary>
public sealed class InteractiveVaultUnlocker(
    AuthContext ctx,
    VaultState vaultState,
    VaultUnlockService vaultUnlockService,
    RememberedUnlockService rememberedUnlockService)
{
    /// <summary>Runs the interactive unlock flow, reporting progress and outcome to the console.</summary>
    public async Task UnlockAsync(
        bool remember, bool noRemember, string? ttlValue, CancellationToken cancellationToken)
    {
        if (remember && noRemember)
        {
            AnsiConsole.MarkupLine(
                "[yellow]--remember and --no-remember conflict; honoring --no-remember.[/]");
            remember = false;
        }

        // Resolved lazily so `--no-remember --ttl <bad>` doesn't warn about a flag with no effect.
        TimeSpan ResolveTtlOrDefault() => rememberedUnlockService.ResolveTtlOrDefault(ttlValue);

        void SaveRemembered()
        {
            var expiresAt = rememberedUnlockService.SaveCurrentUnlock(ResolveTtlOrDefault());
            AnsiConsole.MarkupLine(
                $"[green]Remembered on this machine until {expiresAt.LocalDateTime:g}.[/]");
        }

        async Task<VaultUnlockResult> DeriveKekAsync(string? password)
        {
            var result = new VaultUnlockResult(null, DroppedStaleSession: false);
            await AnsiConsole.Status()
                .Spinner(Spinner.Known.Dots)
                .StartAsync("Deriving encryption key...", async _ =>
                {
                    result = await vaultUnlockService.ResolveKekAsync(password, cancellationToken);
                });

            return result;
        }

        // A remembered unlock can be (re)persisted even when this process is already unlocked.
        if (vaultState.IsUnlocked)
        {
            if (remember)
            {
                SaveRemembered();
            }
            else
            {
                AnsiConsole.MarkupLine("[yellow]Vault is already unlocked.[/]");
            }

            return;
        }

        var passwordInput = vaultUnlockService.CollectVaultPassword();
        if (string.IsNullOrEmpty(passwordInput.Password) && !rememberedUnlockService.HasSession())
        {
            return;
        }

        var unlockResult = await DeriveKekAsync(passwordInput.Password);

        if (unlockResult.Kek is null
            && unlockResult.DroppedStaleSession
            && string.IsNullOrEmpty(passwordInput.Password)
            && ctx.Prompter.IsInteractive
            && !rememberedUnlockService.HasSession())
        {
            var password = ctx.Prompter.AskSecret("Enter vault password");
            if (!string.IsNullOrEmpty(password))
            {
                unlockResult = await DeriveKekAsync(password);
            }
        }

        if (unlockResult.Kek is null)
        {
            return;
        }

        AnsiConsole.MarkupLine("[green]Vault unlocked.[/]");

        if (noRemember)
        {
            return;
        }

        if (remember)
        {
            SaveRemembered();
        }
        else
        {
            rememberedUnlockService.MaybeOfferRememberUnlock(ResolveTtlOrDefault());
        }
    }
}

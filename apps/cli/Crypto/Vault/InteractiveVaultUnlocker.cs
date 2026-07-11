using DepVault.Cli.Auth;
using Spectre.Console;

namespace DepVault.Cli.Crypto;

/// <summary>
/// Interactive unlock orchestration shared by the 'unlock' command and post-login onboarding:
/// collect the password, derive/verify the KEK with a spinner, and offer to remember the unlock.
/// </summary>
public sealed class InteractiveVaultUnlocker(
    AuthContext ctx,
    VaultState vaultState,
    VaultUnlockService vaultUnlockService,
    RememberedUnlockService rememberedUnlockService)
{
    /// <summary>Runs the unlock flow; returns true when the vault ends up unlocked.</summary>
    public async Task<bool> UnlockAsync(
        bool remember, bool noRemember, string? ttlValue, CancellationToken cancellationToken)
    {
        if (remember && noRemember)
        {
            AnsiConsole.MarkupLine(
                "[yellow]--remember and --no-remember conflict; honoring --no-remember.[/]");
            remember = false;
        }

        // Resolves the TTL only when it will be used, so `--no-remember --ttl <bad>` does not emit a
        // spurious warning for a flag with no effect.
        TimeSpan ResolveTtlOrDefault() => rememberedUnlockService.ResolveTtlOrDefault(ttlValue);

        void SaveRemembered()
        {
            var expiresAt = rememberedUnlockService.SaveCurrentUnlock(ResolveTtlOrDefault());
            AnsiConsole.MarkupLine(
                $"[green]Remembered on this machine until {expiresAt.LocalDateTime:g}.[/]");
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

            return true;
        }

        var passwordInput = vaultUnlockService.CollectVaultPassword();
        if (string.IsNullOrEmpty(passwordInput.Password) && !rememberedUnlockService.HasSession())
        {
            return false;
        }

        var unlockResult = new VaultUnlockResult(null, DroppedStaleSession: false);
        await AnsiConsole.Status()
            .Spinner(Spinner.Known.Dots)
            .StartAsync("Deriving encryption key...", async _ =>
            {
                unlockResult = await vaultUnlockService.ResolveKekAsync(
                    passwordInput.Password,
                    cancellationToken);
            });

        if (unlockResult.Kek is null
            && unlockResult.DroppedStaleSession
            && string.IsNullOrEmpty(passwordInput.Password)
            && ctx.Prompter.IsInteractive
            && !rememberedUnlockService.HasSession())
        {
            var password = ctx.Prompter.AskSecret("Enter vault password");
            if (!string.IsNullOrEmpty(password))
            {
                await AnsiConsole.Status()
                    .Spinner(Spinner.Known.Dots)
                    .StartAsync("Deriving encryption key...", async _ =>
                    {
                        unlockResult = await vaultUnlockService.ResolveKekAsync(
                            password,
                            cancellationToken);
                    });
            }
        }

        if (unlockResult.Kek is null)
        {
            return false;
        }

        AnsiConsole.MarkupLine("[green]Vault unlocked.[/]");

        if (noRemember)
        {
            return true;
        }

        if (remember)
        {
            SaveRemembered();
        }
        else
        {
            rememberedUnlockService.MaybeOfferRememberUnlock(ResolveTtlOrDefault());
        }

        return true;
    }
}

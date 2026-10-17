using DepVault.Cli.Auth;

namespace DepVault.Cli.Crypto;

/// <summary>"Unlock once per device": persists the derived KEK (never the password) for 30 days on request.</summary>
public sealed class RememberedUnlockService(
    AuthContext commandContext,
    VaultState vaultState,
    IPersistentVaultStore persistentVaultStore)
{
    private static readonly TimeSpan RememberFor = TimeSpan.FromDays(30);

    public bool HasSession() => persistentVaultStore.HasSession();

    public (byte[] Kek, string KekSalt)? TryLoad() => persistentVaultStore.TryLoad();

    public void Clear() => persistentVaultStore.Clear();

    /// <summary>
    /// After a password unlock, asks once (default yes) whether to remember this device. Never asks in CI,
    /// non-interactively, or when already remembered — those keep the unlock in memory only.
    /// </summary>
    public void OfferRemember()
    {
        if (commandContext.IsCiMode() || !commandContext.Prompter.IsInteractive || HasSession())
        {
            return;
        }

        if (vaultState.Kek is null || vaultState.KekSalt is null)
        {
            return;
        }

        if (!commandContext.Prompter.Confirm(
                $"Remember on this device for {RememberFor.TotalDays:0} days? (run 'depvault lock' to forget)"))
        {
            return;
        }

        var expiresAt = DateTimeOffset.UtcNow + RememberFor;
        persistentVaultStore.Save(vaultState.Kek, vaultState.KekSalt, expiresAt);
        commandContext.Output.PrintSuccess($"Vault stays unlocked on this device until {expiresAt.LocalDateTime:d}.");
    }
}

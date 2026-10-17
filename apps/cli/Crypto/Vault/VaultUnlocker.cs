using System.Security.Cryptography;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Output;
using VaultStatus = DepVault.Cli.ApiClient.Api.Vault.Status.StatusGetResponse;

namespace DepVault.Cli.Crypto;

/// <summary>
/// Unlocks the vault for this process from a remembered unlock, <c>DEPVAULT_PASSWORD</c>, or a prompt.
/// Only the derived KEK is remembered, never the password.
/// </summary>
public sealed class VaultUnlocker(
    IApiClientFactory clientFactory,
    CliEnvironment env,
    IConsolePrompter prompter,
    IPersistentVaultStore rememberedStore)
{
    public static readonly TimeSpan RememberFor = TimeSpan.FromDays(30);

    private VaultStatus? status;
    private byte[]? kek;

    public bool IsRemembered => rememberedStore.HasSession();

    /// <summary>The verified KEK; after a password prompt, offers to remember this device.</summary>
    public async Task<byte[]> GetKekAsync(CancellationToken ct)
    {
        if (kek is not null)
        {
            return kek;
        }

        var vault = await GetStatusAsync(ct);
        if ((kek = TryRemembered(vault)) is not null)
        {
            return kek;
        }

        var prompted = env.VaultPassword is null;
        kek = Derive(vault, ReadPassword());
        if (prompted && prompter.Confirm(
                $"Remember on this device for {RememberFor.TotalDays:0} days? (forget with 'depvault lock')", true))
        {
            Remember(vault);
        }

        return kek;
    }

    /// <summary>Unlocks with the password and remembers this device; false when it already was.</summary>
    public async Task<bool> UnlockAndRememberAsync(CancellationToken ct)
    {
        var vault = await GetStatusAsync(ct);
        if ((kek = TryRemembered(vault)) is not null)
        {
            return false;
        }

        kek = Derive(vault, ReadPassword());
        Remember(vault);
        return true;
    }

    /// <summary>The ECDH private key (PKCS#8) that unwraps keys shared by teammates.</summary>
    public async Task<byte[]> GetPrivateKeyAsync(CancellationToken ct)
    {
        var key = await GetKekAsync(ct);
        return VaultCrypto.UnwrapKey(status!.WrappedPrivateKey!, status.WrappedPrivateKeyIv!, status.WrappedPrivateKeyTag!, key);
    }

    /// <summary>The recovery key, which also wraps each project key so a forgotten password isn't fatal.</summary>
    public async Task<byte[]> GetRecoveryKeyAsync(CancellationToken ct)
    {
        var key = await GetKekAsync(ct);
        if (string.IsNullOrEmpty(status!.WrappedRecoveryKey))
        {
            throw new CliException("Your vault has no recovery key. Set one up in the web dashboard.");
        }

        return VaultCrypto.UnwrapKey(status.WrappedRecoveryKey, status.WrappedRecoveryKeyIv!, status.WrappedRecoveryKeyTag!, key);
    }

    /// <summary>Forgets the remembered unlock and the in-memory key.</summary>
    public void Forget()
    {
        rememberedStore.Clear();
        if (kek is not null)
        {
            CryptographicOperations.ZeroMemory(kek);
            kek = null;
        }
    }

    private async Task<VaultStatus> GetStatusAsync(CancellationToken ct)
    {
        if (status is not null)
        {
            return status;
        }

        var vault = await clientFactory.Create().Api.Vault.Status.GetAsync(cancellationToken: ct);
        if (string.IsNullOrEmpty(vault?.KekSalt))
        {
            throw new CliException(string.IsNullOrEmpty(vault?.SetupUrl)
                ? "Your vault isn't set up yet. Set it up in the web dashboard first."
                : $"Your vault isn't set up yet. Set it up at {vault.SetupUrl}");
        }

        return status = vault;
    }

    /// <summary>A remembered KEK that still opens the server's vault; a stale one (password changed) is dropped.</summary>
    private byte[]? TryRemembered(VaultStatus vault)
    {
        if (rememberedStore.TryLoad() is not { } remembered)
        {
            return null;
        }

        if (remembered.KekSalt == vault.KekSalt && Verify(vault, remembered.Kek))
        {
            return remembered.Kek;
        }

        rememberedStore.Clear();
        CryptographicOperations.ZeroMemory(remembered.Kek);
        return null;
    }

    private void Remember(VaultStatus vault)
    {
        rememberedStore.Save(kek!, vault.KekSalt!, DateTimeOffset.UtcNow + RememberFor);
    }

    private string ReadPassword()
    {
        if (env.VaultPassword is { } password)
        {
            return password;
        }

        return prompter.IsInteractive
            ? prompter.AskSecret("Vault password")
            : throw new CliException("The vault is locked. Run 'depvault unlock' or set DEPVAULT_PASSWORD.");
    }

    private static byte[] Derive(VaultStatus vault, string password)
    {
        var iterations = vault.KekIterations is > 0 ? vault.KekIterations.Value : 600_000;
        var derived = VaultCrypto.DeriveKek(password, Convert.FromBase64String(vault.KekSalt!), iterations);
        if (Verify(vault, derived))
        {
            return derived;
        }

        CryptographicOperations.ZeroMemory(derived);
        throw new CliException("Incorrect vault password.");
    }

    private static bool Verify(VaultStatus vault, byte[] key) =>
        VaultCrypto.VerifyKek(vault.WrappedPrivateKey ?? "", vault.WrappedPrivateKeyIv ?? "",
            vault.WrappedPrivateKeyTag ?? "", key);
}

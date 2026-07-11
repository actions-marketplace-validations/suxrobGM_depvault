using System.Runtime.Versioning;
using System.Security.Cryptography;

namespace DepVault.Cli.Crypto;

/// <summary>Encrypts the vault KEK at rest so a remembered unlock can survive between invocations.</summary>
public interface IKekProtector
{
    /// <summary>Encrypts the KEK, returning a base64 envelope only this user/machine can open.</summary>
    string Protect(byte[] kek);

    /// <summary>Decrypts an envelope, or null on any failure (tamper, wrong user, corrupt).</summary>
    byte[]? Unprotect(string protectedBlob);

    /// <summary>Discards local protector material so prior envelopes can no longer be opened.</summary>
    void Reset();
}

/// <summary>DPAPI protector (CurrentUser scope) — bound to the Windows user account. AOT-safe P/Invoke.</summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsKekProtector : IKekProtector
{
    public string Protect(byte[] kek)
    {
        var blob = ProtectedData.Protect(kek, optionalEntropy: null, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(blob);
    }

    public byte[]? Unprotect(string protectedBlob)
    {
        try
        {
            var blob = Convert.FromBase64String(protectedBlob);
            return ProtectedData.Unprotect(blob, optionalEntropy: null, DataProtectionScope.CurrentUser);
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException)
        {
            return null;
        }
    }

    /// <summary>DPAPI keeps no local material — nothing to discard.</summary>
    public void Reset()
    {
    }
}

/// <summary>
/// macOS/Linux protector (no DPAPI): AES-GCM wraps the payload under a random owner-only (0600)
/// key file, so the protected file is useless without the sibling key. Each consumer gets its own
/// key file so resetting one (e.g. vault lock) cannot invalidate another's data.
/// </summary>
public sealed class PosixKekProtector(string protectorKeyPath) : IKekProtector
{
    public string Protect(byte[] kek)
    {
        var protectorKey = LoadOrCreateProtectorKey();
        var (wrapped, iv, tag) = VaultCrypto.WrapKey(kek, protectorKey);
        CryptographicOperations.ZeroMemory(protectorKey);
        return $"{wrapped}.{iv}.{tag}";
    }

    public byte[]? Unprotect(string protectedBlob)
    {
        var parts = protectedBlob.Split('.');
        if (parts.Length != 3 || !File.Exists(protectorKeyPath))
        {
            return null;
        }

        byte[]? protectorKey = null;
        try
        {
            protectorKey = Convert.FromBase64String(File.ReadAllText(protectorKeyPath));
            return VaultCrypto.UnwrapKey(parts[0], parts[1], parts[2], protectorKey);
        }
        catch (Exception ex)
            when (ex is CryptographicException or FormatException
                or IOException or UnauthorizedAccessException)
        {
            return null;
        }
        finally
        {
            if (protectorKey is not null)
            {
                CryptographicOperations.ZeroMemory(protectorKey);
            }
        }
    }

    public void Reset()
    {
        try
        {
            File.Delete(protectorKeyPath);
        }
        catch (Exception ex) when (ex is FileNotFoundException or DirectoryNotFoundException)
        {
        }
    }

    private byte[] LoadOrCreateProtectorKey()
    {
        if (File.Exists(protectorKeyPath))
        {
            try
            {
                var existing = Convert.FromBase64String(File.ReadAllText(protectorKeyPath));
                if (existing.Length == 32)
                {
                    return existing;
                }
            }
            catch (FormatException)
            {
                // Corrupt key file — fall through and regenerate rather than crashing Protect.
            }
        }

        var key = RandomNumberGenerator.GetBytes(32);
        SecureFileWriter.WriteOwnerOnly(protectorKeyPath, Convert.ToBase64String(key));
        return key;
    }
}

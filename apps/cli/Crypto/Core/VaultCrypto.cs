using System.Security.Cryptography;
using System.Text;

namespace DepVault.Cli.Crypto;

/// <summary>AES-256-GCM encryption, PBKDF2 key derivation, and HKDF-based key wrapping for the vault.</summary>
public static class VaultCrypto
{
    private const int IvBytes = 12;
    private const int TagBytes = 16;
    private const int KeyBytes = 32;
    private static readonly byte[] HkdfInfo = "depvault-ci-wrap"u8.ToArray();
    private static readonly byte[] ContentTagInfo = "depvault-content-tag"u8.ToArray();

    /// <summary>AES-256-GCM encrypt a plaintext string, returning base64-encoded (ciphertext, iv, authTag).</summary>
    public static (string Ciphertext, string Iv, string AuthTag) Encrypt(string plaintext, byte[] key)
    {
        return EncryptBytes(Encoding.UTF8.GetBytes(plaintext), key);
    }

    /// <summary>AES-256-GCM encrypt raw bytes, returning base64-encoded (ciphertext, iv, authTag).</summary>
    public static (string Ciphertext, string Iv, string AuthTag) EncryptBytes(byte[] plaintext, byte[] key)
    {
        var iv = RandomNumberGenerator.GetBytes(IvBytes);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagBytes];

        using var aes = new AesGcm(key, TagBytes);
        aes.Encrypt(iv, plaintext, ciphertext, tag);

        return (
            Convert.ToBase64String(ciphertext),
            Convert.ToBase64String(iv),
            Convert.ToBase64String(tag)
        );
    }

    /// <summary>AES-256-GCM decrypt base64-encoded ciphertext back to a UTF-8 string.</summary>
    public static string Decrypt(string ciphertext, string iv, string authTag, byte[] key)
    {
        return Encoding.UTF8.GetString(DecryptBytes(ciphertext, iv, authTag, key));
    }

    /// <summary>AES-256-GCM decrypt base64-encoded ciphertext back to raw bytes.</summary>
    public static byte[] DecryptBytes(string ciphertext, string iv, string authTag, byte[] key)
    {
        var ciphertextBytes = Convert.FromBase64String(ciphertext);
        var ivBytes = Convert.FromBase64String(iv);
        var tagBytes = Convert.FromBase64String(authTag);
        var plaintext = new byte[ciphertextBytes.Length];

        using var aes = new AesGcm(key, TagBytes);
        aes.Decrypt(ivBytes, ciphertextBytes, tagBytes, plaintext);

        return plaintext;
    }

    /// <summary>Derive a KEK from a vault password using PBKDF2-SHA256.</summary>
    public static byte[] DeriveKek(string password, byte[] salt, int iterations = 600_000)
    {
        return Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, KeyBytes);
    }

    /// <summary>Derive a CI wrap key from a raw token using HKDF-SHA256 with info "depvault-ci-wrap".</summary>
    public static byte[] DeriveCiWrapKey(string rawToken)
    {
        var ikm = Encoding.UTF8.GetBytes(rawToken);
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, ikm, KeyBytes, salt: [], info: HkdfInfo);
    }

    /// <summary>Derives the content-tag key from a DEK (HKDF-SHA256, info "depvault-content-tag"); dispose to zero it.</summary>
    public static ContentTagKey DeriveContentTagKey(byte[] dek)
    {
        return new ContentTagKey(
            HKDF.DeriveKey(HashAlgorithmName.SHA256, dek, KeyBytes, salt: [], info: ContentTagInfo));
    }

    /// <summary>
    /// Base64 HMAC-SHA256 of the plaintext under the DEK-derived content-tag key.
    /// Stable for identical content yet opaque to the server, so it can detect unchanged re-pushes.
    /// </summary>
    public static string ComputeContentTag(byte[] plaintext, ContentTagKey key)
    {
        return Convert.ToBase64String(HMACSHA256.HashData(key.Bytes, plaintext));
    }

    /// <summary>Wrap (AES-GCM encrypt) a raw DEK with a wrapping key, returning base64-encoded values.</summary>
    public static (string WrappedDek, string Iv, string Tag) WrapKey(byte[] dek, byte[] wrappingKey)
    {
        return EncryptBytes(dek, wrappingKey);
    }

    /// <summary>
    /// Verifies a KEK by unwrapping the server-stored private key; a GCM tag mismatch means a wrong password.
    /// Returns true when no wrapped key exists, allowing through rather than blocking on bad server state.
    /// </summary>
    public static bool VerifyKek(string wrappedKey, string iv, string tag, byte[] kek)
    {
        if (string.IsNullOrEmpty(wrappedKey) || string.IsNullOrEmpty(iv) || string.IsNullOrEmpty(tag))
        {
            return true;
        }

        try
        {
            var raw = UnwrapKey(wrappedKey, iv, tag, kek);
            CryptographicOperations.ZeroMemory(raw);
            return true;
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException)
        {
            return false;
        }
    }

    /// <summary>Unwrap (AES-GCM decrypt) a wrapped DEK, returning the raw key bytes.</summary>
    public static byte[] UnwrapKey(string wrappedDek, string iv, string tag, byte[] wrappingKey)
    {
        return DecryptBytes(wrappedDek, iv, tag, wrappingKey);
    }
}

/// <summary>
/// HKDF-derived key for <see cref="VaultCrypto.ComputeContentTag"/>; derive once per sync run rather than per file.
/// </summary>
public sealed class ContentTagKey : IDisposable
{
    internal ContentTagKey(byte[] bytes)
    {
        Bytes = bytes;
    }

    internal byte[] Bytes { get; }

    public void Dispose()
    {
        CryptographicOperations.ZeroMemory(Bytes);
    }
}

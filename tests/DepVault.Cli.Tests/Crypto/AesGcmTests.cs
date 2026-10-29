using System.Security.Cryptography;
using System.Text;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Tests.Crypto;

/// <summary>
/// Pins the AES-256-GCM ciphertext contract shared with the web app: base64 fields, 12-byte IV,
/// 16-byte tag kept separate from a plaintext-length ciphertext. Drift here makes existing data
/// undecryptable.
/// </summary>
public class AesGcmTests
{
    private static byte[] RandomKey() => RandomNumberGenerator.GetBytes(32);

    private static string FlipFirstByte(string b64)
    {
        var bytes = Convert.FromBase64String(b64);
        bytes[0] ^= 0xFF;
        return Convert.ToBase64String(bytes);
    }

    [Theory]
    [InlineData("hello world")]
    [InlineData("")]
    [InlineData("Hello 🌍🔐 你好世界 こんにちは")]
    [InlineData("line1\nline2\tthree\0four\r\nfive")]
    public void Encrypt_Decrypt_RoundTrips(string text)
    {
        var key = RandomKey();
        var (ct, iv, tag) = VaultCrypto.Encrypt(text, key);
        Assert.Equal(text, VaultCrypto.Decrypt(ct, iv, tag, key));
        Assert.Equal(Encoding.UTF8.GetBytes(text), VaultCrypto.DecryptBytes(ct, iv, tag, key));
    }

    [Fact]
    public void Encrypt_Decrypt_RoundTrips_LargeString()
    {
        var key = RandomKey();
        var text = new string('A', 50_000);
        var (ct, iv, tag) = VaultCrypto.Encrypt(text, key);
        Assert.Equal(text, VaultCrypto.Decrypt(ct, iv, tag, key));
    }

    [Fact]
    public void Encrypt_UsesFreshIv()
    {
        var key = RandomKey();
        var a = VaultCrypto.Encrypt("same", key);
        var b = VaultCrypto.Encrypt("same", key);
        Assert.NotEqual(a.Iv, b.Iv);
        Assert.NotEqual(a.Ciphertext, b.Ciphertext);
    }

    [Fact]
    public void Encrypt_Outputs_Base64_PlaintextLengthCiphertext_12ByteIv_16ByteTag()
    {
        const string plaintext = "1234567890";
        var (ct, iv, tag) = VaultCrypto.Encrypt(plaintext, RandomKey());
        Assert.Equal(Encoding.UTF8.GetByteCount(plaintext), Convert.FromBase64String(ct).Length);
        Assert.Equal(12, Convert.FromBase64String(iv).Length);
        Assert.Equal(16, Convert.FromBase64String(tag).Length);
    }

    [Theory]
    [InlineData("key")]
    [InlineData("ciphertext")]
    [InlineData("iv")]
    [InlineData("tag")]
    public void Decrypt_Rejects_WrongKeyOrTamperedField(string altered)
    {
        var key = RandomKey();
        var (ct, iv, tag) = VaultCrypto.Encrypt("secret", key);

        // The specific subclass, so a regression that swallows tag failures fails loudly.
        Assert.Throws<AuthenticationTagMismatchException>(() => VaultCrypto.Decrypt(
            altered == "ciphertext" ? FlipFirstByte(ct) : ct,
            altered == "iv" ? FlipFirstByte(iv) : iv,
            altered == "tag" ? FlipFirstByte(tag) : tag,
            altered == "key" ? RandomKey() : key));
    }

    [Fact]
    public void Decrypt_Rejects_FieldsMixedAcrossRows()
    {
        var key = RandomKey();
        var a = VaultCrypto.Encrypt("alpha", key);
        var b = VaultCrypto.Encrypt("bravo", key);
        Assert.Throws<AuthenticationTagMismatchException>(() => VaultCrypto.Decrypt(a.Ciphertext, b.Iv, a.AuthTag, key));
        Assert.Throws<AuthenticationTagMismatchException>(() => VaultCrypto.Decrypt(a.Ciphertext, a.Iv, b.AuthTag, key));
    }

    [Theory]
    [InlineData(16)]
    [InlineData(24)]
    public void ShorterKeys_DoNotInteropWith256BitKeys(int keyLength)
    {
        var (ct, iv, tag) = VaultCrypto.Encrypt("x", RandomNumberGenerator.GetBytes(keyLength));
        Assert.ThrowsAny<CryptographicException>(() => VaultCrypto.Decrypt(ct, iv, tag, RandomKey()));
    }

    [Fact]
    public void Decrypt_Rejects_MalformedInput()
    {
        var key = RandomKey();
        Assert.Throws<FormatException>(() => VaultCrypto.Decrypt("!!not-base64!!", "AAAA", "AAAA", key));
        // Empty is valid base64 but the IV and tag lengths are wrong.
        Assert.ThrowsAny<Exception>(() => VaultCrypto.Decrypt("", "", "", key));
    }
}

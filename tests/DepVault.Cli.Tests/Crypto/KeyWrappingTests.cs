using System.Security.Cryptography;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Tests.Crypto;

/// <summary>DEK wrapping: a 32-byte ciphertext with a separate 12-byte IV and 16-byte tag.</summary>
public class KeyWrappingTests
{
    private static byte[] RandomKey() => RandomNumberGenerator.GetBytes(32);

    [Fact]
    public void WrapKey_UnwrapKey_RoundTrips_ToAUsableKey()
    {
        var wrapping = RandomKey();
        var dek = RandomKey();
        var (wrapped, iv, tag) = VaultCrypto.WrapKey(dek, wrapping);

        var unwrapped = VaultCrypto.UnwrapKey(wrapped, iv, tag, wrapping);
        Assert.Equal(dek, unwrapped);

        var (ct, eIv, eTag) = VaultCrypto.Encrypt("secret payload", unwrapped);
        Assert.Equal("secret payload", VaultCrypto.Decrypt(ct, eIv, eTag, dek));
    }

    [Fact]
    public void WrapKey_Outputs_32ByteCiphertext_12ByteIv_16ByteTag()
    {
        // The tag is separate, not appended: concatenation would desync the web app's unwrap.
        var (wrapped, iv, tag) = VaultCrypto.WrapKey(RandomKey(), RandomKey());
        Assert.Equal(32, Convert.FromBase64String(wrapped).Length);
        Assert.Equal(12, Convert.FromBase64String(iv).Length);
        Assert.Equal(16, Convert.FromBase64String(tag).Length);
    }

    [Fact]
    public void WrapKey_UsesFreshIv()
    {
        var wrapping = RandomKey();
        var dek = RandomKey();
        var a = VaultCrypto.WrapKey(dek, wrapping);
        var b = VaultCrypto.WrapKey(dek, wrapping);
        Assert.NotEqual(a.Iv, b.Iv);
        Assert.NotEqual(a.WrappedDek, b.WrappedDek);
    }

    [Fact]
    public void UnwrapKey_Rejects_WrongKeyOrTamperedBytes()
    {
        var wrapping = RandomKey();
        var (wrapped, iv, tag) = VaultCrypto.WrapKey(RandomKey(), wrapping);
        var tampered = Convert.FromBase64String(wrapped);
        tampered[0] ^= 0xFF;

        Assert.Throws<AuthenticationTagMismatchException>(() => VaultCrypto.UnwrapKey(wrapped, iv, tag, RandomKey()));
        Assert.Throws<AuthenticationTagMismatchException>(
            () => VaultCrypto.UnwrapKey(Convert.ToBase64String(tampered), iv, tag, wrapping));
    }
}

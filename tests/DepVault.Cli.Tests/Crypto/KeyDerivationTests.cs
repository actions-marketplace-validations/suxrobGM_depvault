using System.Security.Cryptography;
using System.Text;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Tests.Crypto;

/// <summary>
/// PBKDF2-SHA256 KEK derivation and HKDF-SHA256 CI wrap keys. The parameters (600k iterations,
/// info "depvault-ci-wrap") are part of the contract with the web app and existing vaults.
/// </summary>
public class KeyDerivationTests
{
    // PBKDF2 is deliberately slow; behaviour is checked at a low cost, the 600k default separately.
    private const int FastIterations = 1_000;

    private static byte[] RandomSalt() => RandomNumberGenerator.GetBytes(16);

    [Theory]
    [InlineData("pw")]
    [InlineData("")]
    [InlineData("p@ss🔐wörd مرحبا")]
    public void DeriveKek_Is32Bytes_AndDeterministic(string password)
    {
        var salt = RandomSalt();
        var kek = VaultCrypto.DeriveKek(password, salt, FastIterations);
        Assert.Equal(32, kek.Length);
        Assert.Equal(kek, VaultCrypto.DeriveKek(password, salt, FastIterations));
    }

    [Fact]
    public void DeriveKek_Changes_WithPasswordSaltOrIterations()
    {
        var salt = RandomSalt();
        var baseline = VaultCrypto.DeriveKek("pw", salt, FastIterations);

        Assert.NotEqual(baseline, VaultCrypto.DeriveKek("other", salt, FastIterations));
        Assert.NotEqual(baseline, VaultCrypto.DeriveKek("pw", RandomSalt(), FastIterations));
        // Ignoring the iteration count would corrupt vaults whose count was upgraded.
        Assert.NotEqual(baseline, VaultCrypto.DeriveKek("pw", salt, FastIterations * 2));
    }

    [Fact]
    public void DeriveKek_DefaultsTo600kIterations()
    {
        // Changing the default without a migration would orphan every existing vault.
        var salt = RandomSalt();
        Assert.Equal(VaultCrypto.DeriveKek("pw", salt, 600_000), VaultCrypto.DeriveKek("pw", salt));
    }

    [Fact]
    public void DeriveCiWrapKey_Is32Bytes_DeterministicPerToken()
    {
        var key = VaultCrypto.DeriveCiWrapKey("token-one");
        Assert.Equal(32, key.Length);
        Assert.Equal(key, VaultCrypto.DeriveCiWrapKey("token-one"));
        Assert.NotEqual(key, VaultCrypto.DeriveCiWrapKey("token-two"));
    }

    [Fact]
    public void DeriveCiWrapKey_IsHkdfSha256_WithDepvaultInfo()
    {
        // A different info string would stop the CLI unwrapping DEKs wrapped by the web app.
        const string token = "token-xyz";
        var expected = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            Encoding.UTF8.GetBytes(token),
            32,
            salt: [],
            info: Encoding.UTF8.GetBytes("depvault-ci-wrap"));
        Assert.Equal(expected, VaultCrypto.DeriveCiWrapKey(token));
    }
}

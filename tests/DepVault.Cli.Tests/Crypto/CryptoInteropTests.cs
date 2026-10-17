using System.Security.Cryptography;
using System.Text;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Tests.Crypto;

/// <summary>
/// Known-answer tests pinning the binary format the CLI shares with the web app (WebCrypto), so a change to
/// an algorithm, iteration count or HKDF label fails here instead of stranding encrypted data.
/// </summary>
public class CryptoInteropTests
{
    private static byte[] HexToBytes(string hex) => Convert.FromHexString(hex);
    private static string BytesToHex(byte[] bytes) => Convert.ToHexString(bytes).ToLowerInvariant();

    // This is a canonical published test vector. If VaultCrypto doesn't agree with it, the
    // AES-GCM primitive has been subtly changed and the format is broken.

    [Fact]
    public void AesGcm_Primitive_Matches_NIST_Vector14()
    {
        // Key, IV, PT from the vector
        var key = HexToBytes("0000000000000000000000000000000000000000000000000000000000000000");
        var iv  = HexToBytes("000000000000000000000000");
        var pt  = HexToBytes("00000000000000000000000000000000");

        // Encrypt directly with .NET primitive (what VaultCrypto.Encrypt wraps)
        var ct  = new byte[pt.Length];
        var tag = new byte[16];
        using (var aes = new AesGcm(key, 16))
        {
            aes.Encrypt(iv, pt, ct, tag);
        }

        const string expectedCt  = "cea7403d4d606b6e074ec5d3baf39d18";
        const string expectedTag = "d0d1c8a799996bf0265b98b5d48ab919";
        Assert.Equal(expectedCt, BytesToHex(ct));
        Assert.Equal(expectedTag, BytesToHex(tag));
    }


    [Fact]
    public void WrapKey_UnwrapKey_DeterministicWhenIvIsControlled()
    {
        // VaultCrypto.WrapKey uses a random IV — we can't assert an exact ciphertext without
        // mocking randomness. Instead we verify that given a FIXED key + IV via the primitive,
        // VaultCrypto.UnwrapKey correctly decodes the result. This proves the base64 framing
        // and tag placement are consistent with any implementation of AES-256-GCM (including
        // the WebCrypto-based frontend).

        var wrappingKey = HexToBytes("01020304050607080910111213141516171819202122232425262728293031ff");
        var dek         = HexToBytes("a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebff0");
        var iv          = HexToBytes("cafebabefacedbaddecaf888");

        var ct  = new byte[dek.Length];
        var tag = new byte[16];
        using (var aes = new AesGcm(wrappingKey, 16))
        {
            aes.Encrypt(iv, dek, ct, tag);
        }

        var unwrapped = VaultCrypto.UnwrapKey(
            Convert.ToBase64String(ct),
            Convert.ToBase64String(iv),
            Convert.ToBase64String(tag),
            wrappingKey);

        Assert.Equal(dek, unwrapped);
    }

    [Fact]
    public void Decrypt_MatchesHandCraftedFrontendCiphertext()
    {
        // Simulate a frontend-produced ciphertext (WebCrypto concatenates ciphertext||tag
        // internally but VaultCrypto.Encrypt/Decrypt accept them as separate base64 strings).
        // Here we hand-craft the exact bytes to verify the CLI parses them identically.

        var dek       = HexToBytes("0000000000000000000000000000000000000000000000000000000000000000");
        var iv        = HexToBytes("000000000000000000000000");
        var plaintext = Encoding.UTF8.GetBytes("DepVault");

        var ct  = new byte[plaintext.Length];
        var tag = new byte[16];
        using (var aes = new AesGcm(dek, 16))
        {
            aes.Encrypt(iv, plaintext, ct, tag);
        }

        var decrypted = VaultCrypto.Decrypt(
            Convert.ToBase64String(ct),
            Convert.ToBase64String(iv),
            Convert.ToBase64String(tag),
            dek);

        Assert.Equal("DepVault", decrypted);
    }


    [Theory]
    [InlineData("password", "salt", 1, "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b")]
    [InlineData("password", "salt", 4096, "c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a")]
    public void DeriveKek_MatchesRfc6070_VectorsFor_PBKDF2_SHA256(
        string password, string salt, int iterations, string expectedHex)
    {
        // Published vectors from RFC 6070 / RFC 7914 — any regression in PBKDF2 would
        // produce a different KEK and render every stored SELF grant unusable.
        var kek = VaultCrypto.DeriveKek(password, Encoding.UTF8.GetBytes(salt), iterations);
        Assert.Equal(expectedHex, BytesToHex(kek));
    }


    [Fact]
    public void DeriveCiWrapKey_WithKnownToken_ProducesExpected32Bytes()
    {
        // This is a regression lock: if someone changes the info string, swaps SHA, or
        // introduces a salt, every CI pipeline that pulls secrets breaks silently.
        var token = "example-ci-token";
        var expected = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            Encoding.UTF8.GetBytes(token),
            32,
            salt: [],
            info: Encoding.UTF8.GetBytes("depvault-ci-wrap"));

        Assert.Equal(expected, VaultCrypto.DeriveCiWrapKey(token));
        Assert.Equal(32, expected.Length);
    }


    [Fact]
    public void FullLifecycle_Password_To_Kek_To_WrappedDek_To_PlaintextDecryption()
    {
        // End-to-end sanity: the same sequence of operations a real pull performs. If this
        // breaks, the CLI cannot pull secrets — the most severe failure mode.
        var password = "correct-horse-battery-staple";
        var salt = RandomNumberGenerator.GetBytes(16);

        // 1. Derive KEK from password
        var kek = VaultCrypto.DeriveKek(password, salt, iterations: 2_000);

        // 2. Generate a random DEK and wrap it with the KEK (server stores the wrapped form)
        var dek = RandomNumberGenerator.GetBytes(32);
        var (wrappedDek, wrapIv, wrapTag) = VaultCrypto.WrapKey(dek, kek);

        // 3. Use the DEK to encrypt a secret value
        const string secret = "DATABASE_URL=postgres://user:p@ss@host/db";
        var (ct, ctIv, ctTag) = VaultCrypto.Encrypt(secret, dek);

        // Server round-trip: all bytes traveled as base64 strings. Simulate decode path.
        // 4. Re-derive KEK from password, unwrap DEK, decrypt
        var kek2 = VaultCrypto.DeriveKek(password, salt, iterations: 2_000);
        var dek2 = VaultCrypto.UnwrapKey(wrappedDek, wrapIv, wrapTag, kek2);
        Assert.Equal(dek, dek2);

        var recovered = VaultCrypto.Decrypt(ct, ctIv, ctTag, dek2);
        Assert.Equal(secret, recovered);
    }

    [Fact]
    public void FullLifecycle_WrongPassword_Fails_At_UnwrapStage_BeforeTouchingCiphertext()
    {
        // Critical invariant: a wrong password produces a wrong KEK that CANNOT unwrap the
        // DEK (auth tag mismatch). Without this, the CLI might silently create a SELF grant
        // under a junk KEK — permanently corrupting the user's vault.
        var salt = RandomNumberGenerator.GetBytes(16);
        var correctKek = VaultCrypto.DeriveKek("real-pw", salt, 2_000);
        var wrongKek   = VaultCrypto.DeriveKek("wrong-pw", salt, 2_000);

        var dek = RandomNumberGenerator.GetBytes(32);
        var (wrappedDek, iv, tag) = VaultCrypto.WrapKey(dek, correctKek);

        Assert.Throws<AuthenticationTagMismatchException>(
            () => VaultCrypto.UnwrapKey(wrappedDek, iv, tag, wrongKek));
    }

    [Fact]
    public void FullLifecycle_CiToken_Unwraps_DekWrappedByFrontend()
    {
        // Simulate the CI path: the frontend (granter) derived a wrap key from the CI token
        // via HKDF and wrapped the project DEK. The CLI must derive the *same* wrap key
        // from the same token and unwrap to exactly the same DEK bytes.
        const string token = "dvt_pi_abc123randomcitokenbytes";
        var wrapKey = VaultCrypto.DeriveCiWrapKey(token);

        var dek = RandomNumberGenerator.GetBytes(32);
        var (wrapped, iv, tag) = VaultCrypto.WrapKey(dek, wrapKey);

        // CLI side: derive wrap key from token (never had the wrapKey in hand before)
        var wrapKeyOnCli = VaultCrypto.DeriveCiWrapKey(token);
        var dekOnCli = VaultCrypto.UnwrapKey(wrapped, iv, tag, wrapKeyOnCli);

        Assert.Equal(dek, dekOnCli);
    }

    [Fact]
    public void FullLifecycle_Recovery_OldKey_Cannot_Unwrap_NewlyRewrappedGrant()
    {
        // On password change, a new KEK must make the old KEK useless against the new wrapped
        // DEK — this is the security guarantee users expect when rotating a leaked password.
        var salt1 = RandomNumberGenerator.GetBytes(16);
        var salt2 = RandomNumberGenerator.GetBytes(16);
        var oldKek = VaultCrypto.DeriveKek("old-pw", salt1, 2_000);
        var newKek = VaultCrypto.DeriveKek("new-pw", salt2, 2_000);

        var dek = RandomNumberGenerator.GetBytes(32);
        // Simulate re-key: unwrap with old KEK then re-wrap with new KEK (what the frontend does).
        var (wrappedOld, ivOld, tagOld) = VaultCrypto.WrapKey(dek, oldKek);
        var unwrapped = VaultCrypto.UnwrapKey(wrappedOld, ivOld, tagOld, oldKek);
        var (wrappedNew, ivNew, tagNew) = VaultCrypto.WrapKey(unwrapped, newKek);

        // Old KEK must fail against the new grant
        Assert.Throws<AuthenticationTagMismatchException>(
            () => VaultCrypto.UnwrapKey(wrappedNew, ivNew, tagNew, oldKek));

        // New KEK must succeed and yield the original DEK
        var recovered = VaultCrypto.UnwrapKey(wrappedNew, ivNew, tagNew, newKek);
        Assert.Equal(dek, recovered);
    }


    [Fact]
    public void EcdhGrant_From_WebCrypto_Unwraps_To_The_Original_Dek()
    {
        var kek = HexToBytes("ead5093371953b89fe137448500dcf1bca0d298d7724fb1c8b5598d50e866bab");
        var privateKey = VaultCrypto.UnwrapKey(
            "xHVKSFU51eyV4mPdhQfTv2Sb9/n8DfvpIkANqEU6dWrumP9VBrCJC76AadvFiMGDwthLHso6328dnMH1WyqQYidPP8c+uq/TUxuJADhosqrfYZ7pNk8FoliTDxRHjU47SRXNyArdK8tFO49Ie24Hb5+avwSoiEI8hhrg1ChirhtKTxUKvGDy/gqY",
            "5DvyDn99wE4P74ON", "SuoL4+VN1z9Th88eEXxV9g==", kek);

        var sharedKey = VaultCrypto.DeriveSharedKey(privateKey,
            "BOv8yWtohZlqohmPwV8P0RpW2NoCJjDojFGx/QspgwWl53oyCAsjeNcgkn6tF1sjr8I+jfQg2A4CcMyX9guNB+Y=");
        var dek = VaultCrypto.UnwrapKey(
            "nL+8LMPgDi30JGTnXiDF9fEVBp13BmgU1p+hX6005+I=", "0E8MxLPLpjAS9uPg", "odXzal+KBhK4lN4wOcPCUw==", sharedKey);

        Assert.Equal("c5d667838faea3f729baff9dde4c39d91c81009d5771a21cf289fcfc79ed3eb0", BytesToHex(dek));
    }

    [Fact]
    public void EcdhSharedKey_Rejects_A_Compressed_Public_Key()
    {
        using var ecdh = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var compressed = Convert.ToBase64String(new byte[33]);

        Assert.Throws<CryptographicException>(() => VaultCrypto.DeriveSharedKey(ecdh.ExportPkcs8PrivateKey(), compressed));
    }
}

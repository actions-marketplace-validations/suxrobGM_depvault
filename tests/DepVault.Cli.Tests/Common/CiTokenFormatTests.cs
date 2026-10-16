using DepVault.Cli.Common;

namespace DepVault.Cli.Tests.Common;

/// <summary>Only split tokens are accepted, so the key part can never be sent as the bearer.</summary>
public sealed class CiTokenFormatTests
{
    [Fact]
    public void Split_SplitToken_SeparatesBearerAndKey()
    {
        var (bearer, key) = CiTokenFormat.Split("dvci_auth123.keyABC");

        Assert.Equal("dvci_auth123", bearer);
        Assert.Equal("keyABC", key);
    }

    [Fact]
    public void Split_KeyContainingDot_SplitsOnFirstDot()
    {
        var (bearer, key) = CiTokenFormat.Split("dvci_auth.key.part");

        Assert.Equal("dvci_auth", bearer);
        Assert.Equal("key.part", key);
    }

    [Theory]
    [InlineData("dvci_legacytokenwithoutkeypart")]
    [InlineData("dvci_auth.")]
    [InlineData(".keyonly")]
    [InlineData("")]
    public void Split_NotASplitToken_Throws(string token)
    {
        Assert.Throws<CiTokenFormatException>(() => CiTokenFormat.Split(token));
    }
}

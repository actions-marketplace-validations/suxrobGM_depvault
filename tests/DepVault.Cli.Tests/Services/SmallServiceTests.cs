using DepVault.Cli.Auth;
using DepVault.Cli.Config;
using DepVault.Cli.Services;

namespace DepVault.Cli.Tests.Services;

public class UpdateChecksumTests
{
    private const string Sums = "abc123  depvault-linux-x64.tar.gz\nDEF456 *depvault-win-x64.zip\n";

    [Fact]
    public void Finds_The_Hash_For_An_Archive_In_Text_Or_Binary_Mode()
    {
        Assert.Equal("abc123", UpdateService.ExpectedHash(Sums, "depvault-linux-x64.tar.gz"));
        Assert.Equal("def456", UpdateService.ExpectedHash(Sums, "depvault-win-x64.zip"));
    }

    [Fact]
    public void Unlisted_Archive_Has_No_Hash()
    {
        Assert.Null(UpdateService.ExpectedHash(Sums, "depvault-osx-arm64.tar.gz"));
    }
}

public class SecretRedactionTests
{
    [Fact]
    public void Keeps_Only_A_Short_Prefix()
    {
        Assert.Equal("AKIA********", SecretDetector.Redact("AKIAIOSFODNN7EXAMPLE"));
        Assert.Equal("ab********", SecretDetector.Redact("ab"));
    }
}

/// <summary>Stored tokens belong to the server that issued them.</summary>
public class SessionTests
{
    private static Session SessionFor(string credentialServer, string configuredServer) => new(
        new CliEnvironment(),
        new MemoryCredentialStore(new StoredCredentials { Server = credentialServer, AccessToken = "token" }),
        new FixedConfigService(configuredServer));

    [Fact]
    public void Credentials_For_The_Configured_Server_Are_Used()
    {
        Assert.NotNull(SessionFor("https://depvault.com/", "https://depvault.com").User);
    }

    [Fact]
    public void Credentials_From_Another_Server_Count_As_Logged_Out()
    {
        var session = SessionFor("https://depvault.com", "https://evil.example");

        Assert.Null(session.User);
        Assert.Throws<DepVault.Cli.Common.CliException>(() => session.RequireUser());
    }
}

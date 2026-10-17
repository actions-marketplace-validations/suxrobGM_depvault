using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Tests.Services;

public class SecretFilePatternsTests
{
    [Theory]
    [InlineData(".env")]
    [InlineData(".env.local")]
    [InlineData(".env.production.local")]
    [InlineData("backend.env")]
    [InlineData("backend.env.staging")]
    [InlineData("appsettings.Development.json")]
    [InlineData("google-services.json")]
    [InlineData("GoogleService-Info.plist")]
    [InlineData("firebase-adminsdk-key.json")]
    [InlineData("release-keystore.jks")]
    [InlineData("AuthKey_TP5L5VC4JF.p8")]
    [InlineData("local.properties")]
    [InlineData("prod.tfvars")]
    public void Offers_Secret_Looking_Files(string name)
    {
        Assert.True(SecretFilePatterns.IsCandidate(name));
    }

    [Theory]
    [InlineData(".env.example")]
    [InlineData(".env.sample")]
    [InlineData(".env.template")]
    [InlineData("appsettings.json.bak")]
    [InlineData("package.json")]
    [InlineData("server.crt")]
    [InlineData("settings.jsonc")]
    [InlineData("Designing-notes.pdf")]
    public void Skips_Templates_And_Ordinary_Files(string name)
    {
        Assert.False(SecretFilePatterns.IsCandidate(name));
    }

    [Theory]
    [InlineData("packages")]
    [InlineData("deploy")]
    [InlineData("generated")]
    public void Searches_Folders_That_Often_Hold_Real_Env_Files(string folder)
    {
        Assert.DoesNotContain(folder, SecretFilePatterns.SkippedDirectories);
    }
}

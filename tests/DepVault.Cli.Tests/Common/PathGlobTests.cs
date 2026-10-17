using DepVault.Cli.Common;

namespace DepVault.Cli.Tests.Common;

public class PathGlobTests
{
    [Theory]
    [InlineData("deploy/**", "deploy/.env", true)]
    [InlineData("deploy/**", "deploy/secrets/box-a/.env", true)]
    [InlineData("deploy/**", "apps/api/.env", false)]
    [InlineData("deploy/secrets/*/.env", "deploy/secrets/box-a/.env", true)]
    [InlineData("deploy/secrets/*/.env", "deploy/secrets/a/b/.env", false)]
    [InlineData("*.pem", "certs/server.pem", true)]
    [InlineData("**/.env", ".env", true)]
    [InlineData("**/.env", "apps/api/.env", true)]
    [InlineData(".env", "apps/api/.env", true)]
    [InlineData("/.env", ".env", true)]
    [InlineData("/.env", "apps/api/.env", false)]
    [InlineData("/apps/api/**", "apps/api/.env", true)]
    [InlineData("references/", "references/x/config.json", true)]
    [InlineData("apps/?pi/.env", "apps/api/.env", true)]
    public void IsMatch(string pattern, string path, bool expected)
    {
        Assert.Equal(expected, PathGlob.IsMatch(pattern, path));
    }
}

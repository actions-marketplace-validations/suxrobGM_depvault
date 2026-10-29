using DepVault.Cli.Common;
using DepVault.Cli.Config;

namespace DepVault.Cli.Auth;

public enum AuthMode
{
    None,
    CiToken,
    User
}

/// <summary>Who the CLI acts as: a CI token, the logged-in user, or nobody.</summary>
public sealed class Session(CliEnvironment env, ICredentialStore credentialStore, IConfigService configService)
{
    /// <summary>Stored credentials, only when issued by the configured server.</summary>
    public StoredCredentials? User =>
        credentialStore.Load() is { } creds
        && string.Equals(creds.Server.TrimEnd('/'), configService.Load().Server.TrimEnd('/'),
            StringComparison.OrdinalIgnoreCase)
            ? creds
            : null;

    public AuthMode Mode => env.IsCi ? AuthMode.CiToken : User is not null ? AuthMode.User : AuthMode.None;

    /// <summary>The logged-in user; throws in CI (tokens can only pull) or when not logged in.</summary>
    public StoredCredentials RequireUser()
    {
        if (env.IsCi)
        {
            throw new CliException("CI tokens can only pull files: use 'depvault pull' in pipelines.");
        }

        return User ?? throw new CliException(
            $"Not logged in to {configService.Load().Server}. Run 'depvault login' first.");
    }
}

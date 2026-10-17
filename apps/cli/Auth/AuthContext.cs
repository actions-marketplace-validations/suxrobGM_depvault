using DepVault.Cli.Config;
using DepVault.Cli.Output;

namespace DepVault.Cli.Auth;

public enum AuthMode
{
    None,
    CiToken,
    Jwt
}

/// <summary>Bundles the shared deps that every command needs (auth, config, output, prompter).</summary>
public sealed class AuthContext(
    ICredentialStore credentialStore,
    IConfigService configService,
    IOutputFormatter output,
    IConsolePrompter prompter)
{
    public IOutputFormatter Output => output;
    public IConsolePrompter Prompter => prompter;
    public IConfigService Config => configService;

    /// <summary>The <c>DEPVAULT_TOKEN</c> value, or null when not running with a CI token.</summary>
    public static string? CiToken =>
        Environment.GetEnvironmentVariable(Constants.CiTokenEnvVar) is { Length: > 0 } token ? token : null;

    public AuthMode GetAuthMode()
    {
        if (CiToken is not null)
        {
            return AuthMode.CiToken;
        }

        return credentialStore.Load() is not null ? AuthMode.Jwt : AuthMode.None;
    }

    public bool RequireAuth()
    {
        if (GetAuthMode() == AuthMode.None)
        {
            output.PrintError("Not authenticated. Run 'depvault login' first.");
            return false;
        }

        return true;
    }

    public bool IsCiMode() => GetAuthMode() == AuthMode.CiToken;
}

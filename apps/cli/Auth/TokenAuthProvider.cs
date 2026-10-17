using DepVault.Cli.Common;
using DepVault.Cli.Config;
using Microsoft.Kiota.Abstractions;
using Microsoft.Kiota.Abstractions.Authentication;

namespace DepVault.Cli.Auth;

/// <summary>Kiota auth provider that adds the Bearer token from stored credentials or DEPVAULT_TOKEN.</summary>
public sealed class TokenAuthProvider(ICredentialStore credentialStore) : IAuthenticationProvider
{
    public Task AuthenticateRequestAsync(
        RequestInformation request,
        Dictionary<string, object>? additionalAuthenticationContext = null,
        CancellationToken cancellationToken = default)
    {
        var token = ResolveToken();
        if (!string.IsNullOrEmpty(token))
        {
            request.Headers.Add("Authorization", $"Bearer {token}");
        }

        return Task.CompletedTask;
    }

    private string? ResolveToken()
    {
        var envToken = AuthContext.CiToken;
        if (envToken is not null)
        {
            // Send only the bearer part — the key part must never reach the server
            return CiTokenFormat.Split(envToken).BearerPart;
        }

        return credentialStore.Load()?.AccessToken;
    }
}

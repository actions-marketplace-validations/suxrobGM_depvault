using DepVault.Cli.Common;
using DepVault.Cli.Config;
using Microsoft.Kiota.Abstractions;
using Microsoft.Kiota.Abstractions.Authentication;

namespace DepVault.Cli.Auth;

/// <summary>Adds the Bearer token: the auth part of <c>DEPVAULT_TOKEN</c>, else the user's access token.</summary>
public sealed class TokenAuthProvider(CliEnvironment env, ICredentialStore credentialStore) : IAuthenticationProvider
{
    public Task AuthenticateRequestAsync(
        RequestInformation request,
        Dictionary<string, object>? additionalAuthenticationContext = null,
        CancellationToken cancellationToken = default)
    {
        // The key part of a CI token must never reach the server.
        var token = env.CiToken is { } ciToken
            ? CiTokenFormat.Split(ciToken).BearerPart
            : UserTokenFor(request.URI);

        if (!string.IsNullOrEmpty(token))
        {
            request.Headers.Add("Authorization", $"Bearer {token}");
        }

        return Task.CompletedTask;
    }

    /// <summary>The access token, only for requests to the server that issued it.</summary>
    private string? UserTokenFor(Uri uri)
    {
        var creds = credentialStore.Load();
        return creds is not null
               && uri.AbsoluteUri.StartsWith(creds.Server.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase)
            ? creds.AccessToken
            : null;
    }
}

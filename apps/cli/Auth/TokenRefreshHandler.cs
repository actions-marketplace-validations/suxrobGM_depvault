using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using DepVault.Cli.Config;

namespace DepVault.Cli.Auth;

/// <summary>
///     DelegatingHandler that intercepts 401 responses and attempts to refresh
///     the access token using the stored refresh token before retrying. Allows
///     one refresh attempt per request (not per process) so long-lived REPL
///     sessions keep refreshing across repeated token expiries.
/// </summary>
internal sealed class TokenRefreshHandler(ICredentialStore credentialStore, string serverBaseUrl)
    : DelegatingHandler
{
    private readonly SemaphoreSlim refreshLock = new(1, 1);

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = await base.SendAsync(request, cancellationToken);

        if (response.StatusCode != HttpStatusCode.Unauthorized)
        {
            return response;
        }

        // CI tokens are not refreshable; a 401 in CI mode is terminal
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable(Constants.CiTokenEnvVar)))
        {
            return response;
        }

        var failedToken = GetBearerToken(request);
        if (failedToken is null)
        {
            return response;
        }

        string retryToken;
        await refreshLock.WaitAsync(cancellationToken);
        try
        {
            // Re-read from disk: a concurrent request in this process or another
            // depvault process may have rotated the tokens already
            var credentials = credentialStore.Reload();
            if (credentials is null)
            {
                return response;
            }

            if (!string.Equals(credentials.AccessToken, failedToken, StringComparison.Ordinal))
            {
                retryToken = credentials.AccessToken;
            }
            else
            {
                if (string.IsNullOrEmpty(credentials.RefreshToken))
                {
                    return response;
                }

                var newTokens = await TryRefreshAsync(credentials.RefreshToken, cancellationToken);
                if (newTokens is null)
                {
                    return response;
                }

                credentialStore.Save(new StoredCredentials
                {
                    AccessToken = newTokens.AccessToken,
                    RefreshToken = newTokens.RefreshToken,
                    UserId = credentials.UserId,
                    Email = credentials.Email
                });
                retryToken = newTokens.AccessToken;
            }
        }
        finally
        {
            refreshLock.Release();
        }

        response.Dispose();
        return await CloneAndRetryAsync(request, retryToken, cancellationToken);
    }

    /// <summary>
    ///     Reads the bearer token the failing request carried. Kiota adds the header via
    ///     TryAddWithoutValidation, so fall back to raw header values when the typed
    ///     Authorization property is not populated.
    /// </summary>
    private static string? GetBearerToken(HttpRequestMessage request)
    {
        if (request.Headers.Authorization is { Scheme: "Bearer", Parameter.Length: > 0 })
        {
            return request.Headers.Authorization.Parameter;
        }

        if (request.Headers.TryGetValues("Authorization", out var values))
        {
            var raw = values.FirstOrDefault();
            if (raw is not null && raw.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                return raw["Bearer ".Length..];
            }
        }

        return null;
    }

    private async Task<RefreshResponse?> TryRefreshAsync(
        string refreshToken, CancellationToken cancellationToken)
    {
        try
        {
            using var refreshRequest = new HttpRequestMessage(HttpMethod.Post,
                $"{serverBaseUrl.TrimEnd('/')}/api/auth/refresh");
            refreshRequest.Headers.Add("Cookie", $"refresh_token={refreshToken}");

            using var refreshResponse = await base.SendAsync(refreshRequest, cancellationToken);
            if (!refreshResponse.IsSuccessStatusCode)
            {
                return null;
            }

            var json = await refreshResponse.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize(json, RefreshJsonContext.Default.RefreshResponse);
        }
        catch
        {
            return null;
        }
    }

    private async Task<HttpResponseMessage> CloneAndRetryAsync(
        HttpRequestMessage original, string newAccessToken, CancellationToken cancellationToken)
    {
        var clone = new HttpRequestMessage(original.Method, original.RequestUri);

        foreach (var header in original.Headers)
        {
            if (string.Equals(header.Key, "Authorization", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        clone.Headers.TryAddWithoutValidation("Authorization", $"Bearer {newAccessToken}");

        if (original.Content is not null)
        {
            var contentBytes = await original.Content.ReadAsByteArrayAsync(cancellationToken);
            clone.Content = new ByteArrayContent(contentBytes);

            foreach (var header in original.Content.Headers)
            {
                clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
        }

        return await base.SendAsync(clone, cancellationToken);
    }
}

internal sealed class RefreshResponse
{
    [JsonPropertyName("accessToken")]
    public string AccessToken { get; set; } = "";

    [JsonPropertyName("refreshToken")]
    public string RefreshToken { get; set; } = "";
}

[JsonSerializable(typeof(RefreshResponse))]
internal partial class RefreshJsonContext : JsonSerializerContext;

using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using DepVault.Cli.Config;

namespace DepVault.Cli.Auth;

/// <summary>On a 401, refreshes the access token once and retries the request. CI tokens aren't refreshable.</summary>
internal sealed class TokenRefreshHandler(ICredentialStore credentialStore, string serverBaseUrl, bool isCi)
    : DelegatingHandler
{
    private readonly SemaphoreSlim refreshLock = new(1, 1);

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = await base.SendAsync(request, cancellationToken);
        if (response.StatusCode != HttpStatusCode.Unauthorized || isCi
            || request.Headers.Authorization is not { Scheme: "Bearer", Parameter: { Length: > 0 } failedToken })
        {
            return response;
        }

        string retryToken;
        await refreshLock.WaitAsync(cancellationToken);
        try
        {
            // Load re-reads a changed file, so a rotation by a concurrent request or process is picked up.
            var credentials = credentialStore.Load();
            if (credentials is null)
            {
                return response;
            }

            if (credentials.AccessToken != failedToken)
            {
                retryToken = credentials.AccessToken;
            }
            else
            {
                var refreshed = string.IsNullOrEmpty(credentials.RefreshToken)
                    ? null
                    : await TryRefreshAsync(credentials.RefreshToken, cancellationToken);
                if (refreshed is null)
                {
                    return response;
                }

                credentials.AccessToken = refreshed.AccessToken;
                credentials.RefreshToken = refreshed.RefreshToken;
                credentialStore.Save(credentials);
                retryToken = refreshed.AccessToken;
            }
        }
        finally
        {
            refreshLock.Release();
        }

        response.Dispose();
        return await RetryAsync(request, retryToken, cancellationToken);
    }

    private async Task<RefreshResponse?> TryRefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Put, $"{serverBaseUrl.TrimEnd('/')}/api/auth/session");
            request.Headers.Add("Cookie", $"refresh_token={refreshToken}");

            using var response = await base.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize(json, RefreshJsonContext.Default.RefreshResponse);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException)
        {
            return null;
        }
    }

    private async Task<HttpResponseMessage> RetryAsync(
        HttpRequestMessage original, string accessToken, CancellationToken cancellationToken)
    {
        var clone = new HttpRequestMessage(original.Method, original.RequestUri);
        foreach (var header in original.Headers.Where(h => h.Key != "Authorization"))
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        clone.Headers.TryAddWithoutValidation("Authorization", $"Bearer {accessToken}");

        if (original.Content is not null)
        {
            clone.Content = new ByteArrayContent(await original.Content.ReadAsByteArrayAsync(cancellationToken));
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

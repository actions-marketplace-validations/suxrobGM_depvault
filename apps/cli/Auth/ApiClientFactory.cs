using System.Text;
using DepVault.Cli.Config;
using Microsoft.Kiota.Abstractions.Authentication;
using Microsoft.Kiota.Abstractions.Serialization;
using Microsoft.Kiota.Http.HttpClientLibrary;
using Microsoft.Kiota.Serialization.Form;
using Microsoft.Kiota.Serialization.Json;
using Microsoft.Kiota.Serialization.Multipart;
using Microsoft.Kiota.Serialization.Text;
using KiotaClient = DepVault.Cli.ApiClient;

namespace DepVault.Cli.Auth;

public interface IApiClientFactory
{
    /// <summary>The client for the configured server, created once per process.</summary>
    KiotaClient.ApiClient Create();

    /// <summary>A client for another server, e.g. <c>login --server</c> before the URL is saved.</summary>
    KiotaClient.ApiClient CreateFor(string server);
}

public sealed class ApiClientFactory(
    IConfigService configService,
    IAuthenticationProvider authProvider,
    ICredentialStore credentialStore,
    CliEnvironment env) : IApiClientFactory
{
    private KiotaClient.ApiClient? client;

    public KiotaClient.ApiClient Create() => client ??= CreateFor(configService.Load().Server);

    public KiotaClient.ApiClient CreateFor(string server)
    {
        var refreshHandler = new TokenRefreshHandler(credentialStore, server, env.IsCi)
        {
            InnerHandler = new HttpClientHandler()
        };

        var httpClient = new HttpClient(new JsonContentTypeHandler(refreshHandler)) { BaseAddress = new Uri(server) };
        var adapter = new HttpClientRequestAdapter(authProvider, httpClient: httpClient) { BaseUrl = server };

        var apiClient = new KiotaClient.ApiClient(adapter);
        RegisterSerializers();
        return apiClient;
    }

    /// <summary>Native AOT trims the reflection the generated client uses to fill these registries.</summary>
    private static void RegisterSerializers()
    {
        var writers = SerializationWriterFactoryRegistry.DefaultInstance.ContentTypeAssociatedFactories;
        writers.Clear();
        writers["application/json"] = new JsonSerializationWriterFactory();
        writers["text/plain"] = new TextSerializationWriterFactory();
        writers["application/x-www-form-urlencoded"] = new FormSerializationWriterFactory();
        writers["multipart/form-data"] = new MultipartSerializationWriterFactory();

        var parsers = ParseNodeFactoryRegistry.DefaultInstance.ContentTypeAssociatedFactories;
        parsers.Clear();
        parsers["application/json"] = new JsonParseNodeFactory();
        parsers["text/plain"] = new TextParseNodeFactory();
        parsers["application/x-www-form-urlencoded"] = new FormParseNodeFactory();
    }
}

/// <summary>Relabels JSON bodies served as text/plain (by the production reverse proxy) as application/json.</summary>
internal sealed class JsonContentTypeHandler(HttpMessageHandler innerHandler) : DelegatingHandler(innerHandler)
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = await base.SendAsync(request, cancellationToken);

        if (string.Equals(response.Content.Headers.ContentType?.MediaType, "text/plain",
                StringComparison.OrdinalIgnoreCase))
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (body.Length > 0 && body[0] is '{' or '[')
            {
                response.Content = new StringContent(body, Encoding.UTF8, "application/json");
            }
        }

        return response;
    }
}

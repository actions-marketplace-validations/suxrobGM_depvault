using System.Net;
using System.Text;
using DepVault.Cli.Common;
using Microsoft.Kiota.Abstractions.Authentication;
using Microsoft.Kiota.Http.HttpClientLibrary;
using KiotaClient = DepVault.Cli.ApiClient;

namespace DepVault.Cli.Tests.Common;

/// <summary>Plan limits are recognised by the server's X-Error-Reason header, through the real generated client.</summary>
public sealed class ApiErrorsTests
{
    [Fact]
    public async Task IsPlanLimit_TaggedForbidden_IsPlanLimit()
    {
        var ex = await CaptureAsync(HttpStatusCode.Forbidden, "PLAN_LIMIT");

        Assert.True(ApiErrors.IsPlanLimit(ex));
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden, null)]
    [InlineData(HttpStatusCode.Conflict, "PLAN_LIMIT")]
    public async Task IsPlanLimit_UntaggedOrNotForbidden_IsNotPlanLimit(HttpStatusCode status, string? reason)
    {
        var ex = await CaptureAsync(status, reason);

        Assert.False(ApiErrors.IsPlanLimit(ex));
    }

    private static async Task<Exception> CaptureAsync(HttpStatusCode status, string? reason)
    {
        using var httpClient = new HttpClient(new StubHandler(status, reason));
        var adapter = new HttpClientRequestAdapter(new AnonymousAuthenticationProvider(), httpClient: httpClient)
        {
            BaseUrl = "http://localhost",
        };
        var client = new KiotaClient.ApiClient(adapter);

        return await Assert.ThrowsAnyAsync<Exception>(() => client.Api.Projects.GetAsync());
    }

    private sealed class StubHandler(HttpStatusCode status, string? reason) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = $$"""{"code":{{(int)status}},"message":"Project limit reached (1/1). Upgrade your plan."}""";
            var response = new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };
            if (reason is not null)
            {
                response.Headers.Add("x-error-reason", reason);
            }
            return Task.FromResult(response);
        }
    }
}

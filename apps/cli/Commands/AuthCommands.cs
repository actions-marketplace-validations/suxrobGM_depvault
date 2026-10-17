using System.CommandLine;
using System.Diagnostics;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
using Spectre.Console;
using TokenNs = DepVault.Cli.ApiClient.Api.Auth.Device.Token;

namespace DepVault.Cli.Commands;

public sealed class AuthCommands(
    IApiClientFactory clientFactory,
    IConfigService configService,
    ICredentialStore credentialStore,
    Session session,
    CliEnvironment env,
    VaultUnlocker vaultUnlocker,
    IConsolePrompter prompter,
    Ui ui)
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    public Command CreateLoginCommand()
    {
        var serverOpt = new Option<string?>("--server") { Description = "API server URL (saved once login succeeds)" };
        var cmd = new Command("login", "Authenticate via browser") { serverOpt };

        cmd.SetAction(async (parseResult, ct) =>
        {
            if (env.IsCi)
            {
                throw new CliException("Can't log in with DEPVAULT_TOKEN set; unset it to log in as yourself.");
            }

            if (!prompter.IsInteractive)
            {
                throw new CliException("Browser login needs an interactive terminal. Use DEPVAULT_TOKEN in CI.");
            }

            var server = parseResult.GetValue(serverOpt) is { } url
                ? ConfigService.NormalizeServer(url)
                : configService.Load().Server;
            var client = clientFactory.CreateFor(server);

            var device = await client.Api.Auth.Device.PostAsync(cancellationToken: ct);
            if (device?.DeviceCode is null || device.UserCode is null || device.VerificationUrl is null)
            {
                throw new CliException("The server didn't return a login code.");
            }

            ui.Line();
            ui.Write(new Panel(new Rows(
                    new Markup($"[bold cyan1]{Markup.Escape(device.UserCode)}[/]"),
                    new Markup(""),
                    new Markup("[grey]Enter this code in your browser to sign in.[/]")))
                .Header("[cyan1]Verification Code[/]")
                .Border(BoxBorder.Rounded)
                .BorderStyle(new Style(Color.Cyan1))
                .Padding(2, 1)
                .Expand());
            ui.Line();

            OpenBrowser(device.VerificationUrl);
            ui.Hint($"Opening browser... If it doesn't open, visit {device.VerificationUrl}");

            var tokens = await ui.SpinAsync("Waiting for authorization...",
                () => PollForTokensAsync(client, device.DeviceCode, (int)(device.ExpiresIn ?? 900), ct))
                ?? throw new CliException("Authorization timed out. Run 'depvault login' to try again.");

            if (server != configService.Load().Server)
            {
                configService.SetServer(server);
            }

            credentialStore.Save(new StoredCredentials
            {
                Server = server,
                AccessToken = tokens.AccessToken ?? "",
                RefreshToken = tokens.RefreshToken ?? "",
                UserId = tokens.User?.Id,
                Email = tokens.User?.Email
            });
            ui.Line();
            ui.Success($"Logged in to {server} as {tokens.User?.Email ?? "unknown"}.");

            if (!vaultUnlocker.IsRemembered && prompter.Confirm("Unlock your vault on this device now?", true))
            {
                await vaultUnlocker.UnlockAndRememberAsync(ct);
                ui.Success("Vault unlocked.");
            }

            return ExitCodes.Ok;
        });

        return cmd;
    }

    public Command CreateLogoutCommand()
    {
        var cmd = new Command("logout", "Sign out and forget the vault unlock on this device");
        cmd.SetAction(async (_, ct) =>
        {
            await TryRevokeSessionAsync(ct);
            credentialStore.Delete();
            vaultUnlocker.Forget();
            ui.Success("Logged out.");
            return ExitCodes.Ok;
        });
        return cmd;
    }

    public Command CreateWhoamiCommand()
    {
        var cmd = new Command("whoami", "Show the current user and auth method");
        cmd.SetAction(async (_, ct) =>
        {
            if (session.Mode == AuthMode.CiToken)
            {
                ui.Line("[cyan1]Auth[/]: CI token (DEPVAULT_TOKEN)");
                return ExitCodes.Ok;
            }

            session.RequireUser();
            var user = await clientFactory.Create().Api.Users.Me.GetAsync(cancellationToken: ct);
            ui.Line($"[cyan1]Email[/]: {Markup.Escape(user?.Email ?? "")}");
            ui.Line($"[cyan1]Name[/]: {Markup.Escape($"{user?.FirstName} {user?.LastName}".Trim())}");
            ui.Line($"[cyan1]Server[/]: {Markup.Escape(configService.Load().Server)}");
            return ExitCodes.Ok;
        });
        return cmd;
    }

    /// <summary>Best-effort server-side revocation of the refresh session before local cleanup.</summary>
    private async Task TryRevokeSessionAsync(CancellationToken ct)
    {
        if (session.User?.RefreshToken is not { Length: > 0 } refreshToken)
        {
            return;
        }

        try
        {
            // The endpoint reads the refresh token from the cookie, not the Authorization header.
            await clientFactory.Create().Api.Auth.Logout.PostAsync(
                config => config.Headers.Add("Cookie", $"refresh_token={refreshToken}"), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Local logout proceeds regardless; the session expires server-side on its own.
        }
    }

    private static async Task<TokenNs.TokenPostResponse?> PollForTokensAsync(
        ApiClient.ApiClient client, string deviceCode, int expiresIn, CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddSeconds(expiresIn);
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(PollInterval, ct);
            try
            {
                var result = await client.Api.Auth.Device.Token.PostAsync(
                    new TokenNs.TokenPostRequestBody { DeviceCode = deviceCode }, cancellationToken: ct);

                switch (result?.Status)
                {
                    case TokenNs.TokenPostResponse_status.Verified when result.AccessToken is not null:
                        return result;
                    case TokenNs.TokenPostResponse_status.Expired:
                        return null;
                }
            }
            catch (Exception ex) when (ex is HttpRequestException
                                       || ex is Microsoft.Kiota.Abstractions.ApiException { ResponseStatusCode: 429 or >= 500 })
            {
                // Transient (network, rate limit, server restart): keep waiting.
            }
        }

        return null;
    }

    private static void OpenBrowser(string url)
    {
        try
        {
            var opener = OperatingSystem.IsWindows() ? null : OperatingSystem.IsMacOS() ? "open" : "xdg-open";
            using var _ = opener is null
                ? Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })
                : Process.Start(opener, url);
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            // The URL is printed as a fallback.
        }
    }
}

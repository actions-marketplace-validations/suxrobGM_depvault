using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
using DepVault.Cli.Services.Sync;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>
/// <c>doctor</c>: checks each prerequisite in order (server, login, vault, unlock, project link, key) and prints
/// the next command for anything not ready. Exits non-zero when something is broken.
/// </summary>
public sealed class DoctorCommands(
    Session session,
    IConfigService configService,
    IApiClientFactory clientFactory,
    VaultUnlocker vaultUnlocker,
    IProjectLinkStore linkStore,
    Ui ui)
{
    public Command CreateDoctorCommand()
    {
        var cmd = new Command("doctor", "Diagnose CLI setup and print next steps for anything not ready");
        cmd.SetAction(async (_, ct) =>
        {
            ui.Line($"[bold]DepVault environment check[/] [grey]({Markup.Escape(configService.Load().Server)})[/]");
            ui.Line();

            var client = clientFactory.Create();
            var healthy = await CheckServerAsync(client, ct) && CheckAuth() && await CheckVaultAsync(client, ct);
            if (healthy && session.Mode == AuthMode.User && linkStore.Find() is { } link)
            {
                Pass($"Folder linked to project {link.DisplayName} ({link.Root})");
                await CheckKeyAsync(client, link.ProjectId, ct);
            }
            else if (healthy && session.Mode == AuthMode.User)
            {
                Info("This folder isn't linked to a project yet.", "depvault init");
            }

            ui.Line();
            return healthy ? ExitCodes.Ok : ExitCodes.Error;
        });

        return cmd;
    }

    private async Task<bool> CheckServerAsync(ApiClient.ApiClient client, CancellationToken ct)
    {
        try
        {
            await client.Health.GetAsync(cancellationToken: ct);
            Pass("Server is reachable");
            return true;
        }
        catch (Exception ex) when (ex is HttpRequestException or ApiException)
        {
            Fail($"Cannot reach the server: {ex.Message}", "depvault config set server <url>");
            return false;
        }
    }

    private bool CheckAuth()
    {
        switch (session.Mode)
        {
            case AuthMode.User:
                Pass("Logged in");
                return true;
            case AuthMode.CiToken:
                Pass("Authenticated with DEPVAULT_TOKEN (CI mode); vault and project checks don't apply");
                return true;
            default:
                Fail("Not logged in to this server", "depvault login");
                return false;
        }
    }

    private async Task<bool> CheckVaultAsync(ApiClient.ApiClient client, CancellationToken ct)
    {
        if (session.Mode != AuthMode.User)
        {
            return true;
        }

        var status = await client.Api.Vault.Status.GetAsync(cancellationToken: ct);
        if (string.IsNullOrEmpty(status?.KekSalt))
        {
            Fail("Encryption vault is not set up", status?.SetupUrl ?? "Set it up in the web dashboard");
            return false;
        }

        Pass("Encryption vault is set up");
        if (vaultUnlocker.IsRemembered)
        {
            Pass("Vault is unlocked on this device");
        }
        else
        {
            Info("Vault is locked; you'll be asked for your password once on this device.", "depvault unlock");
        }

        return true;
    }

    private async Task CheckKeyAsync(ApiClient.ApiClient client, string projectId, CancellationToken ct)
    {
        try
        {
            await client.Api.Projects[projectId].Keygrants.My.GetAsync(cancellationToken: ct);
            Pass("You hold this project's encryption key");
        }
        catch (ApiException ex) when (ApiErrors.HasStatus(ex, 404))
        {
            Info("You don't hold this project's key. A new project gets one on its first push; otherwise ask an "
                 + "Editor or Owner to click 'Grant access' in DepVault.");
        }
    }

    private void Pass(string message) => ui.Line($"  [green]✓[/] {Markup.Escape(message)}");

    private void Fail(string message, string next)
    {
        ui.Line($"  [red]✗[/] {Markup.Escape(message)}");
        ui.Line($"     [grey]→[/] [cyan1]{Markup.Escape(next)}[/]");
    }

    private void Info(string message, string? next = null)
    {
        ui.Line($"  [yellow]•[/] {Markup.Escape(message)}");
        if (next is not null)
        {
            ui.Line($"     [grey]→[/] [cyan1]{Markup.Escape(next)}[/]");
        }
    }
}

using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Config;
using DepVault.Cli.Crypto;
using Spectre.Console;

namespace DepVault.Cli.Commands;

/// <summary>
///     `depvault doctor` — a first-run diagnostic that checks each onboarding prerequisite in order
///     (server, auth, vault setup, unlock, project link, key grant) and prints the exact next command
///     for anything that isn't ready.
/// </summary>
public sealed class DoctorCommands(
    AuthContext ctx,
    IConfigService configService,
    IApiClientFactory clientFactory,
    VaultState vaultState,
    RememberedUnlockService rememberedUnlockService)
{
    public Command CreateDoctorCommand()
    {
        var cmd = new Command("doctor", "Diagnose CLI setup and print next steps for anything not ready");
        cmd.SetAction(async (_, ct) =>
        {
            AnsiConsole.WriteLine();
            AnsiConsole.MarkupLine("[bold]DepVault environment check[/]");
            AnsiConsole.WriteLine();

            var config = configService.Load();
            AnsiConsole.MarkupLine($"[grey]Server:[/] {Markup.Escape(config.Server)}");

            var client = clientFactory.Create();

            var serverOk = await CheckServerAsync(client, ct);
            if (!serverOk)
            {
                // Every later check needs the server; stop here with a clear pointer.
                Info("Set the server with [bold]depvault config set server <url>[/] if this is wrong.");
                return;
            }

            var authMode = ctx.GetAuthMode();
            var authOk = CheckAuth(authMode);
            if (!authOk)
            {
                return;
            }

            if (authMode == AuthMode.CiToken)
            {
                Info("Running in CI token mode — vault, project, and key checks are skipped.");
                return;
            }

            var vaultInitialized = await CheckVaultAsync(client, ct);
            if (vaultInitialized)
            {
                CheckUnlock();
            }

            var projectId = CheckProject(config);
            if (projectId is not null)
            {
                await CheckKeyGrantAsync(client, projectId, ct);
            }

            AnsiConsole.WriteLine();
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
        catch (Exception ex)
        {
            Fail($"Cannot reach the server: {ex.Message}");
            return false;
        }
    }

    private bool CheckAuth(AuthMode mode)
    {
        switch (mode)
        {
            case AuthMode.Jwt:
                Pass("Logged in (stored credentials)");
                return true;
            case AuthMode.CiToken:
                Pass("Authenticated via DEPVAULT_TOKEN (CI mode)");
                return true;
            default:
                Fail("Not logged in");
                Next("depvault login");
                return false;
        }
    }

    private async Task<bool> CheckVaultAsync(ApiClient.ApiClient client, CancellationToken ct)
    {
        try
        {
            var status = await client.Api.Vault.Status.GetAsync(cancellationToken: ct);
            if (status is not null && !string.IsNullOrEmpty(status.KekSalt))
            {
                Pass("Encryption vault is initialized");
                return true;
            }

            Fail("Encryption vault is not set up");
            Next(string.IsNullOrEmpty(status?.SetupUrl)
                ? "Set up your vault in the web dashboard"
                : $"Set it up in the web dashboard: {status.SetupUrl}");
            return false;
        }
        catch (Exception ex)
        {
            Fail($"Could not check vault status: {ex.Message}");
            return false;
        }
    }

    private void CheckUnlock()
    {
        if (vaultState.IsUnlocked)
        {
            Pass("Vault is unlocked for this session");
        }
        else if (rememberedUnlockService.HasSession())
        {
            Pass("Vault has a remembered unlock on this machine");
        }
        else
        {
            Info("Vault is locked — you'll be prompted for your password on first push/pull.");
            Next("depvault unlock --remember");
        }
    }

    private string? CheckProject(AppConfigData config)
    {
        if (!string.IsNullOrEmpty(config.ActiveProjectId))
        {
            Pass($"Active project: {config.ActiveProjectName ?? config.ActiveProjectId}");
            return config.ActiveProjectId;
        }

        Info("No active project pinned — push/pull auto-detect from the git remote or prompt.");
        Next("depvault project select <id>");
        return null;
    }

    private async Task CheckKeyGrantAsync(ApiClient.ApiClient client, string projectId, CancellationToken ct)
    {
        try
        {
            var grant = await client.Api.Projects[projectId].Keygrants.My.GetAsync(cancellationToken: ct);
            if (grant is not null && !string.IsNullOrEmpty(grant.WrappedDek))
            {
                Pass("Encryption key grant exists for this project");
                return;
            }
        }
        catch
        {
            // No grant (404) or a transient error — either way it's created on first push.
        }

        Info("No encryption key yet — it is created automatically on your first push.");
    }

    private static void Pass(string message) => AnsiConsole.MarkupLine($"  [green]✓[/] {Markup.Escape(message)}");

    private static void Fail(string message) => AnsiConsole.MarkupLine($"  [red]✗[/] {Markup.Escape(message)}");

    private static void Info(string message) => AnsiConsole.MarkupLine($"  [yellow]•[/] {Markup.Escape(message)}");

    private static void Next(string command) => AnsiConsole.MarkupLine($"     [grey]→ run:[/] [cyan1]{Markup.Escape(command)}[/]");
}

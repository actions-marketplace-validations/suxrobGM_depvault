using System.Security.Cryptography;
using DepVault.Cli.Auth;
using DepVault.Cli.Config;
using DepVault.Cli.Output;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;
using KeygrantBody = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.KeygrantsPostRequestBody;
using GrantType = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.KeygrantsPostRequestBody_grantType;

namespace DepVault.Cli.Crypto;

/// <summary>Resolves a project DEK for a logged-in user (CI pulls get theirs from <c>/ci/files</c>).</summary>
public sealed class DekService(
    IApiClientFactory clientFactory,
    ICredentialStore credentialStore,
    AuthContext commandContext,
    VaultState vaultState,
    VaultUnlockService vaultUnlockService,
    RememberedUnlockService rememberedUnlockService,
    IOutputFormatter output,
    ConsoleRenderer renderer)
{
    private sealed record DekResolutionResult(byte[]? Dek, bool DroppedStaleSession);

    /// <summary>Collects the vault password if needed, then resolves the DEK under a spinner; the entry point for every file command.</summary>
    public async Task<byte[]?> CollectPasswordAndResolveAsync(string projectId, CancellationToken ct)
    {
        var hadSession = !vaultState.IsUnlocked && rememberedUnlockService.HasSession();
        var (password, fromPrompt) = vaultUnlockService.CollectVaultPassword();

        var result = await ResolveWithMetadataAsync(projectId, password, ct);
        var dek = result.Dek;

        // A stale remembered session is dropped during resolution; since it suppressed the prompt, prompt now and retry once.
        if (dek is null && hadSession && password is null && result.DroppedStaleSession
            && commandContext.Prompter.IsInteractive
            && !vaultState.IsUnlocked && !rememberedUnlockService.HasSession())
        {
            password = commandContext.Prompter.AskSecret("Enter vault password");
            if (!string.IsNullOrEmpty(password))
            {
                fromPrompt = true;
                result = await ResolveWithMetadataAsync(projectId, password, ct);
                dek = result.Dek;
            }
        }

        if (dek is not null && fromPrompt)
        {
            rememberedUnlockService.OfferRemember();
        }

        return dek;
    }

    private async Task<DekResolutionResult> ResolveWithMetadataAsync(
        string projectId,
        string? vaultPassword,
        CancellationToken ct)
    {
        return await AnsiConsole.Status()
            .Spinner(Spinner.Known.Dots)
            .StartAsync("Resolving encryption key...", async _ =>
                await ResolveJwtDekAsync(projectId, vaultPassword, ct));
    }

    private async Task<DekResolutionResult> ResolveJwtDekAsync(
        string projectId,
        string? password,
        CancellationToken ct)
    {
        var cachedDek = vaultState.GetCachedDek(projectId);
        if (cachedDek is not null)
        {
            return new DekResolutionResult(cachedDek, DroppedStaleSession: false);
        }

        var token = credentialStore.Load()?.AccessToken;
        if (string.IsNullOrEmpty(token))
        {
            output.PrintError("Not authenticated. Run 'depvault login' first.");
            return new DekResolutionResult(null, DroppedStaleSession: false);
        }

        var unlock = await vaultUnlockService.ResolveKekAsync(password, ct);
        if (unlock.Kek is null)
        {
            return new DekResolutionResult(null, unlock.DroppedStaleSession);
        }

        var apiClient = clientFactory.Create();
        try
        {
            var keyGrant = await apiClient.Api.Projects[projectId].Keygrants.My
                .GetAsync(cancellationToken: ct);

            if (keyGrant is not null && !string.IsNullOrEmpty(keyGrant.WrappedDek))
            {
                var dek = VaultCrypto.UnwrapKey(
                    keyGrant.WrappedDek, keyGrant.WrappedDekIv ?? "", keyGrant.WrappedDekTag ?? "",
                    unlock.Kek);
                vaultState.CacheDek(projectId, dek);
                return new DekResolutionResult(dek, DroppedStaleSession: false);
            }

            return new DekResolutionResult(
                await CreateSelfGrantAsync(projectId, unlock.Kek, ct),
                DroppedStaleSession: false);
        }
        catch (ApiException ex) when (ex.ResponseStatusCode is 404)
        {
            return new DekResolutionResult(
                await CreateSelfGrantAsync(projectId, unlock.Kek, ct),
                DroppedStaleSession: false);
        }
    }

    /// <summary>Generate a new DEK, wrap with KEK, and POST a SELF grant to the server.</summary>
    private async Task<byte[]?> CreateSelfGrantAsync(string projectId, byte[] kek, CancellationToken ct)
    {
        var creds = credentialStore.Load();
        if (creds?.UserId is null)
        {
            renderer.PrintKeyGrantError("Not authenticated. Run 'depvault login' first.");
            return null;
        }

        try
        {
            var dek = RandomNumberGenerator.GetBytes(32);
            var (wrappedDek, iv, tag) = VaultCrypto.WrapKey(dek, kek);

            var client = clientFactory.Create();
            await client.Api.Projects[projectId].Keygrants.PostAsync(new KeygrantBody
            {
                UserId = Guid.Parse(creds.UserId),
                WrappedDek = wrappedDek,
                WrappedDekIv = iv,
                WrappedDekTag = tag,
                GrantType = GrantType.SELF
            }, cancellationToken: ct);

            vaultState.CacheDek(projectId, dek);
            output.PrintSuccess("Created encryption key for this project.");
            return dek;
        }
        catch (Exception ex)
        {
            renderer.PrintKeyGrantError(ex.Message);
            return null;
        }
    }
}

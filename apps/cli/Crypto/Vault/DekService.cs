using System.Security.Cryptography;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using Microsoft.Kiota.Abstractions;
using GrantBody = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.KeygrantsPostRequestBody;
using GrantType = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.KeygrantsPostRequestBody_grantType;
using MyGrant = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.My.MyGetResponse;
using MyGrantType = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.My.MyGetResponse_grantType;

namespace DepVault.Cli.Crypto;

/// <summary>Resolves a logged-in user's project key (DEK). CI pulls get theirs from <c>/ci/files</c>.</summary>
public sealed class DekService(IApiClientFactory clientFactory, VaultUnlocker unlocker, Session session)
{
    private const string NoAccess =
        "You can't decrypt this project's files yet. Ask an Editor or Owner to open the project in DepVault "
        + "and click 'Grant access'.";

    /// <summary>
    /// Unwraps this user's grant: their own (SELF) or one a teammate shared (ECDH). A project with no key yet
    /// gets one here; the server refuses that (409) once anyone else holds a key.
    /// </summary>
    public async Task<byte[]> GetAsync(string projectId, CancellationToken ct)
    {
        var kek = await unlocker.GetKekAsync(ct);
        MyGrant? grant;
        try
        {
            grant = await clientFactory.Create().Api.Projects[projectId].Keygrants.My.GetAsync(cancellationToken: ct);
        }
        catch (ApiException ex) when (ApiErrors.HasStatus(ex, 404))
        {
            return await CreateAsync(projectId, kek, ct);
        }

        try
        {
            return grant?.GrantType == MyGrantType.ECDH
                ? await UnwrapSharedAsync(grant, ct)
                : VaultCrypto.UnwrapKey(grant!.WrappedDek!, grant.WrappedDekIv!, grant.WrappedDekTag!, kek);
        }
        catch (CryptographicException)
        {
            throw new CliException($"Your key for this project doesn't open. {NoAccess}");
        }
    }

    /// <summary>Generates the project's first key, wrapped by the user's KEK and by their recovery key.</summary>
    private async Task<byte[]> CreateAsync(string projectId, byte[] kek, CancellationToken ct)
    {
        var userId = Guid.Parse(session.RequireUser().UserId!);
        var recoveryKey = await unlocker.GetRecoveryKeyAsync(ct);
        var dek = RandomNumberGenerator.GetBytes(32);
        var grants = clientFactory.Create().Api.Projects[projectId].Keygrants;

        try
        {
            await grants.PostAsync(Grant(userId, dek, kek, GrantType.SELF), cancellationToken: ct);
            await grants.PostAsync(Grant(userId, dek, recoveryKey, GrantType.RECOVERY), cancellationToken: ct);
            return dek;
        }
        catch (ApiException ex) when (ApiErrors.HasStatus(ex, 409))
        {
            CryptographicOperations.ZeroMemory(dek);
            throw new CliException(NoAccess);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(recoveryKey);
        }
    }

    private async Task<byte[]> UnwrapSharedAsync(MyGrant grant, CancellationToken ct)
    {
        var privateKey = await unlocker.GetPrivateKeyAsync(ct);
        var sharedKey = VaultCrypto.DeriveSharedKey(privateKey, grant.GranterPublicKey!);
        try
        {
            return VaultCrypto.UnwrapKey(grant.WrappedDek!, grant.WrappedDekIv!, grant.WrappedDekTag!, sharedKey);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(privateKey);
            CryptographicOperations.ZeroMemory(sharedKey);
        }
    }

    private static GrantBody Grant(Guid userId, byte[] dek, byte[] wrappingKey, GrantType type)
    {
        var (wrapped, iv, tag) = VaultCrypto.WrapKey(dek, wrappingKey);
        return new GrantBody { UserId = userId, WrappedDek = wrapped, WrappedDekIv = iv, WrappedDekTag = tag, GrantType = type };
    }
}

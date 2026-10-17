using System.Security.Cryptography;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using Microsoft.Kiota.Abstractions;
using MyGrant = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.My.MyGetResponse;
using MyGrantType = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.My.MyGetResponse_grantType;
using OwnGrants = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.My.MyPutRequestBody;
using RecoveryGrant = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.My.MyPutRequestBody_recovery;
using SelfGrant = DepVault.Cli.ApiClient.Api.Projects.Item.Keygrants.My.MyPutRequestBody_self;

namespace DepVault.Cli.Crypto;

/// <summary>Resolves a logged-in user's project key (DEK). CI pulls get theirs from <c>/ci/files</c>.</summary>
public sealed class DekService(IApiClientFactory clientFactory, VaultUnlocker unlocker)
{
    private const string NoAccess =
        "You can't decrypt this project's files yet. Ask an Editor or Owner to open the project in DepVault "
        + "and click 'Grant access'.";

    /// <summary>
    /// Unwraps this user's grant: their own (SELF) or one a teammate shared (ECDH), which is then stored as
    /// their own. A project with no key yet gets one here; the server refuses that (409) once anyone else
    /// holds a key.
    /// </summary>
    public async Task<byte[]> GetAsync(string projectId, CancellationToken ct)
    {
        // Fetched while the KEK is derived (or the password typed); the request doesn't need it.
        var grantTask = clientFactory.Create().Api.Projects[projectId].Keygrants.My.GetAsync(cancellationToken: ct);
        var kek = await unlocker.GetKekAsync(ct);
        MyGrant? grant;
        try
        {
            grant = await grantTask;
        }
        catch (ApiException ex) when (ApiErrors.HasStatus(ex, 404))
        {
            return await CreateAsync(projectId, kek, ct);
        }

        if (grant?.GrantType != MyGrantType.ECDH)
        {
            return Unwrap(() => VaultCrypto.UnwrapKey(grant!.WrappedDek!, grant.WrappedDekIv!, grant.WrappedDekTag!, kek));
        }

        var privateKey = await unlocker.GetPrivateKeyAsync(ct);
        var dek = Unwrap(() => UnwrapShared(grant, privateKey));
        try
        {
            await StoreOwnAsync(projectId, dek, kek, ct);
        }
        catch (ApiException)
        {
            // Best-effort: the shared grant keeps working until adopted, and adoption retries next time.
        }

        return dek;
    }

    /// <summary>Generates the project's first key, stored under the user's KEK and recovery key together.</summary>
    private async Task<byte[]> CreateAsync(string projectId, byte[] kek, CancellationToken ct)
    {
        var dek = RandomNumberGenerator.GetBytes(32);
        try
        {
            await StoreOwnAsync(projectId, dek, kek, ct);
            return dek;
        }
        catch (ApiException ex) when (ApiErrors.HasStatus(ex, 409))
        {
            CryptographicOperations.ZeroMemory(dek);
            throw new CliException(NoAccess);
        }
    }

    /// <summary>Stores the user's SELF and RECOVERY grants for <paramref name="dek"/> in one request.</summary>
    private async Task StoreOwnAsync(string projectId, byte[] dek, byte[] kek, CancellationToken ct)
    {
        var recoveryKey = await unlocker.GetRecoveryKeyAsync(ct);
        try
        {
            var (selfDek, selfIv, selfTag) = VaultCrypto.WrapKey(dek, kek);
            var (recDek, recIv, recTag) = VaultCrypto.WrapKey(dek, recoveryKey);
            var body = new OwnGrants
            {
                Self = new SelfGrant { WrappedDek = selfDek, WrappedDekIv = selfIv, WrappedDekTag = selfTag },
                Recovery = new RecoveryGrant { WrappedDek = recDek, WrappedDekIv = recIv, WrappedDekTag = recTag },
            };
            await clientFactory.Create().Api.Projects[projectId].Keygrants.My.PutAsync(body, cancellationToken: ct);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(recoveryKey);
        }
    }

    private static byte[] UnwrapShared(MyGrant grant, byte[] privateKey)
    {
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

    private static byte[] Unwrap(Func<byte[]> unwrap)
    {
        try
        {
            return unwrap();
        }
        catch (CryptographicException)
        {
            throw new CliException($"Your key for this project doesn't open. {NoAccess}");
        }
    }
}

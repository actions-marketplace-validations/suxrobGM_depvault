using System.Security.Cryptography;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Services.Sync;

public sealed record CiPullResult(string Root, List<string> Written, List<string> Errors);

/// <summary>
/// <c>depvault pull</c> with <c>DEPVAULT_TOKEN</c>: one request returns the token-wrapped DEK and every file the
/// token may read; each is decrypted locally and written under the linked root (or the current folder).
/// </summary>
public sealed class CiPuller(IApiClientFactory clientFactory, IProjectLinkStore linkStore, CliEnvironment env)
{
    public async Task<CiPullResult> PullAsync(IReadOnlyList<string> pathGlobs, CancellationToken ct)
    {
        var (_, keyMaterial) = CiTokenFormat.Split(env.CiToken!);
        var response = await clientFactory.Create().Api.Ci.Files.GetAsync(cancellationToken: ct)
                       ?? throw new CliException("DepVault returned an empty response.");

        byte[] dek;
        try
        {
            dek = VaultCrypto.UnwrapKey(response.WrappedDek!, response.WrappedDekIv!, response.WrappedDekTag!,
                VaultCrypto.DeriveCiWrapKey(keyMaterial));
        }
        catch (CryptographicException)
        {
            throw new CliException("DEPVAULT_TOKEN can't decrypt this project's key; generate a new token.");
        }

        var files = (response.Files ?? [])
            .Where(f => pathGlobs.Count == 0 || PathGlob.MatchesAny(pathGlobs, f.Path!))
            .ToList();
        if (files.Count == 0)
        {
            throw new CliException(pathGlobs.Count == 0
                ? "This token can't read any files. Check its path scope in project settings."
                : "No files matched; check the paths and the token's scope.");
        }

        var root = linkStore.Find()?.Root ?? Directory.GetCurrentDirectory();
        var result = new CiPullResult(root, [], []);
        foreach (var file in files)
        {
            try
            {
                SyncService.WriteLocal(root, file.Path!, new EncryptedBlob(file.EncryptedContent!, file.Iv!, file.AuthTag!), dek);
                result.Written.Add(file.Path!);
            }
            catch (Exception ex) when (SyncService.IsWriteFailure(ex))
            {
                result.Errors.Add($"{file.Path}: {ex.Message}");
            }
        }

        return result;
    }
}

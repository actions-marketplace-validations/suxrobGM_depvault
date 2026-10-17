using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;

namespace DepVault.Cli.Services.Sync;

/// <summary>
/// <c>depvault pull</c> with <c>DEPVAULT_TOKEN</c>: one request returns the token-wrapped DEK and every file
/// the token may read; each is decrypted locally and written under the linked root (or the current folder).
/// </summary>
public sealed class CiPuller(
    IApiClientFactory clientFactory,
    IProjectLinkStore linkStore,
    IOutputFormatter output)
{
    /// <summary>Writes the files and returns the process exit code.</summary>
    public async Task<int> PullAsync(IReadOnlyList<string> pathGlobs, CancellationToken ct)
    {
        var (_, keyMaterial) = CiTokenFormat.Split(AuthContext.CiToken!);
        var response = await clientFactory.Create().Api.Ci.Files.GetAsync(cancellationToken: ct);
        if (response is null)
        {
            output.PrintError("DepVault returned an empty response.");
            return 1;
        }

        var dek = VaultCrypto.UnwrapKey(
            response.WrappedDek!, response.WrappedDekIv!, response.WrappedDekTag!,
            VaultCrypto.DeriveCiWrapKey(keyMaterial));

        var root = linkStore.Find()?.Root ?? Directory.GetCurrentDirectory();
        var files = (response.Files ?? [])
            .Where(f => pathGlobs.Count == 0 || PathGlob.MatchesAny(pathGlobs, f.Path!))
            .ToList();

        var failed = 0;
        foreach (var file in files)
        {
            try
            {
                var bytes = VaultCrypto.DecryptBytes(file.EncryptedContent!, file.Iv!, file.AuthTag!, dek);
                SecureFileWriter.WriteFileOwnerOnly(RepoPath.ToFull(root, file.Path!), bytes);
                output.PrintSuccess($"  {file.Path}");
            }
            catch (Exception ex) when (SyncService.IsPullFailure(ex))
            {
                output.PrintError($"  {file.Path}: {ex.Message}");
                failed++;
            }
        }

        if (files.Count == 0)
        {
            output.PrintError(pathGlobs.Count == 0
                ? "This token can't read any files. Check its path scope in project settings."
                : "No files matched; check the paths and the token's scope.");
            return 1;
        }

        output.PrintSuccess($"Pulled {files.Count - failed} file(s) into {root}.");
        return failed > 0 ? 1 : 0;
    }
}

using DepVault.Cli.Auth;
using DepVault.Cli.Crypto;
using Spectre.Console;
using PushBody = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Push.PushPostRequestBody;
using RepoFileKind = DepVault.Cli.ApiClient.Api.Projects.Item.Files.Push.PushPostRequestBody_kind;

namespace DepVault.Cli.Services;

/// <summary>
/// Encrypts whole files client-side with the project DEK and uploads the blob; the server only sees
/// ciphertext, iv, and auth tag. <see cref="FileCategory"/> maps to the RepoFile kind.
/// </summary>
public sealed class RepoFileUploadService(IApiClientFactory clientFactory)
{
    /// <summary>
    /// Encrypts and uploads one file; the content tag (<see cref="VaultCrypto.ComputeContentTag"/>) lets the
    /// server skip a new version when content is unchanged.
    /// </summary>
    /// <remarks>The DEK is never retained here; <see cref="VaultState"/> owns it and zeroes it on lock.</remarks>
    public async Task UploadAsync(
        string projectId, string repoRoot, DiscoveredFile file, byte[] dek, CancellationToken ct)
    {
        var bytes = await File.ReadAllBytesAsync(file.FullPath, ct);
        var isBinary = BinaryDetector.IsBinary(bytes);
        var (appPath, appName) = AppRootResolver.Resolve(repoRoot, file.RelativePath);
        var (encryptedContent, iv, authTag) = VaultCrypto.EncryptBytes(bytes, dek);

        var isConfig = file.Category == FileCategory.Environment;

        var body = new PushBody
        {
            AppPath = appPath,
            AppName = appName,
            Kind = isConfig ? RepoFileKind.CONFIG : RepoFileKind.SECRET,
            RelativePath = file.RelativePath,
            EnvironmentSlug = EnvSlugResolver.Resolve(file.FileName),
            Format = isConfig ? ResolveFormat(file.FileName) : null,
            MimeType = isConfig ? null : ResolveMimeType(file.FileName),
            EncryptedContent = encryptedContent,
            Iv = iv,
            AuthTag = authTag,
            FileSize = bytes.Length,
            IsBinary = isBinary,
            ContentHash = VaultCrypto.ComputeContentTag(bytes, dek),
        };

        var verb = isConfig ? "Pushing" : "Uploading";
        var client = clientFactory.Create();
        await AnsiConsole.Status()
            .Spinner(Spinner.Known.Dots)
            .StartAsync($"{verb} {file.RelativePath}...", async _ =>
                await client.Api.Projects[projectId].Files.Push.PostAsync(body, cancellationToken: ct));
    }

    /// <summary>Maps a config file name to the backend format id, defaulting to the dominant "env".</summary>
    private static string ResolveFormat(string fileName)
    {
        if (fileName.StartsWith(".env", StringComparison.OrdinalIgnoreCase))
        {
            return "env";
        }

        if (fileName.StartsWith("appsettings", StringComparison.OrdinalIgnoreCase) &&
            fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            return "appsettings.json";
        }

        if (fileName.StartsWith("secrets.", StringComparison.OrdinalIgnoreCase) &&
            (fileName.EndsWith(".yaml", StringComparison.OrdinalIgnoreCase) ||
             fileName.EndsWith(".yml", StringComparison.OrdinalIgnoreCase)))
        {
            return "secrets.yaml";
        }

        if (fileName.Equals("config.toml", StringComparison.OrdinalIgnoreCase))
        {
            return "config.toml";
        }

        return "env";
    }

    private static string ResolveMimeType(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".json" => "application/json",
            ".plist" => "application/xml",
            ".yaml" or ".yml" => "application/x-yaml",
            ".pem" or ".key" => "application/x-pem-file",
            ".p12" or ".pfx" => "application/x-pkcs12",
            ".jks" or ".keystore" => "application/x-java-keystore",
            _ => "application/octet-stream"
        };
    }
}

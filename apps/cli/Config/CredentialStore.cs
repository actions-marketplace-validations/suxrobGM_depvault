using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using DepVault.Cli.Crypto;

namespace DepVault.Cli.Config;

public sealed class StoredCredentials
{
    [JsonPropertyName("accessToken")]
    public string AccessToken { get; set; } = "";

    [JsonPropertyName("refreshToken")]
    public string RefreshToken { get; set; } = "";

    [JsonPropertyName("userId")]
    public string? UserId { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }
}

/// <summary>On-disk envelope: the serialized credentials encrypted via <see cref="IKekProtector"/>.</summary>
public sealed class StoredCredentialsEnvelope
{
    [JsonPropertyName("version")]
    public int Version { get; set; }

    [JsonPropertyName("data")]
    public string Data { get; set; } = "";
}

public interface ICredentialStore
{
    StoredCredentials? Load();

    /// <summary>Re-reads from disk, bypassing the cache — another process may have rotated the tokens.</summary>
    StoredCredentials? Reload();

    void Save(StoredCredentials credentials);
    void Delete();
}

public sealed class CredentialStore(IKekProtector protector) : ICredentialStore
{
    private const int EnvelopeVersion = 2;
    private static readonly string credPath = Path.Combine(Constants.ConfigDir, "credentials.json");

    private StoredCredentials? cached;
    private bool loaded;

    public StoredCredentials? Load()
    {
        if (loaded)
        {
            return cached;
        }

        loaded = true;

        if (!File.Exists(credPath))
        {
            return cached = null;
        }

        var json = File.ReadAllText(credPath);
        var creds = ReadEnvelope(json) ?? MigrateLegacyPlaintext(json);
        cached = string.IsNullOrEmpty(creds?.AccessToken) ? null : creds;
        return cached;
    }

    public StoredCredentials? Reload()
    {
        loaded = false;
        return Load();
    }

    public void Save(StoredCredentials credentials)
    {
        var json = JsonSerializer.Serialize(credentials, CredentialJsonContext.Default.StoredCredentials);
        var envelope = new StoredCredentialsEnvelope
        {
            Version = EnvelopeVersion,
            Data = protector.Protect(Encoding.UTF8.GetBytes(json))
        };

        SecureFileWriter.WriteOwnerOnly(
            credPath,
            JsonSerializer.Serialize(envelope, CredentialJsonContext.Default.StoredCredentialsEnvelope));

        cached = credentials;
        loaded = true;
    }

    public void Delete()
    {
        try
        {
            File.Delete(credPath);
        }
        catch (FileNotFoundException)
        {
        }
        catch (DirectoryNotFoundException)
        {
        }

        protector.Reset();
        cached = null;
        loaded = true;
    }

    private StoredCredentials? ReadEnvelope(string json)
    {
        try
        {
            var envelope = JsonSerializer.Deserialize(json, CredentialJsonContext.Default.StoredCredentialsEnvelope);
            if (string.IsNullOrEmpty(envelope?.Data))
            {
                return null;
            }

            var bytes = protector.Unprotect(envelope.Data);
            return bytes is null
                ? null
                : JsonSerializer.Deserialize(
                    Encoding.UTF8.GetString(bytes), CredentialJsonContext.Default.StoredCredentials);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Pre-v2 files stored the tokens as plaintext JSON — re-save them protected.</summary>
    private StoredCredentials? MigrateLegacyPlaintext(string json)
    {
        try
        {
            var creds = JsonSerializer.Deserialize(json, CredentialJsonContext.Default.StoredCredentials);
            if (string.IsNullOrEmpty(creds?.AccessToken))
            {
                return null;
            }

            Save(creds);
            return creds;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

[JsonSerializable(typeof(StoredCredentials))]
[JsonSerializable(typeof(StoredCredentialsEnvelope))]
[JsonSourceGenerationOptions(WriteIndented = true)]
internal partial class CredentialJsonContext : JsonSerializerContext;

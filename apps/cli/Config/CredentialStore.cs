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
    void Save(StoredCredentials credentials);
    void Delete();
}

public sealed class CredentialStore(IKekProtector protector) : ICredentialStore
{
    private const int EnvelopeVersion = 2;
    private static readonly string credPath = Path.Combine(Constants.ConfigDir, "credentials.json");

    private StoredCredentials? cached;
    private DateTime? cachedWriteTimeUtc;
    private bool loaded;

    /// <summary>
    ///     Returns the stored credentials, re-reading whenever the file changed underneath us —
    ///     a concurrent depvault process (or a refresh on another thread) may have rotated the tokens.
    /// </summary>
    public StoredCredentials? Load()
    {
        var writeTimeUtc = File.Exists(credPath) ? File.GetLastWriteTimeUtc(credPath) : (DateTime?)null;
        if (loaded && writeTimeUtc == cachedWriteTimeUtc)
        {
            return cached;
        }

        loaded = true;
        cachedWriteTimeUtc = writeTimeUtc;

        if (writeTimeUtc is null)
        {
            return cached = null;
        }

        var creds = ReadEnvelope(File.ReadAllText(credPath));
        cached = string.IsNullOrEmpty(creds?.AccessToken) ? null : creds;
        return cached;
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
        cachedWriteTimeUtc = File.GetLastWriteTimeUtc(credPath);
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
        cachedWriteTimeUtc = null;
        loaded = true;
    }

    /// <summary>
    ///     Reads the protected envelope. A file that is absent, unreadable, or written by an older
    ///     envelope version is treated as no credentials at all — the user signs in again.
    /// </summary>
    private StoredCredentials? ReadEnvelope(string json)
    {
        try
        {
            var envelope = JsonSerializer.Deserialize(json, CredentialJsonContext.Default.StoredCredentialsEnvelope);
            if (envelope is null || envelope.Version != EnvelopeVersion || string.IsNullOrEmpty(envelope.Data))
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
}

[JsonSerializable(typeof(StoredCredentials))]
[JsonSerializable(typeof(StoredCredentialsEnvelope))]
[JsonSourceGenerationOptions(WriteIndented = true)]
internal partial class CredentialJsonContext : JsonSerializerContext;

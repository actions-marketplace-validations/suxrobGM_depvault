namespace DepVault.Cli.Common;

/// <summary>
///     Splits a CI token <c>dvci_&lt;authPart&gt;.&lt;keyPart&gt;</c>. Only the bearer part reaches the server;
///     the key part stays local as the sole input to the DEK wrap key, so the server can never unwrap the DEK.
/// </summary>
public static class CiTokenFormat
{
    /// <summary>Returns the bearer and key parts; throws <see cref="CiTokenFormatException" /> if either is missing.</summary>
    public static (string BearerPart, string KeyMaterial) Split(string rawToken)
    {
        var dot = rawToken.IndexOf('.');
        if (dot <= 0 || dot == rawToken.Length - 1)
        {
            throw new CiTokenFormatException();
        }

        return (rawToken[..dot], rawToken[(dot + 1)..]);
    }
}

/// <summary>DEPVAULT_TOKEN is not a split token: malformed, or created before the zero-knowledge upgrade.</summary>
public sealed class CiTokenFormatException() : Exception(
    "DEPVAULT_TOKEN is not a valid CI token (expected dvci_<auth>.<key>). "
    + "Tokens created before the zero-knowledge upgrade no longer work; generate a new one in project settings.");

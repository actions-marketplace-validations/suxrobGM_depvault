namespace DepVault.Cli.Common;

/// <summary>
///     Splits a CI token of the form <c>dvci_&lt;authPart&gt;.&lt;keyPart&gt;</c>. Only the bearer part
///     is sent to the server; the key part stays local as the sole input to the DEK wrapping key,
///     so the server can never unwrap the project DEK.
/// </summary>
public static class CiTokenFormat
{
    /// <summary>
    ///     Splits a raw token into the bearer credential and the local key material. Tokens without
    ///     a dot predate the split format; both roles fall back to the whole token.
    /// </summary>
    public static (string BearerPart, string KeyMaterial) Split(string rawToken)
    {
        var dot = rawToken.IndexOf('.');
        return dot < 0
            ? (rawToken, rawToken)
            : (rawToken[..dot], rawToken[(dot + 1)..]);
    }
}

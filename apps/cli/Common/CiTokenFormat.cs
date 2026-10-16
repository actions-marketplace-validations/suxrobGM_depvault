namespace DepVault.Cli.Common;

/// <summary>
///     Splits a CI token <c>dvci_&lt;authPart&gt;.&lt;keyPart&gt;</c>. Only the bearer part reaches the server;
///     the key part stays local as the sole input to the DEK wrap key, so the server can never unwrap the DEK.
/// </summary>
public static class CiTokenFormat
{
    /// <summary>Returns the bearer and key parts; a dot-less (pre-split) token is used whole for both.</summary>
    public static (string BearerPart, string KeyMaterial) Split(string rawToken)
    {
        var dot = rawToken.IndexOf('.');
        return dot < 0
            ? (rawToken, rawToken)
            : (rawToken[..dot], rawToken[(dot + 1)..]);
    }
}

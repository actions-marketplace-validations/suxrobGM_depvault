namespace DepVault.Cli.Common;

/// <summary>Normalizes git remote URLs to a canonical form so SSH and HTTPS remotes compare equal.</summary>
public static class GitUrl
{
    /// <summary>Returns lowercase <c>host/owner/repo</c> without <c>.git</c>, userinfo, or trailing slash; null if unparseable.</summary>
    public static string? Normalize(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        url = url.Trim();

        // The "://" check keeps scp-like URLs (git@host:owner/repo) away from the lenient Uri parser,
        // which would misread the colon as a scheme/port separator. Uri.Host already excludes userinfo.
        if (url.Contains("://"))
        {
            return Uri.TryCreate(url, UriKind.Absolute, out var uri) && !string.IsNullOrEmpty(uri.Host)
                ? Canonical(uri.Host, uri.AbsolutePath)
                : null;
        }

        // scp-like: git@github.com:owner/repo.git
        var scp = RegexPatterns.GitScpLikeUrl().Match(url);
        return scp.Success ? Canonical(scp.Groups[1].Value, scp.Groups[2].Value) : null;
    }

    private static string? Canonical(string host, string path)
    {
        // Inputs come from Uri or the anchored regex, so there's no whitespace — only a leading slash to trim.
        host = host.ToLowerInvariant();
        path = path.Trim('/');

        if (path.EndsWith(".git", StringComparison.OrdinalIgnoreCase))
        {
            path = path[..^4];
        }

        path = path.ToLowerInvariant();
        return string.IsNullOrEmpty(host) || string.IsNullOrEmpty(path) ? null : $"{host}/{path}";
    }
}

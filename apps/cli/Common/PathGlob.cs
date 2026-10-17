using System.Collections.Concurrent;
using System.Text;
using System.Text.RegularExpressions;

namespace DepVault.Cli.Common;

/// <summary>
/// Minimal glob matcher over repo-relative forward-slash paths: <c>**</c> spans folders, <c>*</c> and
/// <c>?</c> stay within one segment. A pattern without a slash matches the file name at any depth
/// (<c>*.pem</c> = <c>**/*.pem</c>) unless anchored with a leading <c>/</c>, like .gitignore. Dotfiles
/// are matched like any other name.
/// </summary>
internal static class PathGlob
{
    // Filters run every pattern against every file, so build each pattern's regex once.
    private static readonly ConcurrentDictionary<string, Regex> Cache = new(StringComparer.Ordinal);

    public static bool IsMatch(string pattern, string path)
    {
        return Cache.GetOrAdd(pattern, ToRegex).IsMatch(path);
    }

    /// <summary>True when the path matches any of the patterns.</summary>
    public static bool MatchesAny(IEnumerable<string> patterns, string path)
    {
        return patterns.Any(p => IsMatch(p, path));
    }

    private static Regex ToRegex(string pattern)
    {
        var glob = pattern.Replace('\\', '/').Trim();
        var anchored = glob.StartsWith('/');
        glob = glob.TrimStart('/');
        if (glob.EndsWith('/'))
        {
            glob += "**";
        }

        if (!anchored && !glob.Contains('/'))
        {
            glob = "**/" + glob;
        }

        var sb = new StringBuilder("^");
        for (var i = 0; i < glob.Length; i++)
        {
            var c = glob[i];
            if (c == '*' && i + 1 < glob.Length && glob[i + 1] == '*')
            {
                // "**/" matches zero or more whole folders; a trailing "**" matches everything below.
                var followedBySlash = i + 2 < glob.Length && glob[i + 2] == '/';
                sb.Append(followedBySlash ? "(?:.*/)?" : ".*");
                i += followedBySlash ? 2 : 1;
            }
            else if (c == '*')
            {
                sb.Append("[^/]*");
            }
            else if (c == '?')
            {
                sb.Append("[^/]");
            }
            else
            {
                sb.Append(Regex.Escape(c.ToString()));
            }
        }

        sb.Append('$');
        var options = OperatingSystem.IsWindows() ? RegexOptions.IgnoreCase : RegexOptions.None;
        return new Regex(sb.ToString(), options | RegexOptions.CultureInvariant);
    }
}

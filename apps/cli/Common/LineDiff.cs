namespace DepVault.Cli.Common;

/// <summary>Line-based unified diff by longest common subsequence, sized for the small text files DepVault stores.</summary>
public static class LineDiff
{
    /// <summary>Above this many changed line pairs the quadratic table gets too big to be worth it.</summary>
    private const long MaxCells = 4_000_000;

    private const int Context = 3;

    private enum DiffOp
    {
        Same,
        Removed,
        Added
    }

    /// <summary>
    /// Unified-diff lines (<c>@@</c> headers, then <c>-</c>/<c>+</c>/space prefixes); empty when equal, null when
    /// the changed region is too large to diff line by line.
    /// </summary>
    public static List<string>? Unified(IReadOnlyList<string> oldLines, IReadOnlyList<string> newLines)
    {
        var ops = Compute(oldLines, newLines);
        if (ops is null)
        {
            return null;
        }

        var changed = Enumerable.Range(0, ops.Count).Where(i => ops[i].Op != DiffOp.Same).ToList();
        var output = new List<string>();

        for (var k = 0; k < changed.Count; k++)
        {
            var start = Math.Max(0, changed[k] - Context);
            var last = changed[k];
            while (k + 1 < changed.Count && changed[k + 1] - last <= 2 * Context)
            {
                last = changed[++k];
            }

            var hunk = ops.Skip(start).Take(Math.Min(ops.Count - 1, last + Context) - start + 1).ToList();
            var before = ops.Take(start).ToList();
            output.Add($"@@ -{before.Count(o => o.Op != DiffOp.Added) + 1},{hunk.Count(o => o.Op != DiffOp.Added)} "
                       + $"+{before.Count(o => o.Op != DiffOp.Removed) + 1},{hunk.Count(o => o.Op != DiffOp.Removed)} @@");
            output.AddRange(hunk.Select(o => (o.Op switch { DiffOp.Removed => "-", DiffOp.Added => "+", _ => " " }) + o.Line));
        }

        return output;
    }

    /// <summary>Splits text into lines, treating CRLF like LF and ignoring the final newline.</summary>
    public static string[] SplitLines(string text) =>
        text.Length == 0 ? [] : (text.EndsWith('\n') ? text[..^1] : text).Split('\n').Select(l => l.TrimEnd('\r')).ToArray();

    /// <summary>The LCS table covers only the region between the common prefix and suffix.</summary>
    private static List<(DiffOp Op, string Line)>? Compute(IReadOnlyList<string> oldLines, IReadOnlyList<string> newLines)
    {
        var prefix = 0;
        while (prefix < oldLines.Count && prefix < newLines.Count && oldLines[prefix] == newLines[prefix])
        {
            prefix++;
        }

        var suffix = 0;
        while (suffix < oldLines.Count - prefix && suffix < newLines.Count - prefix
               && oldLines[oldLines.Count - 1 - suffix] == newLines[newLines.Count - 1 - suffix])
        {
            suffix++;
        }

        var n = oldLines.Count - prefix - suffix;
        var m = newLines.Count - prefix - suffix;
        if ((long)n * m > MaxCells)
        {
            return null;
        }

        var lcs = new int[n + 1, m + 1];
        for (var i = n - 1; i >= 0; i--)
        {
            for (var j = m - 1; j >= 0; j--)
            {
                lcs[i, j] = oldLines[prefix + i] == newLines[prefix + j]
                    ? lcs[i + 1, j + 1] + 1
                    : Math.Max(lcs[i + 1, j], lcs[i, j + 1]);
            }
        }

        var ops = oldLines.Take(prefix).Select(l => (DiffOp.Same, l)).ToList();
        int x = 0, y = 0;
        while (x < n && y < m)
        {
            if (oldLines[prefix + x] == newLines[prefix + y])
            {
                ops.Add((DiffOp.Same, oldLines[prefix + x++]));
                y++;
            }
            else if (lcs[x + 1, y] >= lcs[x, y + 1])
            {
                ops.Add((DiffOp.Removed, oldLines[prefix + x++]));
            }
            else
            {
                ops.Add((DiffOp.Added, newLines[prefix + y++]));
            }
        }

        ops.AddRange(oldLines.Skip(prefix + x).Take(n - x).Select(l => (DiffOp.Removed, l)));
        ops.AddRange(newLines.Skip(prefix + y).Take(m - y).Select(l => (DiffOp.Added, l)));
        ops.AddRange(oldLines.Skip(oldLines.Count - suffix).Select(l => (DiffOp.Same, l)));
        return ops;
    }
}

namespace DepVault.Cli.Common;

public enum DiffOp
{
    Same,
    Removed,
    Added
}

/// <summary>Line-based unified diff by longest common subsequence, sized for the small text files DepVault stores.</summary>
public static class LineDiff
{
    /// <summary>Above this many line pairs the quadratic table gets too big to be worth it.</summary>
    public const long MaxCells = 4_000_000;

    public static List<(DiffOp Op, string Line)> Compute(IReadOnlyList<string> oldLines, IReadOnlyList<string> newLines)
    {
        var lcs = new int[oldLines.Count + 1, newLines.Count + 1];
        for (var i = oldLines.Count - 1; i >= 0; i--)
        {
            for (var j = newLines.Count - 1; j >= 0; j--)
            {
                lcs[i, j] = oldLines[i] == newLines[j] ? lcs[i + 1, j + 1] + 1 : Math.Max(lcs[i + 1, j], lcs[i, j + 1]);
            }
        }

        var ops = new List<(DiffOp, string)>();
        int x = 0, y = 0;
        while (x < oldLines.Count && y < newLines.Count)
        {
            if (oldLines[x] == newLines[y])
            {
                ops.Add((DiffOp.Same, oldLines[x++]));
                y++;
            }
            else if (lcs[x + 1, y] >= lcs[x, y + 1])
            {
                ops.Add((DiffOp.Removed, oldLines[x++]));
            }
            else
            {
                ops.Add((DiffOp.Added, newLines[y++]));
            }
        }

        ops.AddRange(oldLines.Skip(x).Select(l => (DiffOp.Removed, l)));
        ops.AddRange(newLines.Skip(y).Select(l => (DiffOp.Added, l)));
        return ops;
    }

    /// <summary>Unified-diff lines (<c>@@</c> headers, then <c>-</c>/<c>+</c>/space prefixes); empty when equal.</summary>
    public static List<string> Unified(IReadOnlyList<string> oldLines, IReadOnlyList<string> newLines, int context = 3)
    {
        var ops = Compute(oldLines, newLines);
        var changed = Enumerable.Range(0, ops.Count).Where(i => ops[i].Op != DiffOp.Same).ToList();
        var output = new List<string>();

        for (var k = 0; k < changed.Count; k++)
        {
            var start = Math.Max(0, changed[k] - context);
            var last = changed[k];
            while (k + 1 < changed.Count && changed[k + 1] - last <= 2 * context)
            {
                last = changed[++k];
            }

            var hunk = ops.Skip(start).Take(Math.Min(ops.Count - 1, last + context) - start + 1).ToList();
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
}

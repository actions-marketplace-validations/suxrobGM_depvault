using DepVault.Cli.Services.Sync;
using Spectre.Console;

namespace DepVault.Cli.Output;

/// <summary>Renders sync entries like <c>git status</c>, or as JSON.</summary>
public sealed class SyncView(Ui ui)
{
    public void PrintEntries(IEnumerable<SyncEntry> entries)
    {
        foreach (var entry in entries.Where(e => e.Kind != SyncKind.InSync))
        {
            ui.Line($"  {Label(entry.Kind, 10)} {DisplayPath(entry)}{Note(entry)}");
        }
    }

    /// <summary>One-line totals: what push and pull would do, and what is blocked.</summary>
    public void PrintSummary(IReadOnlyList<SyncEntry> entries)
    {
        var parts = new List<string>();
        AddCount(parts, entries.Count(e => e.IsLocalChange), "to push", "cyan1");
        AddCount(parts, entries.Count(e => e.IsRemoteChange), "to pull", "cyan1");
        AddCount(parts, entries.Count(e => e.Kind == SyncKind.Conflict), "conflict(s)", "red");
        parts.Add($"[grey]{entries.Count(e => e.Kind == SyncKind.InSync)} in sync[/]");

        ui.Line();
        ui.Line($"  {string.Join(" [grey]·[/] ", parts)}");
    }

    /// <summary>Colored status label (e.g. <c>new</c>) padded to <paramref name="width"/> columns.</summary>
    public static string Label(SyncKind kind, int width)
    {
        var (label, color) = kind switch
        {
            SyncKind.Modified => ("modified", "yellow"),
            SyncKind.Untracked => ("new", "green"),
            SyncKind.Deleted => ("deleted", "red"),
            SyncKind.Renamed => ("renamed", "yellow"),
            SyncKind.Behind or SyncKind.NewOnServer => ("incoming", "cyan1"),
            SyncKind.DeletedOnServer => ("removed", "cyan1"),
            SyncKind.Conflict => ("conflict", "red"),
            _ => ("in sync", "grey")
        };
        return $"[{color}]{label}[/]{new string(' ', Math.Max(0, width - label.Length))}";
    }

    public static string DisplayPath(SyncEntry entry) =>
        entry.FromPath is not null
            ? $"{Markup.Escape(entry.FromPath)} [grey]→[/] {Markup.Escape(entry.Path)}"
            : Markup.Escape(entry.Path);

    public static List<SyncFileJson> ToJson(IEnumerable<SyncEntry> entries) =>
        entries.Select(e => new SyncFileJson(
            e.Path, e.FromPath, e.Kind, e.Reason)).ToList();

    private static string Note(SyncEntry entry) =>
        entry.Reason is not null ? $"  [grey]({Markup.Escape(entry.Reason)})[/]" : "";

    private static void AddCount(List<string> parts, int count, string label, string color)
    {
        if (count > 0)
        {
            parts.Add($"[{color}]{count} {label}[/]");
        }
    }
}

using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using System.Text.RegularExpressions;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace DepVault.Cli.Output;

/// <summary>
/// All console output: results on stdout, warnings and errors on stderr. In JSON mode stdout carries only the
/// JSON document and spinners are off.
/// </summary>
public sealed partial class Ui
{
    private readonly IAnsiConsole err;

    public Ui()
    {
        var colors = Environment.GetEnvironmentVariable("NO_COLOR") is { Length: > 0 }
            ? ColorSystemSupport.NoColors
            : ColorSystemSupport.Detect;
        Out = AnsiConsole.Create(new AnsiConsoleSettings { ColorSystem = colors, Out = new AnsiConsoleOutput(Console.Out) });
        err = AnsiConsole.Create(new AnsiConsoleSettings { ColorSystem = colors, Out = new AnsiConsoleOutput(Console.Error) });
    }

    /// <summary>Set from <c>--json</c>.</summary>
    public bool Json { get; set; }

    /// <summary>Stdout console, also used for prompts.</summary>
    public IAnsiConsole Out { get; }

    public void Line(string markup = "")
    {
        if (!Json)
        {
            Out.MarkupLine(markup);
        }
    }

    public void Write(IRenderable renderable)
    {
        if (!Json)
        {
            Out.Write(renderable);
        }
    }

    /// <summary>A <c>Label: value</c> line with the value escaped.</summary>
    public void KeyValue(string key, string value) => Line($"[cyan1]{Markup.Escape(key)}[/]: {Markup.Escape(value)}");

    public void Success(string text) => Line($"[green]{Markup.Escape(text)}[/]");

    /// <summary>Grey guidance where <c>`backticked`</c> spans are highlighted as commands.</summary>
    public void Hint(string text) => Line(HintMarkup(text));

    public void Warn(string text) => err.MarkupLine($"[yellow]{Markup.Escape(text)}[/]");

    public void Error(string text) => err.MarkupLine($"[red]Error: {Markup.Escape(text)}[/]");

    /// <summary>A boxed error on stderr for failures that need a specific next step.</summary>
    public void ErrorPanel(string title, string message, string hint, Color color)
    {
        err.WriteLine();
        err.Write(new Panel(new Rows(
                new Markup($"[{color.ToMarkup()}]{Markup.Escape(message)}[/]"),
                new Markup(""),
                new Markup(HintMarkup(hint))))
            .Header($"[{color.ToMarkup()}]{Markup.Escape(title)}[/]")
            .Border(BoxBorder.Rounded)
            .BorderStyle(new Style(color))
            .Padding(1, 0));
        err.WriteLine();
    }

    public void Table(string[] headers, IEnumerable<string[]> rows)
    {
        var table = new Table().Border(TableBorder.Rounded).BorderStyle(new Style(Color.Grey));
        foreach (var header in headers)
        {
            table.AddColumn($"[cyan1]{Markup.Escape(header)}[/]");
        }

        foreach (var row in rows)
        {
            table.AddRow(row.Select(Markup.Escape).ToArray());
        }

        Write(table);
    }

    public void WriteJson<T>(T value, JsonTypeInfo<T> typeInfo)
    {
        Console.Out.WriteLine(JsonSerializer.Serialize(value, typeInfo));
    }

    /// <summary>Runs <paramref name="work"/> under a spinner when a person is watching stdout.</summary>
    public async Task<T> SpinAsync<T>(string status, Func<Task<T>> work)
    {
        if (Json || Console.IsOutputRedirected)
        {
            return await work();
        }

        return await Out.Status().Spinner(Spinner.Known.Dots).StartAsync(status, _ => work());
    }

    public Task SpinAsync(string status, Func<Task> work) => SpinAsync(status, async () =>
    {
        await work();
        return true;
    });

    private static string HintMarkup(string text) =>
        $"[grey]{CommandSpan().Replace(Markup.Escape(text), "[/][cyan1]$1[/][grey]")}[/]";

    [GeneratedRegex("`([^`]+)`")]
    private static partial Regex CommandSpan();
}

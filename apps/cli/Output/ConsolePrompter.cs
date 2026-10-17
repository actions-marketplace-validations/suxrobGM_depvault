using DepVault.Cli.Common;
using DepVault.Cli.Config;
using Spectre.Console;

namespace DepVault.Cli.Output;

/// <summary>Interactive prompts; Esc in a selection throws <see cref="PromptCanceledException"/>.</summary>
public interface IConsolePrompter
{
    bool IsInteractive { get; }

    string Ask(string prompt, string? defaultValue = null);

    string AskSecret(string prompt);

    /// <summary>Returns <paramref name="defaultValue"/> without asking when not interactive.</summary>
    bool Confirm(string prompt, bool defaultValue);

    T Select<T>(string title, IEnumerable<T> choices, Func<T, string> displaySelector) where T : notnull;

    /// <summary>Every choice starts selected, so Enter takes all of them.</summary>
    List<T> MultiSelect<T>(string title, IEnumerable<T> choices, Func<T, string> displaySelector) where T : notnull;
}

public sealed class ConsolePrompter(CliEnvironment env, Ui ui) : IConsolePrompter
{
    /// <summary>Never with <c>--json</c>, whose stdout must stay a single JSON document.</summary>
    public bool IsInteractive => env.IsInteractive && !ui.Json;

    public string Ask(string prompt, string? defaultValue = null)
    {
        RequireInteractive();
        var textPrompt = new TextPrompt<string>($"[cyan1]{Markup.Escape(prompt)}[/]:");
        if (defaultValue is not null)
        {
            textPrompt.DefaultValue(defaultValue);
        }

        return ui.Out.Prompt(textPrompt);
    }

    public string AskSecret(string prompt)
    {
        RequireInteractive();
        return ui.Out.Prompt(new TextPrompt<string>($"[cyan1]{Markup.Escape(prompt)}[/]:").Secret());
    }

    public bool Confirm(string prompt, bool defaultValue)
    {
        return IsInteractive ? ui.Out.Confirm(Markup.Escape(prompt), defaultValue) : defaultValue;
    }

    public T Select<T>(string title, IEnumerable<T> choices, Func<T, string> displaySelector) where T : notnull
    {
        RequireInteractive();
        var cancelled = false;
        var prompt = new SelectionPrompt<T>()
            .Title(title)
            .UseConverter(displaySelector)
            .HighlightStyle(new Style(Color.Cyan1))
            .AddChoices(choices);
        prompt.CancelResult = () =>
        {
            cancelled = true;
            return default!;
        };

        var result = ui.Out.Prompt(prompt);
        return cancelled ? throw new PromptCanceledException() : result;
    }

    public List<T> MultiSelect<T>(string title, IEnumerable<T> choices, Func<T, string> displaySelector)
        where T : notnull
    {
        RequireInteractive();
        var choiceList = choices.ToList();
        if (choiceList.Count == 0)
        {
            return [];
        }

        var cancelled = false;
        var prompt = new MultiSelectionPrompt<T>()
            .Title(title)
            .UseConverter(displaySelector)
            .Required(false)
            .HighlightStyle(new Style(Color.Cyan1))
            .InstructionsText(
                "[grey](Press [cyan1]<space>[/] to toggle, [cyan1]<enter>[/] to confirm, [cyan1]<esc>[/] to cancel)[/]")
            .AddChoices(choiceList);
        prompt.CancelResult = () =>
        {
            cancelled = true;
            return [];
        };
        choiceList.ForEach(c => prompt.Select(c));

        var result = ui.Out.Prompt(prompt);
        return cancelled ? throw new PromptCanceledException() : result;
    }

    private void RequireInteractive()
    {
        if (!IsInteractive)
        {
            throw new CliException("This needs an interactive terminal; pass the value as an option instead.",
                ExitCodes.Usage);
        }
    }
}

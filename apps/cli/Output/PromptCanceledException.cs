namespace DepVault.Cli.Output;

/// <summary>Thrown when the user presses Esc in a prompt; treat as a non-fatal abort, not an error.</summary>
public sealed class PromptCanceledException() : Exception("Operation canceled.");

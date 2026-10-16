namespace DepVault.Cli.Output;

/// <summary>Whether the caller (typically a per-file loop) should keep going or abort.</summary>
public enum ErrorDisposition
{
    Continue,
    Abort
}

/// <summary>
/// In-command error policy: auth errors render once and <see cref="ErrorDisposition.Abort"/>; others render
/// and <see cref="ErrorDisposition.Continue"/> so per-file loops finish. Never re-throws.
/// </summary>
public interface IErrorHandler
{
    ErrorDisposition Handle(Exception ex, string fallbackMessage);
}

public sealed class ErrorHandler(IOutputFormatter output) : IErrorHandler
{
    public ErrorDisposition Handle(Exception ex, string fallbackMessage)
    {
        if (ApiErrorHandler.IsAuthError(ex))
        {
            ApiErrorHandler.PrintAuthError();
            return ErrorDisposition.Abort;
        }

        if (ApiErrorHandler.IsPlanLimitError(ex))
        {
            ApiErrorHandler.PrintPlanLimitError(ex.Message);
            return ErrorDisposition.Continue;
        }

        output.PrintError($"{fallbackMessage}: {ex.Message}");
        return ErrorDisposition.Continue;
    }
}

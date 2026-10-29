namespace DepVault.Cli.Common;

/// <summary>Process exit codes, so scripts can tell a conflict or a finding from a failure.</summary>
public static class ExitCodes
{
    public const int Ok = 0;
    public const int Error = 1;
    public const int Usage = 2;
    public const int Conflict = 3;
    public const int Findings = 4;
    public const int Cancelled = 130;
}

/// <summary>An expected failure: the message is printed as-is and the process exits with <see cref="ExitCode"/>.</summary>
public sealed class CliException(string message, int exitCode = ExitCodes.Error) : Exception(message)
{
    public int ExitCode { get; } = exitCode;
}

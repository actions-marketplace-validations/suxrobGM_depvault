namespace DepVault.Cli.Config;

/// <summary>What the process was started with: CI token, vault password, and whether a person is at the terminal.</summary>
public sealed class CliEnvironment
{
    public CliEnvironment()
    {
        CiToken = Read(Constants.CiTokenEnvVar);
        VaultPassword = Read("DEPVAULT_PASSWORD");
        IsInteractive = !Console.IsInputRedirected && !Console.IsOutputRedirected && CiToken is null;
    }

    /// <summary>The <c>DEPVAULT_TOKEN</c> value, or null outside CI.</summary>
    public string? CiToken { get; }

    public bool IsCi => CiToken is not null;

    public string? VaultPassword { get; }

    /// <summary>Prompts and spinners need a terminal on both ends; CI never prompts.</summary>
    public bool IsInteractive { get; }

    private static string? Read(string name) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } value ? value : null;
}

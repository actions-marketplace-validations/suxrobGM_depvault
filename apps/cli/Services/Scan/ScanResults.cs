namespace DepVault.Cli.Services.Scan;

internal sealed class ScanResults
{
    public int FilesAnalyzed { get; set; }
    public int TotalDependencies { get; set; }
    public int TotalVulnerabilities { get; set; }
    public List<(string Path, double Score)> HealthScores { get; } = [];
    public int SecretLeaksFound { get; set; }
    public int UntrackedSecretFiles { get; set; }
}

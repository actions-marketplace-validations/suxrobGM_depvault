using System.Diagnostics;

namespace DepVault.Cli.Services;

/// <summary>Result of <c>git check-ignore</c>: the ignored paths and whether git ran in a usable repository.</summary>
public sealed record GitCheckIgnoreResult(HashSet<string> Ignored, bool InRepository);

/// <summary>Asks git which paths its ignore rules (.gitignore, info/exclude, global excludes) ignore.</summary>
public interface IGitCheckIgnore
{
    /// <summary>
    /// Runs <c>git check-ignore --stdin</c> in <paramref name="workingDirectory"/> for forward-slash
    /// <paramref name="paths"/>; null when git can't be started.
    /// </summary>
    GitCheckIgnoreResult? Run(string workingDirectory, IEnumerable<string> paths, IEqualityComparer<string> comparer);
}

public sealed class GitCheckIgnore : IGitCheckIgnore
{
    public GitCheckIgnoreResult? Run(
        string workingDirectory, IEnumerable<string> paths, IEqualityComparer<string> comparer)
    {
        try
        {
            var psi = new ProcessStartInfo("git", "check-ignore --stdin")
            {
                WorkingDirectory = workingDirectory,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process is null)
            {
                return null;
            }

            // Read while writing so a large output can't fill the pipe and deadlock the stdin write.
            var stdout = process.StandardOutput.ReadToEndAsync();
            process.StandardInput.Write(string.Join('\n', paths));
            process.StandardInput.Close();
            var output = stdout.GetAwaiter().GetResult();
            var exited = process.WaitForExit(10_000);

            var ignored = output.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim().Replace('\\', '/'))
                .ToHashSet(comparer);

            // Exit 0 = some ignored, 1 = none ignored, anything else (128) = not a usable repo.
            return new GitCheckIgnoreResult(ignored, exited && process.ExitCode is 0 or 1);
        }
        catch
        {
            return null;
        }
    }
}

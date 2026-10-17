using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using DepVault.Cli.Common;
using DepVault.Cli.Output;

namespace DepVault.Cli.Services;

/// <summary>Replaces this binary with the latest release, verified against the release's <c>SHA256SUMS</c>.</summary>
public interface IUpdateService
{
    Task UpdateAsync(CancellationToken ct = default);
}

public sealed class UpdateService(IVersionChecker versionChecker, IGitHubReleaseClient gitHub, Ui ui) : IUpdateService
{
    private static readonly HttpClient Http = new()
    {
        DefaultRequestHeaders = { { "User-Agent", "depvault-cli" } },
        Timeout = TimeSpan.FromMinutes(2)
    };

    public async Task UpdateAsync(CancellationToken ct = default)
    {
        var current = versionChecker.GetCurrentVersion();
        var latest = await ui.SpinAsync("Checking for updates...", () => versionChecker.GetLatestVersionAsync(ct))
                     ?? throw new CliException("Could not check for updates. Check your internet connection.");

        if (!VersionChecker.IsNewer(latest, current))
        {
            ui.Success($"You are already on the latest version (v{current}).");
            return;
        }

        var rid = DetectRid() ?? throw new CliException("No prebuilt binary for this platform; update manually.");
        var binaryPath = Environment.ProcessPath ?? throw new CliException("Could not determine the current binary path.");

        await ui.SpinAsync($"Downloading v{latest}...", () => DownloadAndInstallAsync(latest, rid, binaryPath, ct));
        ui.Success($"Updated v{current} -> v{latest}.");
    }

    /// <summary>The SHA-256 (lowercase hex) that <paramref name="sums"/> lists for <paramref name="fileName"/>, or null.</summary>
    internal static string? ExpectedHash(string sums, string fileName) =>
        sums.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim().Split(' ', 2, StringSplitOptions.TrimEntries))
            .FirstOrDefault(parts => parts.Length == 2 && parts[1].TrimStart('*') == fileName)?[0]
            .ToLowerInvariant();

    private async Task<bool> DownloadAndInstallAsync(string version, string rid, string binaryPath, CancellationToken ct)
    {
        var isWindows = rid.StartsWith("win", StringComparison.Ordinal);
        var archiveName = $"depvault-{rid}.{(isWindows ? "zip" : "tar.gz")}";
        var tempDir = Directory.CreateTempSubdirectory("depvault-update-").FullName;

        try
        {
            var archivePath = Path.Combine(tempDir, archiveName);
            await using (var file = File.Create(archivePath))
            await using (var stream = await Http.GetStreamAsync(gitHub.AssetUrl(version, archiveName), ct))
            {
                await stream.CopyToAsync(file, ct);
            }

            var sums = await Http.GetStringAsync(gitHub.AssetUrl(version, "SHA256SUMS"), ct);
            string actual;
            await using (var archive = File.OpenRead(archivePath))
            {
                actual = Convert.ToHexStringLower(await SHA256.HashDataAsync(archive, ct));
            }

            if (ExpectedHash(sums, archiveName) != actual)
            {
                throw new CliException($"Checksum mismatch for {archiveName}; nothing was installed.");
            }

            var extractDir = Directory.CreateDirectory(Path.Combine(tempDir, "extracted")).FullName;
            if (isWindows)
            {
                await ZipFile.ExtractToDirectoryAsync(archivePath, extractDir, ct);
            }
            else
            {
                await ExtractTarGzAsync(archivePath, extractDir, ct);
            }

            var newBinaryPath = Path.Combine(extractDir, isWindows ? "depvault.exe" : "depvault");
            if (!File.Exists(newBinaryPath))
            {
                throw new CliException("The downloaded archive doesn't contain the depvault binary.");
            }

            ReplaceBinary(binaryPath, newBinaryPath);
            return true;
        }
        catch (HttpRequestException ex)
        {
            throw new CliException($"Download failed: {ex.Message}");
        }
        finally
        {
            try
            {
                Directory.Delete(tempDir, recursive: true);
            }
            catch (IOException)
            {
                // Temp files are cleaned up by the OS eventually.
            }
        }
    }

    private static void ReplaceBinary(string currentPath, string newPath)
    {
        if (OperatingSystem.IsWindows())
        {
            // A running exe can't be deleted, only renamed; Startup removes the .old copy next run.
            var backupPath = currentPath + ".old";
            File.Delete(backupPath);
            File.Move(currentPath, backupPath);
            File.Move(newPath, currentPath);
            return;
        }

        var mode = File.GetUnixFileMode(currentPath);
        File.Move(newPath, currentPath, overwrite: true);
        File.SetUnixFileMode(currentPath, mode);
    }

    private static async Task ExtractTarGzAsync(string archivePath, string outputDir, CancellationToken ct)
    {
        using var process = Process.Start(new ProcessStartInfo("tar")
        {
            ArgumentList = { "-xzf", archivePath, "-C", outputDir },
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        })!;
        await process.WaitForExitAsync(ct);

        if (process.ExitCode != 0)
        {
            throw new CliException($"Extracting the update failed: {await process.StandardError.ReadToEndAsync(ct)}");
        }
    }

    private static string? DetectRid()
    {
        var arch = RuntimeInformation.OSArchitecture switch
        {
            Architecture.X64 => "x64",
            Architecture.Arm64 => "arm64",
            _ => null
        };

        if (OperatingSystem.IsWindows())
        {
            // Windows on ARM runs the x64 build under emulation.
            return "win-x64";
        }

        if (arch is null)
        {
            return null;
        }

        return OperatingSystem.IsLinux() ? $"linux-{arch}" : OperatingSystem.IsMacOS() ? $"osx-{arch}" : null;
    }
}

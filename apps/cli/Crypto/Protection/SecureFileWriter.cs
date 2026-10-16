namespace DepVault.Cli.Crypto;

/// <summary>Writes secret-bearing files (KEK envelope, protector key) readable only by the owner.</summary>
internal static class SecureFileWriter
{
    /// <summary>
    /// Writes <paramref name="contents"/> owner-only. On POSIX the file and parent dir are restricted
    /// <em>before</em> the secret is written, so it is never momentarily readable by others; on Windows,
    /// user-profile ACL inheritance (plus DPAPI binding) is relied upon.
    /// </summary>
    public static void WriteOwnerOnly(string path, string contents)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
            if (!OperatingSystem.IsWindows())
            {
                File.SetUnixFileMode(
                    dir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
        }

        if (!OperatingSystem.IsWindows() && !File.Exists(path))
        {
            using (File.Create(path))
            {
            }

            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }

        File.WriteAllText(path, contents);

        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
    }
}

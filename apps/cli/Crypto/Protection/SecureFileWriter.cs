using System.Text;

namespace DepVault.Cli.Crypto;

/// <summary>Writes secret-bearing files readable only by the owner.</summary>
internal static class SecureFileWriter
{
    /// <summary>
    /// Writes a file under the private config folder (KEK envelope, protector key, sync state); the parent
    /// folder is restricted too, since everything in it is private.
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

        Write(path, Encoding.UTF8.GetBytes(contents));
    }

    /// <summary>Writes a pulled secret into the working tree, creating folders with default permissions.</summary>
    public static void WriteFileOwnerOnly(string path, byte[] contents)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        Write(path, contents);
    }

    /// <summary>
    /// On POSIX the file is restricted <em>before</em> the secret is written, so it is never momentarily
    /// readable by others; on Windows, user-profile ACL inheritance (plus DPAPI binding) is relied upon.
    /// </summary>
    private static void Write(string path, byte[] contents)
    {
        if (!OperatingSystem.IsWindows() && !File.Exists(path))
        {
            using (File.Create(path))
            {
            }

            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }

        File.WriteAllBytes(path, contents);

        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
    }
}

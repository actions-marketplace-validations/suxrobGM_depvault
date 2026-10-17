using System.Security.Cryptography;

namespace DepVault.Cli.Crypto;

/// <summary>In-memory vault state for this process: the KEK and a per-project DEK cache.</summary>
public sealed class VaultState
{
    private byte[]? kek;
    private string? kekSalt;
    private readonly Dictionary<string, byte[]> dekCache = [];

    public bool IsUnlocked => kek is not null;

    /// <summary>Returns the cached KEK, or null if locked.</summary>
    public byte[]? Kek => kek;

    /// <summary>Base64 salt that was used to derive the currently cached KEK, or null if locked.</summary>
    public string? KekSalt => kekSalt;

    /// <summary>
    /// Caches the KEK with its derivation salt, so a server-side salt rotation (password change elsewhere)
    /// can invalidate it before it wraps new grants.
    /// </summary>
    public void Unlock(byte[] kek, string salt)
    {
        this.kek = kek;
        kekSalt = salt;
        dekCache.Clear();
    }

    /// <summary>Zero the KEK, clear DEK cache, and mark vault as locked.</summary>
    public void Lock()
    {
        if (kek is not null)
        {
            CryptographicOperations.ZeroMemory(kek);
            kek = null;
        }

        foreach (var dek in dekCache.Values)
        {
            CryptographicOperations.ZeroMemory(dek);
        }

        dekCache.Clear();
        kekSalt = null;
    }

    /// <summary>Cache a resolved DEK for a project.</summary>
    public void CacheDek(string projectId, byte[] dek)
    {
        dekCache[projectId] = dek;
    }

    /// <summary>Retrieve a cached DEK, or null if not cached.</summary>
    public byte[]? GetCachedDek(string projectId)
    {
        return dekCache.GetValueOrDefault(projectId);
    }
}

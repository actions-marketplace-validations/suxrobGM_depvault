---
description: CLI conventions for .NET 10 Native AOT CLI
paths: [apps/cli/**]
---

# CLI Conventions

## Architecture

- .NET 10 with Native AOT compilation
- System.CommandLine for CLI framework
- Kiota-generated HTTP client from OpenAPI spec
- Microsoft DI for dependency injection (`Startup.cs`)
- Spectre.Console for all UI rendering
- REPL mode with persistent banner and vault status and non-interactive mode for CI/CD

## Static vs DI

- **Static** only when pure: stateless, deterministic, no IO/network/subprocess/rendering. E.g. `VaultCrypto`, `SyncPlanner`, `SecretFilePatterns`, `PathGlob`, `RepoPath`, `EcosystemResolver`, `BinaryDetector`, `PlaceholderFilter`, `SecretPatterns`, `RegexPatterns`, `Constants`, `ConsoleTheme`
- **DI service** (interface + singleton in `Startup.cs`) for anything with state, IO, network, subprocess, or rendering. E.g. `IRepositoryLocator`, `ProjectLinker`, `SyncService`, `ILocalFileScanner`, `DekService`, `IConfigService`, `ICredentialStore`, `IFileScanner`
- **Presentation boundary:** errors/success/structured output go through `IOutputFormatter` / `ConsoleRenderer`. Services return results/errors, not rendered output; transient `AnsiConsole.Status` spinners and `IConsolePrompter` prompts may stay inline in handlers
- **AOT:** constructor injection only — no reflection; JSON only via source-generated `JsonSerializerContext`s

## Project layout

Folders encode the static-vs-DI rule:

- `Common/` — pure static helpers (`PathGlob`, `RepoPath`, `RegexPatterns`, `ExcludedDirectories`, `CiTokenFormat`).
- `Services/` — injectable services: `RepositoryLocator`, `FileArgResolver`, `FileScanner` (dependency manifests), etc. `Services/Sync/` holds file sync (`ProjectLinkStore`, `SyncStateStore`, `LocalFileScanner`, `SyncPlanner`, `SyncService`, `ProjectLinker`, `CiPuller`); `Services/Scan/` the scan steps; `Services/SecretScanning/` the leak-detection filters.
- `Crypto/` — `VaultCrypto` (static primitives), `DekService`, `VaultState`.
- `Output/` — rendering: `OutputFormatter`, `ConsoleRenderer`, `ConsolePrompter`, `ErrorHandler` + static `ApiErrorHandler`, `ConsoleTheme`.
- `Auth/` — session/auth services: `AuthContext`, `ApiClientFactory`, `TokenAuthProvider`, `TokenRefreshHandler`.
- `Config/` — `ConfigService` + `CredentialStore`.
- `Commands/` — thin `System.CommandLine` factory classes (`*Commands`, `RootHandler`, `SyncSession` for shared file-command setup); business logic lives in `Services/`.
- `Repl/` — interactive REPL host.

## Auth & Config

- **JWT mode**: credentials in `~/.depvault/credentials.json` (interactive users)
- **CI token mode**: `DEPVAULT_TOKEN` env var (CI/CD); blocks interactive login
- Config (server, output) in `~/.depvault/config.json` via `IConfigService`; `DEPVAULT_HOME` overrides the folder. The project is per folder: `.depvault.json` (committed; `project`, `name`, `ignore` globs) found by walking up from the cwd — its folder is the sync root
- Sync base per machine in `~/.depvault/sync/<hash(projectId|root)>.json`: last synced `{path, version, contentHash}` per file id

## Vault State (`Crypto/VaultState.cs`)

- Singleton holding KEK and per-project DEK cache (no idle auto-lock)
- `Unlock(kek)` caches KEK; `Lock()` zeros memory via `CryptographicOperations.ZeroMemory`
- `DekService` checks cache before prompting/fetching; auto-creates SELF grants when none exist

## Persisted Unlock (`Crypto/PersistentVaultStore.cs`, `Crypto/KekProtector.cs`)

- "Unlock once per device": after a password unlock, one prompt "Remember on this device for 30 days?" (default yes; never asked in CI/non-interactive). The vault **password is never stored** — only the derived KEK, encrypted at rest via `IKekProtector` (`WindowsKekProtector` = DPAPI `CurrentUser`; `PosixKekProtector` = AES-GCM under an owner-only `vault-protector.key`)
- `IPersistentVaultStore` writes `~/.depvault/vault-session.json` (`{ protectedKek, kekSalt, expiresAt }`, source-gen JSON). `TryLoad` returns null on missing/corrupt/expired/unprotect-fail (clearing stale sessions); `HasSession` is a cheap existence+expiry check (no unprotect) for the banner and prompt guards
- `DekService` loads a valid session transparently into `VaultState` (salt-mismatch or `VerifyKek` failure ⇒ drop + fall back to password). `RememberedUnlockService.OfferRemember()` is the only opt-in; `lock`/`logout` call `Clear()`

## Client-Side Encryption (`Crypto/`)

- `VaultCrypto.cs` (static): `Encrypt`/`Decrypt`/`EncryptBytes`/`DecryptBytes`, `DeriveKek` (PBKDF2), `DeriveCiWrapKey` (HKDF), `WrapKey`/`UnwrapKey`
- `DekService.cs` resolves a logged-in user's project DEK: cached KEK from `VaultState`, else remembered unlock, else password (prompt or `DEPVAULT_PASSWORD`) → KEK salt from `/api/vault/status` → derive KEK → grant from `/api/projects/:id/keygrants/my` → unwrap DEK. **Auto SELF grant**: on 404, generate DEK, wrap with KEK, POST to `/api/projects/:id/keygrants`
- All encrypt/decrypt is local — backend returns only ciphertext
- Files are **whole-file blobs** (one ciphertext each), never parsed into variables, identified only by repo-relative path
- **Discovery** (`LocalFileScanner` + `SecretFilePatterns`): secret-looking names that git ignores (checked per nearest git repo, so submodules apply their own .gitignore), minus `.depvault.json` ignore globs. Explicit path args are always considered
- **Plan** (`SyncPlanner`, pure): three-way per file id — local hash vs last-synced base vs server version/hash → InSync / Modified / Untracked / Deleted / Renamed (delete + untracked with identical hash) / Behind / NewOnServer / DeletedOnServer / Conflict
- **Push**: one atomic `POST /files/changes` per ≤50 files/20 MB with each file's `baseVersion`; 409 ⇒ someone changed it, pull first. Deletions need confirmation or an exact path arg; conflicts need `--force`. The base is saved after every batch
- **Pull**: **byte-faithful** — bulk `POST /files/download`, decrypt, write verbatim (owner-only) to the repo-relative path; applies server moves and deletes; never overwrites local changes without `--force`
- **CI pull** (`CiPuller`): `GET /api/ci/files` returns `{ wrappedDek*, files[] }` (filtered by the token's `paths` globs) in one call; written under the linked root or cwd

## Regenerating API Client

`bun run export:openapi` (in apps/backend) → copy to `apps/cli/openapi.json` → run:

```bash
dotnet kiota generate -l CSharp \
  -d apps/cli/openapi.json \
  -o apps/cli/ApiClient \
  -n DepVault.Cli.ApiClient \
  --exclude-backward-compatible
```

## Build

- `dotnet build` (dev); `dotnet publish -c Release -r <rid>` for AOT binary (linux-x64, osx-x64, osx-arm64, win-x64)

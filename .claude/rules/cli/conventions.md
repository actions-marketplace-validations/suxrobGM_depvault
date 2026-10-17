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
- Spectre.Console for all UI rendering, through `Ui`
- One-shot commands only (no REPL); bare `depvault` prints a status line and the command list

## Commands, errors and output

- Command actions **return an exit code** from `ExitCodes` (`Common/CliException.cs`): 0 ok, 1 error, 2 usage, 3 conflict, 4 scan findings, 130 cancelled
- Expected failures **throw `CliException(message, exitCode)`**; never print-and-return. `Program.cs` is the only place failures are rendered (also auth/plan-limit panels, `ApiException`, `HttpRequestException`)
- **`Ui`** is the only writer: results on stdout (`Line`, `Success`, `Hint` with `` `command` `` highlighting, `Table`, `Write`), `Warn`/`Error` on stderr, `WriteJson` with a source-generated `CliJsonContext` type. `ui.Json` (set from the shared `CliOptions.Json`) suppresses human stdout output, spinners and prompts
- **Services return results or throw**, they don't print. Prompts go through `IConsolePrompter` (non-interactive with `--json`, in CI, or when stdin/stdout is redirected); `ProjectLinker` and `VaultUnlocker` are prompt-driven flows and may ask
- Destructive actions confirm via `prompter.ConfirmDestructive(question, yes, action)` (default no; without a terminal a usage error asking for `--yes`); sync deletions use `SyncSession.ConfirmDeletions` (exact path args). Never silently proceed

## Static vs DI

- **Static** only when pure: stateless, deterministic, no IO/network/subprocess/rendering. E.g. `VaultCrypto`, `SyncPlanner`, `PathFilter.Resolve`, `LineDiff`, `SecretFilePatterns`, `PathGlob`, `RepoPath`, `EcosystemResolver`, `BinaryDetector`, `ApiErrors`, `Constants`
- **DI service** (singleton in `Startup.cs`) for anything with state, IO, network, subprocess, or rendering. E.g. `Ui`, `Session`, `IRepoFilesApi`, `SyncService`, `ProjectLinker`, `VaultUnlocker`, `DekService`, `RepoScanner`
- **AOT:** constructor injection only, no reflection; JSON only via source-generated `JsonSerializerContext`s; parse enums with `Enum.TryParse<T>`

## Project layout

- `Common/`: pure helpers (`CliException`/`ExitCodes`, `ApiErrors`, `PathGlob`, `RepoPath`, `LineDiff`, `CiTokenFormat`, `RegexPatterns`).
- `Config/`: `CliEnvironment` (CI token, `DEPVAULT_PASSWORD`, interactivity), `ConfigService`, `CredentialStore`.
- `Auth/`: `Session` (auth mode, `RequireUser`), `ApiClientFactory`, `TokenAuthProvider`, `TokenRefreshHandler`.
- `Crypto/`: `VaultCrypto` (static primitives), `Protection/` (KEK at rest, owner-only writes), `Vault/` (`VaultUnlocker`, `PersistentVaultStore`, `DekService`).
- `Services/`: `Sync/` (`RepoFilesApi`, `ProjectLinkStore`, `SyncStateStore`, `LocalFileScanner`, `SyncPlanner`, `PathFilter`, `SyncService`, `ProjectLinker`, `CiPuller`), `Scan/` (`RepoScanner`), `Discovery/`, `SecretScanning/`, `Analysis/`, `Updates/`.
- `Output/`: `Ui`, `ConsolePrompter`, `SyncView`, `JsonOutput` (the `--json` shapes).
- `Commands/`: thin `System.CommandLine` factories (`*Commands`, `RootHandler`, `SyncSession` for shared file-command setup, `CliOptions`); logic lives in `Services/`.

## Auth & Config

- **User mode**: credentials in `~/.depvault/credentials.json`, **bound to the server that issued them**: `Session.User` is null for another configured server, and `TokenAuthProvider` attaches the token only to requests for its server
- **CI token mode**: `DEPVAULT_TOKEN`; only `pull` works (`Session.RequireUser` throws otherwise)
- Config (`server` only) in `~/.depvault/config.json`; `DEPVAULT_HOME` overrides the folder. The project is per folder: `.depvault.json` (committed; `project`, `name`, `ignore` globs) found by walking up from the cwd. Its folder is the sync root
- Sync base per machine in `~/.depvault/sync/<hash(projectId|root)>.json`: last synced `{path, version, contentHash}` per file id

## Vault and project keys

- `VaultUnlocker.GetKekAsync`: remembered unlock (dropped if its salt or `VerifyKek` no longer matches the server) → `DEPVAULT_PASSWORD` → prompt, then offers "Remember on this device for 30 days?" (default yes). `unlock` always remembers; `lock`/`logout` call `Forget()`. Only the derived KEK is stored, encrypted via `IKekProtector` (DPAPI on Windows, AES-GCM under an owner-only key file on POSIX)
- `DekService.GetAsync` unwraps the user's grant from `/projects/:id/keygrants/my`: SELF with the KEK, **ECDH** with `DeriveSharedKey(private key, granterPublicKey)` (raw P-256 secret, matching WebCrypto `deriveKey`)
- An ECDH grant is adopted right after unwrapping: `PUT /projects/:id/keygrants/my` stores SELF + RECOVERY grants (best-effort; the shared grant keeps working until then)
- On 404 it creates the project's **first** key with the same single `PUT .../keygrants/my`; the server answers 409 when someone else already holds a key, which becomes the "ask for Grant access" error. Never generate a key any other way

## Sync

- All encrypt/decrypt is local; files are **whole-file blobs** identified only by repo-relative path
- **Discovery** (`LocalFileScanner` + `SecretFilePatterns`): secret-looking names that git ignores (per nearest git repo), minus `.depvault.json` ignore globs. Explicit path args are always considered
- **Plan** (`SyncPlanner`, pure): three-way per file id → InSync / Modified / Untracked / Deleted / Renamed / Behind / NewOnServer / DeletedOnServer / Conflict
- **Push**: atomic `POST /files/changes` batches (≤50 files/20 MB) with each `baseVersion`; 409 ⇒ exit 3, pull first. The base is saved after every batch
- **Deletions** in either direction (`SyncSession.ConfirmDeletions`): confirmed interactively, else only exact path args
- **Pull**: bulk download, decrypt, write byte-for-byte (owner-only); never overwrites local changes without `--force`
- **History**: `log`/`diff`/`restore` via `IRepoFilesApi.ListVersionsAsync`/`GetVersionAsync`; `restore` writes locally only
- **CI pull** (`CiPuller`): `GET /api/ci/files` returns `{ wrappedDek*, files[] }` in one call; written under the linked root or cwd

## Testing

- xUnit in `tests/DepVault.Cli.Tests`; `SyncService` is tested against `FakeFilesApi` (in-memory, version-checked) in `TestDoubles.cs`
- Cross-language crypto is pinned by known-answer and WebCrypto-generated fixtures in `CryptoInteropTests`

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

- `dotnet build` (dev); `dotnet publish -c Release -r <rid>` for AOT binary (linux-x64, linux-arm64, osx-x64, osx-arm64, win-x64)
- Releases publish `SHA256SUMS`; installers, the GitHub Action and `depvault update` verify against it

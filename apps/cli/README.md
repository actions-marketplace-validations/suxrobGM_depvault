# DepVault CLI

A .NET 10 command-line tool for DepVault — git-like, end-to-end encrypted sync of a repo's secret files, plus dependency analysis. Compiled with Native AOT for fast startup and small binary size.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Backend running at `http://localhost:4000` (or configure with `depvault config set server <url>`)

## Quick Start

```bash
# From the repo root — restore the Kiota tool
dotnet tool restore

# Generate the API client from the backend's OpenAPI spec
cd apps/backend
bun run export:openapi

# Generate the typed C# client
cd ../..
dotnet kiota generate -l CSharp \
  -d apps/cli/openapi.json \
  -o apps/cli/ApiClient \
  -n DepVault.Cli.ApiClient \
  --exclude-backward-compatible

# Build
cd apps/cli
dotnet build

# Run
dotnet run -- --help
```

## Publish (Native AOT)

```bash
dotnet publish -c Release -r win-x64      # Windows
dotnet publish -c Release -r linux-x64    # Linux
dotnet publish -c Release -r osx-arm64    # macOS Apple Silicon
```

## Project Structure

```text
apps/cli/
├── Program.cs             # Entry point: parse, run, render failures, exit code
├── Startup.cs             # DI container and command registration
├── Constants.cs           # Shared constants (env var names, config dir)
├── Auth/                  # Session (CI token vs user), API client factory, token refresh
├── Commands/
│   ├── RootHandler.cs       # bare `depvault`: status line + command list
│   ├── AuthCommands.cs      # login, logout, whoami
│   ├── SyncCommands.cs      # init, status, push, pull, untrack
│   ├── HistoryCommands.cs   # log, diff, restore
│   ├── SyncSession.cs       # shared setup for file commands (link, project key, sync plan)
│   ├── PurgeCommands.cs     # purge (delete local copies)
│   ├── ProjectCommands.cs   # project (linked project + list)
│   ├── VaultCommands.cs     # unlock, lock
│   ├── ConfigCommands.cs    # config [set|get]
│   ├── AnalysisCommands.cs  # analyze
│   ├── ScanCommands.cs      # scan
│   ├── DoctorCommands.cs    # doctor
│   └── UpdateCommands.cs    # update, version
├── Common/                # Pure helpers: CliException + exit codes, PathGlob, RepoPath, LineDiff, ...
├── Config/                # CliEnvironment, ~/.depvault/config.json and credentials.json
├── Crypto/
│   ├── Core/                # VaultCrypto: AES-GCM, PBKDF2, HKDF, ECDH, content tags
│   ├── Protection/          # local KEK protection (DPAPI / owner-only key) and owner-only writes
│   └── Vault/               # VaultUnlocker, remembered unlock, project key (DEK) resolution
├── Services/
│   ├── Sync/                # files API, .depvault.json, sync state, discovery, planner, push/pull, CI pull
│   ├── Analysis/            # analysis API client wrapper
│   ├── Discovery/           # repo, dependency-file and leaked-secret discovery
│   ├── ProjectResolution/   # project listing / git-remote matching
│   ├── Scan/                # RepoScanner: the scan report
│   ├── SecretScanning/      # leak-detection patterns and filters
│   └── Updates/             # release checks and verified self-update
├── Output/                # Ui (stdout/stderr/JSON), prompts, sync rendering, JSON shapes
├── ApiClient/             # Kiota-generated (gitignored)
└── openapi.json           # Exported OpenAPI spec (gitignored)
```

## Commands

```text
depvault login [--server <url>]
depvault logout
depvault whoami
depvault init [--project <id>]
depvault status [paths...] [--json]
depvault push [paths...] [-m <message>] [--yes] [--force] [--dry-run] [--json]
depvault pull [paths...] [--yes] [--force] [--dry-run] [--json]
depvault untrack <paths...> [--yes]
depvault log <path> [--json]
depvault diff <path> [--version <n>]
depvault restore <path> --version <n> [--yes]
depvault purge [paths...] [--dry-run] [--yes] [--force]
depvault unlock
depvault lock
depvault project [--json]
depvault config [set server <url> | get server]
depvault analyze [--file <path>] [--ecosystem <name>] [--json]
depvault scan [--path <dir>] [--fail-on <severity>] [--json]
depvault doctor
depvault update
depvault version
```

File commands also accept `--project <id>` to override the project in `.depvault.json`. Exit codes: 0 ok, 1 error, 2 usage, 3 conflict, 4 scan findings, 130 cancelled.

## Authentication

**Interactive login** uses a browser device flow and stores tokens in `~/.depvault/credentials.json` (`DEPVAULT_HOME` overrides the folder):

```bash
depvault login
```

Set up your account and encryption vault in the web dashboard first. Run `depvault doctor` to check what's configured. The vault password is asked once per device and the derived key can be remembered for 30 days (`depvault lock` forgets it); set `DEPVAULT_PASSWORD` for non-interactive use.

**CI/CD mode** uses `DEPVAULT_TOKEN` (created in the project's settings). The token has the form `dvci_<auth>.<key>`; the CLI sends only the auth part to the server and derives the decryption key from the key part locally. CI tokens are read-only:

```bash
export DEPVAULT_TOKEN=dvci_abc12345.xxxxxxxxxxxx
depvault pull                 # every file the token can read
depvault pull deploy/.env     # just one
```

## Regenerating the API Client

When backend endpoints change:

```bash
cd apps/backend && bun run export:openapi && cd ../..
dotnet kiota generate -l CSharp \
  -d apps/cli/openapi.json \
  -o apps/cli/ApiClient \
  -n DepVault.Cli.ApiClient \
  --exclude-backward-compatible
```

For full documentation, see [docs/cli.md](../../docs/cli.md).

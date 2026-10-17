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
├── Program.cs             # Entry point
├── Startup.cs             # DI container and command registration
├── Constants.cs           # Shared constants (env var names, config dir)
├── Auth/                  # API client factory, auth mode (JWT vs CI token), token refresh
├── Commands/
│   ├── AuthCommands.cs      # login, logout, whoami
│   ├── SyncCommands.cs      # init, status, push, pull, untrack
│   ├── SyncSession.cs       # shared setup for file commands (link, vault key, sync plan)
│   ├── PurgeCommands.cs     # purge (delete local copies)
│   ├── ProjectCommands.cs   # project (linked project + list)
│   ├── VaultCommands.cs     # unlock, lock
│   ├── ConfigCommands.cs    # config [set|get]
│   ├── AnalysisCommands.cs  # analyze
│   ├── ScanCommands.cs      # scan
│   ├── DoctorCommands.cs    # doctor
│   └── UpdateCommands.cs    # update
├── Common/                # Pure helpers: PathGlob, RepoPath, CiTokenFormat, ...
├── Config/                # ~/.depvault/config.json and credentials.json
├── Crypto/
│   ├── Core/                # VaultCrypto: AES-GCM, PBKDF2, HKDF, content tags
│   ├── Protection/          # local KEK protection (DPAPI / owner-only key) and owner-only writes
│   └── Vault/               # unlock, remembered unlock, DEK resolution
├── Services/
│   ├── Sync/                # .depvault.json, sync state, discovery, three-way planner, push/pull, CI pull
│   ├── Analysis/            # analysis API client wrapper
│   ├── Discovery/           # repo and dependency-file discovery
│   ├── ProjectResolution/   # project listing / git-remote matching
│   ├── Scan/                # scan steps
│   ├── SecretScanning/      # leak-detection patterns and filters
│   └── Updates/             # release checks and self-update
├── Output/                # Rendering, prompts, error handling
├── Repl/                  # Interactive mode
├── ApiClient/             # Kiota-generated (gitignored)
└── openapi.json           # Exported OpenAPI spec (gitignored)
```

## Commands

```text
depvault login [--server <url>]
depvault logout
depvault whoami
depvault init [--project <id>]
depvault status [paths...]
depvault push [paths...] [-m <message>] [--yes] [--force]
depvault pull [paths...] [--force]
depvault untrack <paths...> [--yes]
depvault purge [paths...] [--dry-run] [--force]
depvault unlock
depvault lock
depvault project [--output table|json]
depvault config [set <key> <value> | get <key>]     # keys: server, output
depvault analyze [--file <path>] [--ecosystem] [--output table|json]
depvault scan [--path <dir>]
depvault doctor
depvault update
depvault version
```

File commands also accept `--project <id>` to override the project in `.depvault.json`.

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

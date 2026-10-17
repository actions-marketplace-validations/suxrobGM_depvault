# DepVault CLI Reference

The DepVault CLI is a .NET 10 command-line tool for git-like, end-to-end encrypted sync of a repository's secret files, plus dependency analysis. Every file is identified by its repo-relative path and stored as one client-encrypted blob; all encryption and decryption happen client-side and the server only ever sees ciphertext.

## Quick Install

```bash
# Linux / macOS
curl -fsSL https://get.depvault.com | bash

# Windows (PowerShell)
irm https://get.depvault.com | iex
```

The installer downloads the latest release binary and adds it to `~/.depvault/bin/`.

## Build from Source

Prerequisites: [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)

```bash
# Restore .NET local tools (includes Kiota for API client generation)
dotnet tool restore

# Build the CLI
cd apps/cli
dotnet build
```

### Publish (Native AOT)

```bash
# Publish a self-contained AOT binary
dotnet publish -c Release -r win-x64    # Windows
dotnet publish -c Release -r linux-x64  # Linux
dotnet publish -c Release -r osx-arm64  # macOS Apple Silicon
```

The compiled binary is in `apps/cli/bin/Release/net10.0/<rid>/publish/depvault`.

## Interactive Mode (REPL)

Run `depvault` with no arguments for an interactive session with a status line (folder, repo, account, vault state, linked project). Press `Tab` to autocomplete command names.

## Configuration

Per-machine state lives in `~/.depvault/` (override with `DEPVAULT_HOME`):

| File                 | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `config.json`        | API server URL, default output format                          |
| `credentials.json`   | Login tokens                                                   |
| `vault-session.json` | Remembered vault unlock (derived key, encrypted at rest)       |
| `sync/*.json`        | Last-synced path, version and keyed hash per file, per checkout |

```bash
depvault config set server https://depvault.example.com
depvault config set output json
```

The project is **per repo**, not a setting: `depvault init` writes `.depvault.json` at the repo root (commit it — it holds no secrets):

```json
{ "project": "<id>", "name": "my-web-app", "ignore": ["references/**", "/apps/api/appsettings.Development.json"] }
```

The folder containing it is the root all file paths are relative to. `ignore` globs are gitignore-like: `**` spans folders, `*`/`?` match within one segment, a pattern without `/` matches a file name at any depth, and a leading `/` anchors to the root.

## Authentication

```bash
depvault login                                  # browser device flow
depvault login --server https://api.example.com # self-hosted
depvault whoami
depvault logout
```

Create your account and encryption vault in the web dashboard first; `depvault doctor` checks every step and prints the next command.

## Vault Unlock / Lock

The first command that needs the vault asks for the vault password once and offers **Remember on this device for 30 days?** (default Yes). Only the derived key is stored (DPAPI on Windows, owner-only key file on macOS/Linux), never the password. There is no idle auto-lock.

```bash
depvault unlock   # unlock ahead of time
depvault lock     # forget it on this device
```

In non-interactive use as yourself, set `DEPVAULT_PASSWORD`.

## File Sync

A file is identified only by its repo-relative path and stored as one client-encrypted blob with full version history (author + message per version). Max 10 MB per file; executables (`.exe .sh .bat .cmd .ps1`) are rejected.

```bash
depvault init [--project <id>]                         # link the folder (pick/create a project)
depvault status [paths...]                             # modified / new / renamed / deleted / incoming / removed / conflict
depvault push [paths...] [-m <msg>] [--yes] [--force]  # upload local changes atomically
depvault pull [paths...] [--force]                     # apply server edits, moves, deletions
depvault untrack <paths...> [--yes]                    # delete from DepVault + add to ignore (local copy stays)
depvault purge [paths...] [--dry-run] [--force]        # delete local copies (pull restores them)
depvault project [--output json]                       # linked project + your projects
```

**Discovery.** New files are offered when they look like secrets **and** are git-ignored (checked per git repo, so submodules use their own `.gitignore`): `.env`, `.env.*`, `*.env`, `appsettings*.json`, `secrets.json/yaml/yml`, `credentials.json`, `google-services.json`, `GoogleService-Info.plist`, `*service-account*`/`firebase-adminsdk*` JSON, `local/key/keystore.properties`, `.npmrc`, `.pypirc`, `.netrc`, `.envrc`, `.dev.vars`, `*.pem *.key *.p8 *.p12 *.pfx *.jks *.keystore *.tfvars`. Templates (`.example .sample .template .dist .defaults .bak .orig`) and committed files are never offered. Track any other file by naming it: `depvault push path/to/file`.

**Change detection** is three-way — local file, server, and what this machine last synced — using keyed content hashes (HMAC under a key derived from the project DEK), so `status` downloads nothing. Renames are detected by identical content and keep history.

**Push** sends every selected change in one atomic, version-checked request. If someone else changed a file meanwhile the server answers 409 and nothing is saved — pull first. Interactively: a checklist (all preselected, Enter pushes); deletions are confirmed separately (default No). With `--yes`, deletions are skipped unless the exact path is named (`depvault push --yes apps/bot/.env`), so a wiped working tree can never empty the vault. Conflicts block the push unless `--force` (keeps your local version).

**Pull** never overwrites local changes. Conflicts are skipped (exit code 1) unless `--force` (takes the server copy). Files are written owner-only (`0600` on macOS/Linux).

## Dependency Analysis

```bash
depvault analyze                                  # discover dependency files, multi-select
depvault analyze --file package.json
depvault analyze --file deps.txt --ecosystem PYTHON
depvault scan                                     # deps + leaked secrets + secret files not yet in DepVault
```

Supported ecosystems: `NODEJS`, `PYTHON`, `DOTNET`, `RUST`, `GO`, `KOTLIN`, `JAVA`, `RUBY`, `PHP`. `scan` only reports; it never uploads.

## CI/CD

Create a CI token in the project's **Settings → CI/CD Tokens**. A token can be limited to path globs matched from the repo root (e.g. `deploy/**`, `apps/api/.env`, `**/.env` for any depth; empty = all files). Unlike `ignore` globs, a pattern without `/` matches only at the root and, on the Team plan, an IP allowlist. Format `dvci_<auth>.<key>`: the server only sees the auth part; the key part stays in the pipeline and unwraps the project DEK locally.

```bash
export DEPVAULT_TOKEN=dvci_abc123.xxxx
depvault pull                 # every file the token can read, written to its repo path
depvault pull deploy/.env     # restrict further
```

Files are written under the folder holding `.depvault.json` (or the current folder). CI tokens are read-only — `push`/`status` refuse.

## Output Formats

`project` and `analyze` support `--output table` (default) or `--output json`; `depvault config set output json` changes the default.

## Removed in the sync release

`depvault ci pull` (use `depvault pull` with `DEPVAULT_TOKEN`), `project select/create/info`, `config set project`, `--app`, `--environment`, `--include-base`, `--include-secrets`, `--output-dir`, `--format`, `unlock --remember/--no-remember/--ttl`, and scan's upload steps.

## Regenerating the API Client

When backend API endpoints change, regenerate the Kiota client:

```bash
# 1. Export the OpenAPI spec from the running backend
cd apps/backend
bun run export:openapi

# 2. Regenerate the client
cd ../..
dotnet kiota generate -l CSharp \
  -d apps/cli/openapi.json \
  -o apps/cli/ApiClient \
  -n DepVault.Cli.ApiClient \
  --exclude-backward-compatible
```

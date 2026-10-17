# Changelog

All notable changes to the DepVault CLI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **Breaking:** sign in again after upgrading. Stored logins are now bound to the server that issued them and are never sent to another one; `login --server` saves the URL only once login succeeds
- **Breaking:** the interactive REPL and `clear` are gone; bare `depvault` shows your folder, account, vault and project plus the command list, and `version` prints just the version
- **Breaking:** `--output json` and `config set output` are replaced by `--json` on `status`, `push`, `pull`, `log`, `project`, `analyze` and `scan`, printing one JSON document on stdout (the old JSON output failed in release builds)
- **Breaking:** `purge -y/--yes` only skips the prompt; deleting files with unpushed changes needs `--force`
- Fix teammates being unable to decrypt shared projects: keys granted through **Grant access** (ECDH) are now unwrapped
- Fix the CLI creating a second key for a project when a teammate hadn't been granted access yet; it now says to ask an Editor or Owner, and the server refuses such keys too
- Projects created from the CLI now also get a recovery grant, so the recovery key restores them after a forgotten password
- `pull` confirms before deleting local files that were removed from DepVault; with `--yes` or without a terminal it deletes only files named exactly
- Add `log`, `diff` and `restore` to browse a file's versions, compare them with the local file, and bring an old one back
- Add `--dry-run` to `push` and `pull`
- `scan` runs without a login (leaked-secret check only, e.g. in CI), takes `--fail-on <low|medium|high|critical>` (exit code 4) and `--json`, and shows detected secrets by their first four characters only
- `analyze` analyzes every discovered file when there's no terminal
- Consistent exit codes: 0 ok, 1 error, 2 usage, 3 conflict, 4 scan findings, 130 cancelled; failures that used to exit 0 now don't
- Errors and warnings go to stderr; `NO_COLOR` is honored; the update notice is skipped in CI and with `--json`
- `depvault update` verifies the download against the release's `SHA256SUMS` and supports linux-arm64; the installers and the GitHub Action verify checksums too

## [2.0.0] - 2026-10-16

- **Breaking:** git-like sync. A committed `.depvault.json` (project id + ignore globs) links a repo folder to its project, replacing apps/environments/file kinds and the global active project. Files are identified by repo-relative path only. **Existing server files and CI tokens were removed; re-run `init`, push again, and regenerate CI tokens**
- `init` links a folder; `status` shows modified / new / renamed / deleted / incoming / removed / conflict by comparing local, server and last sync with keyed content hashes (no downloads)
- `push` sends one atomic, version-checked batch; renames keep history; deletions need confirmation or an exact path; conflicts need `--force`
- `pull` applies server edits, moves and deletes without overwriting local changes unless `--force`; with `DEPVAULT_TOKEN` set it does the CI pull in a single request
- Add `untrack` (removes a file from DepVault and ignores it); `purge` now forgets the sync base so a later `pull` restores files
- CI tokens can be scoped to path globs, matched from the repo root
- Discovery offers only git-ignored, secret-looking files, per git repo (submodules included), and no longer skips `packages/` or `generated/`
- Unlock once per device: one prompt, remembered for 30 days by default, with no idle auto-lock
- Removed: `ci`, `project select/create/info`, `config project`, and scan uploads
- `DEPVAULT_HOME` overrides the config folder; failed commands now exit non-zero
- CI tokens in the old format without a dot are rejected locally with a hint to regenerate them, without a network call
- Faster sync: the server listing and local scan run concurrently, and the content-tag key is derived once per run

## [1.9.1] - 2026-07-11

- Stored credentials (`~/.depvault/credentials.json`) are now encrypted at rest — DPAPI on Windows, an owner-only AES-GCM key file on POSIX — instead of plaintext. **You must sign in again after upgrading**: plaintext credential files are no longer migrated, and the server-side session cutover requires a fresh login regardless
- Fix long-lived sessions dropping to the auth-error panel on a second token expiry: token refresh is now attempted once per request (not once per process) and re-reads credentials from disk first, so a rotation performed by a concurrent request or another `depvault` process is picked up instead of tripping the server's replay detection. CI-token 401s are returned as-is, since CI tokens aren't refreshable
- `login` now flows straight into the vault unlock prompt, so `push`/`pull` work without a second command
- `logout` now revokes the refresh session server-side before clearing local credentials
- `whoami` shows the auth panel when the session has expired, instead of a generic failure
- Fix signing in with GitHub from a CLI login link leaving the CLI polling forever — the OAuth round-trip now carries the device code back (server-side fix; no CLI upgrade needed)

## [1.9.0] - 2026-07-06

- Zero-knowledge CI tokens: `DEPVAULT_TOKEN` now has the form `dvci_<auth>.<key>` — the CLI sends only the auth part to the server and derives the decryption key from the key part locally, so the server can never unwrap your project key. **Existing CI tokens must be regenerated** in the web dashboard
- Add a `doctor` command that checks server reachability, login, vault setup, active project, and encryption key, printing the exact next command for anything not ready
- `project info` now accepts a positional `[id]` argument (e.g. `depvault project info <id>`) in addition to `--project`
- Clearer guidance: point to the dashboard vault-setup URL when the vault isn't initialized, and make the encryption-key error honest that the CLI attempts creation automatically
- Support Windows and Linux ARM64 CI runners: the GitHub Action installs on Windows runners, and `linux-arm64` binaries are now published

## [1.8.5] - 2026-06-25

- `unlock --remember [--ttl 7d]`: optionally persist the derived KEK (never the password) encrypted at rest — DPAPI on Windows, an owner-only AES-GCM key on POSIX — so the vault stays unlocked across invocations without retyping the password (default 7d, max 30d); `lock`/`logout` clear it
- Add a `purge` command: the inverse of `pull`, deleting previously pulled files from disk; previews and confirms (defaults to No), requires `--force` non-interactively, and supports `--dry-run`/`--no-prune`

## [1.8.4] - 2026-06-04

- Auto-switch the active project to the one matching the current repository (by remote URL, then name) when they diverge, instead of only printing a warning — supersedes the v1.8.2 mismatch warning, which now appears only when no project matches the repo
- Add a `clear` command (and REPL `clear`/`cls`) to clear the terminal screen

## [1.8.3] - 2026-06-03

- `push`: skip re-uploading a file whose contents haven't changed, so repeated pushes no longer create redundant version-history entries (the CLI now sends a keyed content hash the server uses to detect no-op pushes)

## [1.8.2] - 2026-06-03

- `project` create: default the new-project name to the current repo's directory and auto-fill the repository URL from `git remote origin`
- Warn when the active project doesn't match the current repository, giving an early signal to switch projects

## [1.8.1] - 2026-06-03

- Fix `scan` secret leak detection incorrectly flagging gitignored files: replace the custom gitignore parser with `git check-ignore --stdin` (the authoritative source), with the parser as a fallback when git is unavailable
- Fix `scan` falsely reporting localhost connection strings (e.g. `Host=localhost; Port=5432; ...`) as secret leaks — these are now treated as placeholder/example values

## [1.8.0] - 2026-06-03

- Unify config and secret files under one `RepoFile` model with a `kind` discriminator (`CONFIG` | `SECRET`), replacing the separate config-file/secret-file uploaders and pullers
- `push`: infer the owning App (nearest project-marker walk via `AppRootResolver`) and environment slug (filename pattern via `EnvSlugResolver`) automatically; show a manifest table before encrypting and prompt for confirmation
- `pull`: restore files byte-faithful to their repo-relative paths; show a restore manifest before decryption
- REPL: simplified line editor, status footer showing cwd/repo/project/vault lock, and interactive `config` command; removed tab autocompletion
- Drop the legacy `env` and `secrets` list commands (superseded by the unified file model)
- Clean-architecture refactor: injectable `IRepositoryLocator`, `IProjectContextResolver`, `IErrorHandler`, and `IFileArgResolver`; folders reorganized to match the static-vs-DI convention

## [1.7.0] - 2026-06-01

- Encrypt secret files client-side on `push` and upload as JSON — fixes 400 errors and closes a zero-knowledge plaintext leak
- `push`: aggregate stale-variable detection per vault to stop false "delete stale" prompts on first push
- `push`: map directories to vaults by path + name only (drop greedy tag-match that merged unrelated folders)
- `pull`: preserve blank lines between comment groups so `.env` files round-trip faithfully
- Cancel selection and multi-select prompts on Esc; pre-select all choices by default (`push` selects all discovered files — deselect to skip)
- Stale-variable deletion now defaults to No and is skipped in non-interactive mode
- `auth`: clear vault keys on logout and give clearer locked-vault guidance
- Update package references to latest versions

## [1.6.0] - 2026-04-22

- Flatten vault model: drop the vault-group / environment abstraction so each vault is a single flat keyset, and retarget pull/push to a vault directly instead of selecting a group + environment
- Replace the old `FileEnvironmentAssigner` / `DirectoryVaultGroupMapper` flow with a new directory-to-vault mapper that infers file-to-vault assignments from the directory structure on `push`
- Suggest tags on `push` via `TagSuggester` to help categorize imported variables
- Regenerate the Kiota API client against the flattened backend OpenAPI spec

## [1.5.6] - 2026-04-19

- Verify the derived KEK on `depvault unlock` and pull/push flows — a wrong vault password now fails immediately instead of silently producing a junk KEK that could corrupt new SELF grants
- Detect vault-salt rotation and invalidate the cached KEK when the vault password was changed from another client, re-prompting for the new password
- Add unit test suite covering CLI crypto primitives (AES-256-GCM, PBKDF2, HKDF), vault state lifecycle, and cross-platform interop vectors

## [1.5.5] - 2026-04-19

- Refactor env file parsing/serialization utilities and add unit test project for CLI

## [1.5.4] - 2026-04-19

- Initial tracked release.

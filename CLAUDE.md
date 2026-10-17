# DepVault Platform

Web dashboard that analyzes dependencies, detects vulnerabilities, and stores config + secret files across any stack (package.json, .env, appsettings.json).

Storage is **repo-native** and git-like: a Project is a repo, and a `RepoFile` is identified only by its repo-relative `path` (no apps, environments or file kinds). Each file is one client-encrypted blob (ciphertext + iv + authTag) with a `version` counter (optimistic concurrency) and full version history. A committed `.depvault.json` links a repo folder to its project; the CLI syncs with three-way change detection (local / server / last sync on this machine). All files are **end-to-end encrypted** client-side; the server is zero-knowledge.

## Tech Stack

- **Runtime**: Bun; **Backend**: Elysia.js; **DB**: PostgreSQL + Prisma 7; **DI**: tsyringe
- **Web**: Next.js 16.4 + MUI 9; **Forms**: `@tanstack/react-form` (`useAppForm`) + `zod/v4`
- **Tooling**: TypeScript 7 (docs stays on 6: Nextra twoslash needs the JS compiler API), Biome (lint + format), knip (dead code)
- **Docs**: Nextra 4
- **CLI**: .NET 10 (Native AOT) + Kiota-generated HTTP client
- **Shared**: `@depvault/shared` package in `packages/shared/`

## Layout

```text
apps/backend/    → Elysia REST API (port 4000)
apps/frontend/   → Next.js web app (port 4001)
apps/docs/       → Nextra documentation site (port 4002)
apps/cli/        → .NET 10 CLI (Native AOT)
packages/shared/ → Shared constants, utils, Eden API client types
packages/crypto/ → Shared WebCrypto primitives (frontend + CI token helpers)
```

## Commands

```bash
# Backend (cd apps/backend)
bun run dev / start / typecheck
bun test
bun run db:generate / db:migrate / db:migrate:apply
bun run build:types

# Web (cd apps/frontend)
bun run dev / build / start

# Docs (cd apps/docs)
bun run dev / build / start

# CLI (cd apps/cli)
dotnet build                                 # build CLI
dotnet publish -c Release -r win-x64         # AOT publish
bun run export:openapi                       # regenerate OpenAPI spec (from apps/backend)

# Root
bun run typecheck   # all workspaces
bun run check       # biome format + lint + organize imports (writes)
bun run ci          # biome check, fails on warnings (CI gate)
bun run knip        # unused files, exports, dependencies
```

## PRD & Design References

- **PRD**: `docs/prd.md`: user stories US-01 through US-10, sprint plan, acceptance criteria
- **UI Mockups**: `docs/ui-mockups.md`: ASCII wireframes for every screen

## Scrum & Workflow

- **Branch**: `<type>/<issue-number>-<short-description>`
- **Commit**: Conventional Commits `<type>(scope): <description>` with `Refs #<issue-number>`
- **Types**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`
- **Scopes**: `backend`, `frontend`, `shared`, `db`, `ci`
- **PRs**: branch from `main`; title follows commit convention; body has `## Summary`, `## Test plan`, `Closes #N`; squash merge after CI passes

## Code Style

- Don't add inline comments that restate what the code does. Only comment **why**.
- Add brief JSDoc for public functions
- Aim for ~300–350 LOC per file. Extract when a file grows past this.
- Don't use `any`. Use `unknown` and narrow, or define proper interfaces.
- Export only what another file imports. A barrel (`index.ts`) is justified only when it carries a folder's public API for several outside importers, and it uses named re-exports, never `export *`.
- Don't commit `.env` files or any file containing real secrets.

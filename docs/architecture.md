# Architecture Overview

## System Architecture

```text
                         ┌─────────────────────┐
                         │      Browser         │
                         └──────────┬───────────┘
                                    │ HTTPS
                         ┌──────────▼───────────┐
                         │   Nginx (reverse      │
                         │   proxy + TLS + gzip) │
                         └──┬───────────────┬────┘
                            │               │
                   /api/*   │               │  /*
                   /health  │               │  /_next/static
                            │               │
                 ┌──────────▼──┐    ┌───────▼──────────┐
                 │  Backend    │    │  Frontend         │
                 │  Elysia.js  │    │  Next.js 16       │
                 │  port 4000  │    │  port 4001        │
                 └──────┬──────┘    └──────────────────┘
                        │
              ┌─────────▼─────────┐
              │  PostgreSQL 18+   │
              │  (Prisma 7 ORM)   │
              └───────────────────┘
```

Nginx sits in front of both services on a single domain. Requests matching `/api/*` or `/health` are proxied to the Elysia backend. Everything else (pages, static assets) goes to the Next.js frontend. Auth endpoints (`/api/auth/session`, `/api/auth/accounts`, `/api/auth/password-resets`) are rate-limited at the Nginx layer (5 req/s with burst of 10).

---

## Monorepo Structure

```text
depvault/
├── apps/
│   ├── backend/         Elysia REST API (Bun runtime, port 4000)
│   ├── frontend/        Next.js 16 web app (MUI 9, port 4001)
│   └── cli/             .NET 10 Native AOT CLI
├── packages/
│   ├── shared/          Shared TypeScript types and utilities
│   └── crypto/          Shared WebCrypto primitives (content tags, CI token helpers)
├── deploy/
│   ├── depvault.conf       Nginx site configuration
│   └── docker-compose.yml  Production container orchestration
└── .github/workflows/
    ├── ci.yml           Lint, typecheck, test, build, secret scan
    └── deploy.yml       Build Docker images and deploy to VPS
```

**apps/backend** -- Elysia.js API server. Handles authentication, project management, dependency analysis, path-based repo file storage (one client-encrypted `RepoFile` blob per repo path, with versions), client-side encryption key management, share links, CI token management, secret scanning, and notifications. Uses Prisma 7 with PostgreSQL and Needle DI for dependency injection.

**apps/frontend** -- Next.js 16 App Router application. Uses React Server Components by default, MUI 9 for UI, TanStack Form + zod for form validation. TanStack Query for data fetching and caching. Auth state managed via React context with JWT stored in httpOnly cookies.

**apps/cli** -- .NET 10 command-line tool compiled with Native AOT and gzip compression. Provides terminal-based access to DepVault features including git-like file sync (`init`/`status`/`push`/`pull` with three-way change detection), dependency scanning, and CI/CD restores (`depvault pull` with a CI token). All encryption and decryption happen client-side. Produces a single self-contained native binary.

**packages/shared** -- TypeScript types and utility functions shared between backend and frontend. Published as `@depvault/shared` within the monorepo.

---

## Backend Module Pattern

Each feature module follows a consistent 3-file pattern with optional extras:

```text
modules/{feature}/
├── {feature}.controller.ts    Elysia route group (thin HTTP layer)
├── {feature}.service.ts       @injectable() class with business logic
├── {feature}.schema.ts        TypeBox (t.*) request/response schemas
├── {feature}.repository.ts    (optional) complex queries, raw SQL
├── {feature}.mapper.ts        (optional) Prisma model → API response
└── {feature}.service.test.ts  Unit tests with mocked Prisma
```

**Controller** -- Gets the service via `container.get(ServiceClass)` and delegates all work. Defines routes, applies TypeBox validation schemas, and returns responses. Controllers are registered as Elysia plugins in `src/app.ts`.

**Service** -- `@injectable()` class injected with `PrismaClient`. Contains all business logic, validation, error handling, and encryption/decryption. Throws typed HTTP errors (`NotFoundError`, `BadRequestError`, etc.) that the global error middleware maps to responses.

**Schema** -- TypeBox (`t.*`) definitions for request bodies, query parameters, path parameters, and response shapes. Type aliases are grouped at the end of the file.

### Registered Modules

All modules are mounted under the `/api` group in `src/app.ts`:

- `auth` -- registration, login, logout, refresh, GitHub OAuth, email verification, password reset
- `project` -- CRUD, list with pagination
- `repoFile` -- list file metadata, bulk download, get content, version history, and atomic versioned batch changes (create / update / move / delete)
- `vault` / `keyGrant` -- client-side encryption: UserVault setup/status, password change, recovery, and per-project DEK key grants (SELF / ECDH / RECOVERY)
- `shareLink` -- one-time link generation (any file) and public token access
- `user` -- profile management
- `auditLog` -- project and global activity log
- `analysis` -- dependency file upload, parsing, vulnerability scanning
- `githubApi` -- GitHub integration endpoints
- `notification` -- user notification management
- `secretScan` -- git repository secret scanning
- `scanPattern` -- detection pattern management
- `ciToken` / `ciAccess` -- CI/CD token generation (scoped to path globs) and a single-call blob fetch for pipelines
- `licenseRule` -- license policy configuration
- `subscription` -- plan and billing management
- `security` -- security dashboard overview

---

## Dependency Injection

DepVault uses **Needle DI** (`@needle-di/core`), with dependencies declared as `inject()` constructor defaults:

```text
┌─────────────┐       container.get()       ┌──────────────┐
│  Controller  │ ──────────────────────────► │   Service    │
└─────────────┘                              │@injectable() │
                                             └──────┬───────┘
                                                    │ constructor inject
                                             ┌──────▼───────┐
                                             │ PrismaClient  │
                                             └──────────────┘
```

- **PrismaClient** is bound to the shared client in `common/di/container.ts`
- **Services** are `@injectable()` (one instance per container) and declare dependencies as `constructor(private readonly prisma = inject(PrismaClient))`; tests skip the container and pass mocks to `new`
- **Repositories** (optional) are `@injectable()` classes containing complex Prisma queries
- **Controllers** call `container.get(ServiceClass)` to obtain service instances

---

## Database Schema

The database uses PostgreSQL with Prisma 7 (multi-file schema in `apps/backend/prisma/schema/`). All models use UUID primary keys, `createdAt`, and `updatedAt` timestamps.

### Entity Relationship Overview

```text
User ──────────┬──── Account (auth providers: EMAIL, GITHUB)
               │
               ├──── UserVault (KEK salt, ECDH keypair, wrapped recovery key)
               ├──── ProjectKeyGrant (wrapped DEK per project; SELF / ECDH / RECOVERY)
               │
               ├──── Project (owner)  ── a repo
               │       ├──── ProjectMember (OWNER / EDITOR / VIEWER)
               │       ├──── RepoFile (encrypted blob, unique repo path, version)
               │       │       └──── RepoFileVersion (author + message per version)
               │       ├──── CiToken (path globs, IP allowlist, wrapped DEK)
               │       ├──── Analysis
               │       │       └──── Dependency (self-referencing tree)
               │       │               └──── Vulnerability
               │       ├──── ShareLink
               │       ├──── AuditLog
               │       ├──── LicenseRule
               │       ├──── ScanPattern
               │       ├──── SecretScan
               │       │       └──── SecretDetection
               │       └──── SecretDetection
               │
               ├──── Notification
               └──── AuditLog
```

### Key Models

| Model               | Purpose                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **User**            | Email/password or GitHub OAuth accounts, soft-deletable                                                                                                                                                                                                                                    |
| **Account**         | Auth provider link (EMAIL or GITHUB) with refresh token family                                                                                                                                                                                                                             |
| **Project**         | Top-level container owned by a user; maps to a repo                                                                                                                                                                                                                                        |
| **ProjectMember**   | Role-based membership (OWNER, EDITOR, VIEWER)                                                                                                                                                                                                                                              |
| **RepoFile**        | One client-encrypted blob per `(projectId, path)`: `encryptedContent` (Bytes) + `iv` + `authTag`, a keyed `contentHash`, and a `version` that increments on every write and serves as the optimistic-concurrency token |
| **RepoFileVersion** | Immutable snapshot of every version (including the current one) with its path, blob, hash, author, and optional message; restore re-sends an old blob as a new version |
| **UserVault**       | Per-user crypto root: KEK salt + iterations, ECDH public key, wrapped private key, recovery key hash + wrapped recovery key                                                                                                                                                                |
| **ProjectKeyGrant** | Wrapped project DEK per user, unique per `(projectId, userId, grantType)`; grant type SELF / ECDH / RECOVERY                                                                                                                                                                               |
| **ShareLink**       | One-time encrypted share link for a file (PENDING / VIEWED / EXPIRED)                                                                                                                                                                                                                      |
| **Analysis**        | Dependency analysis run for a specific file and ecosystem                                                                                                                                                                                                                                  |
| **Dependency**      | Parsed package with version info, self-referencing tree for transitive deps                                                                                                                                                                                                                |
| **Vulnerability**   | CVE record linked to a dependency (NONE through CRITICAL severity)                                                                                                                                                                                                                         |
| **LicenseRule**     | Per-project license policy (ALLOW / WARN / BLOCK)                                                                                                                                                                                                                                          |
| **AuditLog**        | Append-only log of file-related actions with IP address; resource type REPO_FILE / SHARE_LINK / CI_TOKEN                                                                                                                                                                                   |
| **CiToken**         | Read-only CI/CD token: SHA-256 of the auth part, `paths` globs (empty = all files), optional IP allowlist, expiry, and the DEK wrapped under HKDF(key part) |
| **ScanPattern**     | Regex pattern for git secret detection (built-in or custom)                                                                                                                                                                                                                                |
| **SecretScan**      | Git repository scan run with status tracking                                                                                                                                                                                                                                               |
| **SecretDetection** | Individual secret found in a commit (OPEN / RESOLVED / FALSE_POSITIVE)                                                                                                                                                                                                                     |
| **Notification**    | User notification for various event types                                                                                                                                                                                                                                                  |

---

## Authentication Flow

```text
                     Register                        Login
                        │                              │
                        ▼                              ▼
              Create User + Account          Verify email + password
              Send verification email               │
                        │                              ▼
                        ▼                     Issue JWT access token
              Click email link                (1 day expiry, httpOnly cookie)
              Set emailVerified=true           + refresh token (7 day expiry)
                        │                              │
                        ▼                              ▼
                   Redirect to login           Authenticated requests
                                                       │
                                                       ▼
                                              Token expired? ──► PUT /api/auth/session
                                                                  Rotate refresh token
                                                                  Issue new access token
```

- **Access tokens** expire in 15 minutes and are stored in httpOnly cookies
- **Refresh tokens** expire in 7 days with rotation on every use (old token invalidated)
- **GitHub OAuth** creates or links an account and follows the same JWT flow after callback
- **Auth guard** is an Elysia `derive({ as: "scoped" })` plugin that verifies the JWT and injects a typed `user` object into the request context
- **Role guard** chains the auth guard and checks `user.role` for admin-level access

---

## Encryption Design

DepVault is **zero-knowledge**: every file is encrypted client-side with AES-256-GCM before it reaches the server, which stores and returns only ciphertext. There is no master key and no server-side decryption.

```text
              Vault password (never sent to server)
                          │
                          ▼
        PBKDF2-SHA256 (600k iters, per-user salt)
                          │
                          ▼
                   KEK (Key Encryption Key)
                          │
         ┌────────────────┼────────────────┐
         │                │                │
   wraps ECDH        wraps recovery   wraps per-project DEK
   private key       key (UserVault)   via SELF grant
                                            │
                                            ▼
                         one AES-256 DEK per project
                                            │
                                            ▼
                 encrypt/decrypt whole file blobs
                          (client-side only)
                          │
                          ▼
              ┌───────────┼───────────┐
         encryptedContent    iv       authTag
          (Bytes / base64)  (Base64)  (Base64)
              └───────────┼───────────┘
                          ▼
            Server persists ciphertext verbatim
```

- **Key hierarchy**: vault password → PBKDF2-SHA256 KEK → wraps one project DEK per project. The DEK is wrapped per user as a `ProjectKeyGrant`: SELF (KEK), ECDH P-256 (team sharing), or RECOVERY (recovery key).
- Each encrypted file stores three values: `encryptedContent`, `iv`, and `authTag`; every version snapshot stores the same triple.
- Each version also carries a keyed `contentHash` (HMAC-SHA256 under HKDF(DEK)), so clients detect modified and renamed files from metadata alone; the server can't compute or invert it.
- The vault password and KEK never leave the client. The web app, CLI, and CI pipelines all decrypt locally; CI tokens carry a DEK wrapped for an HKDF-derived token key.
- The server never sees plaintext file content: not in logs, error messages, stack traces, or database columns.
- The crypto "vault" (UserVault, vault password, unlock/lock) is the key-management layer only; it is distinct from the file storage model described above.

---

## API Design

- **Protocol**: RESTful HTTP with JSON request/response bodies
- **Base path**: All endpoints are grouped under `/api`
- **Validation**: Every endpoint uses TypeBox (`t.*`) schemas for request and response validation via Elysia's built-in type system
- **Error handling**: Services throw typed HTTP errors (`NotFoundError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`) which the global error middleware converts to consistent JSON error responses
- **Swagger**: Auto-generated OpenAPI docs available at `/api/swagger`
- **Health check**: `GET /health` returns `{ status: "ok", timestamp: "..." }` (not behind auth guard)
- **CORS**: Configured via the `CORS_ORIGINS` environment variable
- **File transfer**: Files are sent as already-encrypted base64 blobs in JSON request/response bodies (not multipart); the client encrypts before upload and decrypts after download. Nginx allows a 50 MB body; files are capped at 10 MB each at the application level, and executables (`.exe .sh .bat .cmd .ps1`) are rejected
- **Writes**: all file changes go through `POST /api/projects/:id/files/changes`, an atomic batch where each change carries the `baseVersion` it was based on; a stale version fails the whole batch with 409

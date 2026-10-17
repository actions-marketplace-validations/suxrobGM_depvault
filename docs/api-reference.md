# API Reference

## Live Documentation

Interactive Swagger UI is available at: **[https://depvault.com/api/swagger](https://depvault.com/api/swagger)**

The Swagger docs are auto-generated from TypeBox schemas and reflect every endpoint, request body, query parameter, and response shape. Use Swagger for the full endpoint catalog.

---

## Authentication

DepVault uses JWT-based authentication with httpOnly cookies.

**Flow:**

1. Register or log in via `/api/auth/register` or `/api/auth/login`
2. The server sets a JWT access token (1 day expiry) and a refresh token (7 day expiry) as httpOnly cookies
3. All subsequent requests include the cookies automatically
4. When the access token expires, the client calls `/api/auth/refresh` to obtain a new token pair (the old refresh token is invalidated)

---

## API Groups Overview

The REST API is organized into the following groups under the `/api` prefix:

| Group                  | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**               | Registration, login, logout, token refresh, GitHub OAuth, email verification, password reset                                             |
| **Projects**           | CRUD operations for projects (a project maps to a repo)                                                                                  |
| **Members**            | Invite, update roles, and remove team members within a project                                                                           |
| **Files**              | List, download, version history, and atomic batch changes for client-encrypted file blobs (identified by repo path)                     |
| **Vault**              | Client-side encryption: UserVault setup/status, password change, recovery                                                                |
| **Key Grants**         | Per-project wrapped DEK grants (SELF / ECDH / RECOVERY)                                                                                  |
| **Share Links**        | Generate encrypted one-time share links for a file (create / list / revoke)                                                              |
| **Public Shares**      | Recipient-facing endpoints to access and consume one-time links                                                                          |
| **Analysis**           | Upload dependency files, run vulnerability scans, view results                                                                           |
| **Security Dashboard** | Aggregated security overview (vulnerabilities, scan results, file freshness)                                                             |
| **Secret Scan**        | Git repository scanning for leaked secrets                                                                                               |
| **Scan Patterns**      | Manage regex patterns (built-in + custom) for secret detection                                                                           |
| **CI Tokens**          | Generate and manage read-only CI/CD tokens scoped to path globs                                                                          |
| **CI Access**          | One endpoint for pipelines to fetch the wrapped key and allowed encrypted files                                                         |
| **License Rules**      | Configure per-project license compliance policies (allow/warn/block)                                                                     |
| **Subscription**       | Plan limits, usage, and billing management                                                                                               |
| **Audit Log**          | Append-only log of file-related operations                                                                                               |
| **Notifications**      | User notification listing and management                                                                                                 |
| **Users**              | Profile management (name, avatar, password)                                                                                              |
| **GitHub API**         | List repos and browse repository file trees                                                                                              |

---

## File Storage Endpoints

A project is one repo; a `RepoFile` is one client-encrypted blob identified by its repo-relative `path` (unique per project). There are no apps, environments, or file kinds. Every write bumps the file's `version`, which doubles as the optimistic-concurrency token, and is recorded as a `RepoFileVersion` with its author and optional message. The server only ever stores and returns ciphertext as base64 (`encryptedContent` + `iv` + `authTag`) plus a keyed `contentHash` (HMAC under a key derived from the project DEK) that lets clients detect changes and renames without downloading content. Max 10 MB per file; executables (`.exe .sh .bat .cmd .ps1`) are rejected. See Swagger for full schemas.

### Files

| Method | Path                                                 | Description                                                                                         |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/projects/:id/files`                            | Metadata of every file, sorted by path (incl. `version`, `contentHash`, size). No blobs              |
| `POST` | `/api/projects/:id/files/download`                   | Ciphertext of several files in one request: `{ fileIds }`. Unknown ids are skipped                  |
| `GET`  | `/api/projects/:id/files/:fileId`                    | One file's ciphertext + crypto params                                                               |
| `GET`  | `/api/projects/:id/files/:fileId/versions`           | Version history, newest first (the first item is current); each with author and message             |
| `GET`  | `/api/projects/:id/files/:fileId/versions/:version`  | One version's ciphertext (for diff / restore)                                                       |
| `POST` | `/api/projects/:id/files/changes`                    | Atomic batch of creates, updates, moves, and deletes (OWNER / EDITOR). See below                    |

**`POST /files/changes`** body:

```json
{
  "message": "rotate bot token",
  "changes": [
    { "path": "apps/bot/.env", "content": { "encryptedContent": "…", "iv": "…", "authTag": "…", "contentHash": "…", "fileSize": 312 } },
    { "fileId": "…", "baseVersion": 4, "content": { "…": "…" } },
    { "fileId": "…", "baseVersion": 2, "path": "certs/local.pem" },
    { "fileId": "…", "baseVersion": 7, "delete": true }
  ]
}
```

- **Create**: `path` + `content`, no `fileId`. **Update / move**: `fileId` + `baseVersion` + new `content` and/or `path`. **Delete**: `fileId` + `baseVersion` + `delete: true`.
- If any file's current version differs from its `baseVersion`, nothing is applied and the server returns **409**.
- **Restore** is not a separate endpoint: fetch an old version and send its blob back as an update.
- Response: `{ files, deletedIds }`.

### Share Links

One-time encrypted file sharing. The decryption key travels in the URL fragment and never reaches the server; the encrypted payload is destroyed after the first read or at expiry. The public page lives at `/s/:token`.

| Method   | Path                                | Description                                                                   |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `POST`   | `/api/projects/:id/shares`          | Create a one-time share link for a file (optional password, expiry)           |
| `GET`    | `/api/projects/:id/shares`          | List a project's share links with status (PENDING / VIEWED / EXPIRED)         |
| `DELETE` | `/api/projects/:id/shares/:shareId` | Revoke a share link                                                           |
| `GET`    | `/api/shares/:token/info`           | Public: fetch share metadata (expiry, password requirement) without consuming |
| `POST`   | `/api/shares/:token`                | Public: consume the link and return the encrypted payload (one-time)          |

### CI/CD

| Method   | Path                                   | Description                                                                                                        |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/api/projects/:id/ci-tokens`          | Create a token: `{ name, paths?, expiresIn, ipAllowlist?, tokenHash, tokenPrefix, wrappedDek* }` (JWT, EDITOR+)   |
| `GET`    | `/api/projects/:id/ci-tokens`          | List a project's CI tokens (JWT)                                                                                   |
| `DELETE` | `/api/projects/:id/ci-tokens/:tokenId` | Revoke a CI token (JWT, EDITOR+)                                                                                   |
| `GET`    | `/api/ci/files`                        | CI-token auth (`Bearer dvci_<auth>`): the token-wrapped DEK and the ciphertext of every file the token may read, in one response |

`paths` are globs over repo paths, matched from the repo root (e.g. `deploy/**`, `apps/api/.env`, `**/.env` for any depth); empty means all files. The token is generated client-side; the server stores only SHA-256 of the auth part and a DEK wrapped under HKDF(key part), so it can't decrypt anything. CI tokens are read-only.

---

## Error Responses

All error responses follow a consistent shape:

```json
{
  "error": "Not Found",
  "message": "Project not found",
  "statusCode": 404
}
```

Common status codes:

- **400** Bad Request -- validation error or malformed input
- **401** Unauthorized -- missing or expired JWT
- **403** Forbidden -- insufficient role for the requested action
- **404** Not Found -- resource does not exist
- **409** Conflict -- duplicate resource (e.g., member already invited) or a stale `baseVersion` in a file change batch
- **429** Too Many Requests -- rate limit exceeded (auth endpoints)

---

## Rate Limiting

Auth endpoints are rate-limited at the Nginx layer:

- Login, register, password reset: 5 requests/second with burst of 10

Secret access and share link endpoints have additional application-level rate limiting.

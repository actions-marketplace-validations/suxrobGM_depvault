---
description: Database conventions for Prisma schema and queries
paths: [apps/backend/prisma/**, apps/backend/src/**]
---

# Database Conventions

## Schema

- **ORM**: Prisma 7 with PostgreSQL driver adapter (`@prisma/adapter-pg`)
- **Schema location**: `apps/backend/prisma/schema/` (multi-file via `prismaSchemaFolder`)

## Model Rules

- **IDs**: UUID for all primary keys
- **Money**: `Decimal(12,2)` for prices, `Decimal(14,2)` for balances/totals
- **Deletes are hard**: no soft-delete columns. Authorship of shared work (`RepoFile.createdBy`, `Analysis.userId`, `SecretScan.triggeredById`, audit `userId`) is nullable with `onDelete: SetNull`, so deleting an account keeps other people's projects intact
- **Timestamps**: every model must have `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`

## Storage Models (repo-native)

Hierarchy: `Project` (a repo) → `RepoFile`. Files are whole encrypted blobs, not per-variable rows; there are no apps, environments or file kinds — the path says it all.

- `RepoFile` — one blob per `(projectId, path)`; `path` is canonical (forward slashes, no `.`/`..`/empty segments, validated server-side). `version` increments on every write (content change or move) and is the optimistic-concurrency token (`baseVersion` in `/files/changes`; stale → 409 for the whole batch). `contentHash` is the client's keyed HMAC (required). A move updates `path` on the same row, keeping history
- `RepoFileVersion` — one row per version **including the current one**, holding that version's blob, path, author (`changedBy`) and message. Restore = a normal change re-sending an old version's blob

## Encryption Models

- `UserVault` — KEK salt, ECDH public key, wrapped private key, recovery key hash
- `ProjectKeyGrant` — wrapped DEK per user per project; grant type `SELF` | `ECDH` | `RECOVERY`
- `CiToken` — optional `paths` globs (empty = whole project) and `ipAllowlist` (TEAM plan); carries `wrappedDek`/`wrappedDekIv`/`wrappedDekTag` (required) for CI decryption. Revoking deletes the row
- `ShareLink` — one-time encrypted share; auto-expires/consumes on access (ephemeral key in URL fragment, never sent to server)
- `encryptedContent`/`iv`/`authTag` fields store client ciphertext as-is

## Workflow

```bash
bun run db:generate       # After schema edits — regenerate client
bun run db:migrate        # Create migration file
bun run db:migrate:apply  # Apply pending migrations
```

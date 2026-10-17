---
description: End-to-end encryption architecture and security rules
---

# End-to-End Encryption

All files (`RepoFile`) are encrypted client-side and stored as one ciphertext blob per file. The server stores only ciphertext and never decrypts.

## Key Hierarchy

```text
Vault Password (user-memorized, never sent to server)
  → PBKDF2-SHA256 (600k iterations) → KEK (Key Encryption Key)
    → wraps ECDH P-256 private key (team sharing)
    → wraps recovery key (stored in UserVault)
    → wraps per-project DEKs via SELF grants
      → AES-256-GCM encrypt/decrypt of secrets

Recovery Key (random 256-bit, shown once at vault setup)
  → wrapped by KEK, stored in UserVault
  → independently wraps each project DEK via RECOVERY grants
  → used to restore vault access when password is forgotten
```

## Key Files

| Layer    | File                                                                                | Purpose                                                                                                         |
| -------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Frontend | `apps/frontend/src/lib/crypto/`                                                     | WebCrypto modules: encoding, keys, AES-GCM, ECDH, etc.                                                          |
| Frontend | `apps/frontend/src/lib/crypto/vault-*.ts`                                           | Vault operations: lifecycle, grants, re-keying                                                                  |
| Frontend | `apps/frontend/src/providers/vault-provider.tsx`                                    | Vault state, DEK caching, key distribution                                                                      |
| Frontend | `apps/frontend/src/hooks/use-vault.ts`                                              | `useVault()` hook for components                                                                                |
| Backend  | `apps/backend/src/modules/vault/`                                                   | Vault API: setup, status, password, recovery, key grants                                                        |
| Backend  | `apps/backend/prisma/schema/vault.prisma`                                           | Crypto models only: `UserVault` + `ProjectKeyGrant`                                                             |
| Backend  | `apps/backend/prisma/schema/repo-file.prisma`                                       | `RepoFile`/`RepoFileVersion` (encrypted blobs keyed by `(projectId, path)`; `version` + keyed `contentHash`)    |
| Backend  | `apps/backend/prisma/schema/share-link.prisma`                                      | `ShareLink` (one-time encrypted file shares)                                                                    |
| CLI      | `apps/cli/Crypto/Core/VaultCrypto.cs`                                               | .NET AES-256-GCM, PBKDF2, HKDF, `ComputeContentTag`                                                             |
| CLI      | `apps/cli/Crypto/Vault/DekService.cs`                                               | Unwraps a user's SELF or ECDH grant (adopting ECDH as SELF + RECOVERY); creates a project's first DEK      |
| CLI      | `apps/cli/Services/Sync/SyncService.cs`, `SyncPlanner.cs`                           | Three-way sync plan (keyed hashes, no downloads) and version-checked push/pull of whole-file blobs              |
| CLI      | `apps/cli/Services/Sync/CiPuller.cs`                                                | CI pull: one `/ci/files` call → unwrap DEK with the token key part → decrypt and write                          |
| Shared   | `packages/crypto/src/content-tag.ts`                                                | `computeContentTag` (HMAC under HKDF(DEK)) — must match the CLI's `ComputeContentTag`                           |
| CLI      | `apps/cli/Common/CiTokenFormat.cs`                                                  | Splits `dvci_<auth>.<key>` into the Bearer part (server) and key material (local HKDF)                          |
| Shared   | `packages/crypto/src/ci.ts`                                                         | `generateCiToken`/`hashCiBearerToken`/`deriveCIWrapKey` for the split-token model                               |

## Data Flows

- **Repo files**: client encrypts whole file → sends base64 `{encryptedContent, iv, authTag}` + keyed `contentHash` in an atomic `/files/changes` batch with each file's `baseVersion` → backend stores blob as-is (no variable parsing) and writes a `RepoFileVersion` row holding the new state. `contentHash` = HMAC-SHA256 under HKDF(DEK, "depvault-content-tag"): lets clients detect changes and renames from metadata without the server learning anything
- **Share links**: ephemeral key, passed in the URL fragment (`#<base64url key>`), never reaches the server; `encryptForShare` in `packages/crypto/src/sharing.ts`
- **CI tokens**: split token `dvci_<auth>.<key>` generated client-side. Server stores only SHA-256(`dvci_<auth>`) + the DEK wrapped under HKDF(key part) — it never sees the key part and cannot unwrap the DEK. CLI sends only the auth part as Bearer (`CiTokenFormat.Split`), derives the wrap key from the key part locally. Helpers in `packages/crypto/src/ci.ts` (`generateCiToken`/`hashCiBearerToken`/`deriveCIWrapKey`). `paths` globs limit which files `/ci/files` returns — enforced server-side only, since the wrapped key is the project DEK
- **Own grants**: a member's SELF + RECOVERY grants are always written together via `PUT /projects/:id/keygrants/my` (one transaction, project row locked): a project's first key, or adopting a shared key. The server refuses a new key (409) from a member when others already hold one
- **Team sharing**: ECDH P-256 agreement → granter wraps DEK with shared secret (`POST /projects/:id/keygrants`, EDITOR+; the server fills `granterPublicKey` from the granter's vault) → recipient unwraps (web app and CLI) and adopts it as own grants, dropping the ECDH grant. ECDH is a delivery step only: it dies with the recipient's keypair. Removing a member deletes their grants and CI tokens but can't revoke a DEK they already saw; there is no project re-key
- **Recovery**: the client proves the recovery key with its SHA-256 (`recoveryKeyHash`, never returned by `/vault/status`) → unwraps all RECOVERY grants → SELF grants under the new KEK and a new keypair; ECDH grants are deleted. Re-key batches must cover exactly the grants they replace (else 409)
- **Password change**: the current password is re-verified client-side, then all SELF grants, the private key and the recovery key are re-wrapped under the new KEK
- **Recovery key regeneration**: one RECOVERY grant per SELF grant, under the new recovery key

## Security Rules

- Backend must **never** encrypt or decrypt user secrets
- Vault password never leaves the client; KEK derived locally via PBKDF2
- Project DEKs wrapped per-user: SELF grant (KEK), RECOVERY grant (recovery key), or ECDH grant (shared secret)
- Recovery key is wrapped with KEK and stored in UserVault — never stored in plaintext
- One-time share links use ephemeral keys in URL fragments; the server never sees the decryption key
- Never log decrypted secret values

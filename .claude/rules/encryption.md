---
description: End-to-end encryption architecture and security rules
---

# End-to-End Encryption

All files (`RepoFile`, both `kind`s) are encrypted client-side and stored as one ciphertext blob per file. The server stores only ciphertext and never decrypts.

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
| Backend  | `apps/backend/prisma/schema/app.prisma`                                             | `App` (service root, keyed by `appPath`)                                                                        |
| Backend  | `apps/backend/prisma/schema/repo-file.prisma`                                       | `RepoFile`/`RepoFileVersion` (encrypted blobs; `kind` = CONFIG \| SECRET; keyed by `(projectId, relativePath)`) |
| Backend  | `apps/backend/prisma/schema/share-link.prisma`                                      | `ShareLink` (one-time encrypted file shares)                                                                    |
| CLI      | `apps/cli/Crypto/VaultCrypto.cs`                                                    | .NET AES-256-GCM, PBKDF2, HKDF                                                                                  |
| CLI      | `apps/cli/Crypto/DekService.cs`                                                     | Resolves project DEK for pull/push (vault password or CI token)                                                 |
| CLI      | `apps/cli/Services/RepoFileUploadService.cs`, `apps/cli/Services/RepoFilePuller.cs` | `RepoFileUploadService` (push), `RepoFilePuller` (pull) — whole-file blobs, `kind`-aware                        |
| CLI      | `apps/cli/Services/AppRootResolver.cs`, `EnvSlugResolver.cs`                        | Infer owning App (project-marker walk) and environment slug (filename)                                          |
| CLI      | `apps/cli/Common/CiTokenFormat.cs`                                                  | Splits `dvci_<auth>.<key>` into the Bearer part (server) and key material (local HKDF)                          |
| Shared   | `packages/crypto/src/ci.ts`                                                         | `generateCiToken`/`hashCiBearerToken`/`deriveCIWrapKey` for the split-token model                               |

## Data Flows

- **Repo files**: client encrypts whole file → sends base64 `{encryptedContent, iv, authTag}` + `kind` → backend stores blob as-is (no variable parsing). Each push/save snapshots a `RepoFileVersion`
- **Share links**: ephemeral key, passed in URL fragment (`#key=`), never reaches the server
- **CI tokens**: split token `dvci_<auth>.<key>` generated client-side. Server stores only SHA-256(`dvci_<auth>`) + the DEK wrapped under HKDF(key part) — it never sees the key part and cannot unwrap the DEK. CLI sends only the auth part as Bearer (`CiTokenFormat.Split`), derives the wrap key from the key part locally. Helpers in `packages/crypto/src/ci.ts` (`generateCiToken`/`hashCiBearerToken`/`deriveCIWrapKey`). Tokens carry `tokenVersion`; v1 (pre-split, server-recoverable) are rejected at validation
- **Team sharing**: ECDH P-256 agreement → granter wraps DEK with shared secret → recipient unwraps
- **Recovery**: recovery key unwraps all RECOVERY grants → re-wraps DEKs under new KEK
- **Password change**: re-wraps all SELF grants (DEKs + private key + recovery key) under new KEK

## Security Rules

- Backend must **never** encrypt or decrypt user secrets
- Vault password never leaves the client; KEK derived locally via PBKDF2
- Project DEKs wrapped per-user: SELF grant (KEK), RECOVERY grant (recovery key), or ECDH grant (shared secret)
- Recovery key is wrapped with KEK and stored in UserVault — never stored in plaintext
- One-time share links use ephemeral keys in URL fragments; the server never sees the decryption key
- Never log decrypted secret values

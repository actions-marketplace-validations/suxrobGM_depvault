---
description: API client setup and auth architecture
paths: [apps/frontend/src/**]
---

# API Client & Auth

## API Clients

The API access layer lives in `src/api/`: client, server, query keys, the React Query hook wrappers (`@/api/hooks`), and backend response DTO types (`api/types/`). Import files directly (`@/api/client`, `@/api/query-keys`); only `hooks/` is a barrel.

- **Client** (`src/api/client.ts`): Eden Treaty via `createApiClient()` from `@depvault/shared/api`, `credentials: "include"` for cookie auth.
- **Server** (`src/api/server.ts`): reads + forwards cookies from `next/headers`. No `server-only` directive. It is server-only: import via `@/api/server` from Server Components only

## Auth Flow

- Backend sets httpOnly cookies (`access_token`, `refresh_token`) on login/register/refresh/github-callback; frontend sends them via `credentials: "include"`
- Backend auth middleware checks `Authorization` header first, then falls back to `cookie.access_token`
- Logout is a POST that clears cookies

## Auth Provider

- The auth module lives in `src/auth/` (barrel `@/auth`): `auth-provider.tsx`, `use-auth.ts`, and server actions in `actions.ts`
- `auth-provider.tsx` manages user state with SSR hydration via `initialUser` (dashboard layout fetches user server-side)
- `useAuth()` (`src/auth/use-auth.ts`) uses React 19 `use(AuthContext)`
- Server actions (`src/auth/actions.ts`, `"use server"`) are **excluded from the `@/auth` barrel**; import directly via `@/auth/actions`

## Vault Provider

- `vault-provider.tsx` manages vault state: unlock/lock/setup, DEK cache per project. KEK/DEK/private key held in `useRef` (not state) to avoid serialization; cleared on explicit lock/logout; no idle auto-lock ("unlock once per device", remembered 30 days by default)
- Dashboard layout wraps content in `<VaultProvider>` (inside `<AuthProvider>`)
- `useVault()` (`hooks/use-vault.ts`): use for all encryption. `vaultStatus` is `loading | error | no-vault | locked | unlocked` (`retryVaultStatus` after `error`). Methods: `unlockVault`, `setupVault`, `getProjectDEK` (caches the in-flight lookup), `initializeProjectKeys`, `grantProjectKeyToMember`
- API calls unwrap through `expectOk` (`api/request.ts`), which throws `ApiRequestError` carrying the HTTP status; `useApiQuery`/`useApiMutation` and `lib/crypto/*` all use it, so a rejected key write always throws

## Type Inference & Fetching

- Run `bun run build:types` in `apps/backend/` to emit declarations in `dist/`. `@elysiajs/eden` must be a frontend devDependency; `@depvault/shared` is a `workspace:*` dep
- Never call `fetch` directly in components. Use the Eden Treaty client through `useApiQuery` / `useApiMutation` (React Query wrappers in `src/api/hooks/`)

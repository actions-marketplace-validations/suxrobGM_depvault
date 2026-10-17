---
description: Frontend code conventions and patterns
paths: [apps/frontend/src/**]
---

# Frontend Conventions

## Folder Structure

```text
src/
├── api/                 # API access layer (barrel @/api)
│   ├── client.ts        # Eden Treaty client ("use client")
│   ├── server.ts        # Server client — next/headers (import directly, NOT via barrel)
│   ├── query-keys.ts    # React Query key factory
│   ├── hooks/           # useApiQuery / useApiMutation (React Query wrappers)
│   └── types/           # Backend response DTO types (barrel @/api/types)
├── app/                 # Next.js App Router pages
│   ├── (auth)/          # Auth pages (login, register, reset-password)
│   ├── (dashboard)/     # Authenticated pages (projects, analysis, vault)
│   └── layout.tsx       # Root layout with theme provider
├── auth/                # Auth module (barrel @/auth): provider, useAuth, actions
├── components/
│   ├── ui/              # Generic components (buttons, modals, forms)
│   └── features/        # Feature-specific components
│       └── vault/       # Vault setup, unlock, recovery dialogs
├── hooks/               # Cross-cutting React hooks (use-vault, use-toast, use-confirm)
├── lib/                 # Utils, constants, crypto
│   └── crypto/          # WebCrypto E2E encryption modules
├── providers/           # React context providers (theme, query, vault, notification)
└── types/               # Frontend-specific TypeScript types (non-API)
```

## Naming & Exports

- **Kebab-case** filenames only (`app-shell.tsx`, `use-auth.ts`) — no PascalCase
- **Named exports** for components/hooks/providers; **default exports** only for `page.tsx`/`layout.tsx`
- **Barrels**: only where a folder carries a public API for several outside importers (`@/api/hooks`, `@/auth`, `@/components/ui/*`, a few feature folders), always with named re-exports — never `export *`. Otherwise import the file directly. Siblings import relatively (`./file-editor`). Server-only entries stay out of barrels: `@/api/server` (uses `next/headers`) and `@/auth/actions` (`"use server"`). `bun run knip` enforces this
- Path alias `"@/*": ["./src/*"]` — import with `@/`, never `src/`

## Server Components by Default

Under `cacheComponents` + `partialPrefetching`, read `params` / `searchParams` / `useSearchParams()` inside a `<Suspense>` child, not at the top of a page, so the route keeps one shared App Shell.

- **Never** add `"use client"` to `page.tsx` / `layout.tsx`
- Extract interactive logic into `"use client"` feature components under `src/components/features/`

## Component Props

Destructure inside the function body, not in parameters:

```typescript
function Sidebar(props: SidebarProps): ReactElement {
  const { open, onToggle } = props;
  const handleToggle = () => onToggle(!open);
}
```

- Components, hooks and top-level module functions are `function` declarations; helpers declared **inside** them are `const x = () => {}` arrows, never nested `function`s
- **No inline types**: no inline object types in params, return types, generics or props (`(opts: { a: string })`, `useState<{ x: number }>()`, `Promise<{ ok: boolean }>`) — declare a named `interface`/`type`

## React 19

- Use the `use()` hook for async data in client components, not `useEffect` + `useState`
- **Never** use `useCallback`/`useMemo`/`memo` — the compiler handles memoization
- **Never** call `setState` synchronously in a `useEffect` body — derive from existing values, or set state only in async callbacks (`.then()`, event handlers)

## Forms

TanStack Form via `useAppForm` from `@/components/ui/form` (`createFormHook`) with Zod v4 validators. Fields render through `form.AppField` and the bound components (`TextField`, `Select`, `Checkbox`); never pass `form` as a prop:

```tsx
import { z } from "zod/v4";

const form = useAppForm({
  defaultValues: { email: "", password: "" },
  validators: { onSubmit: loginSchema },
  onSubmit: async ({ value }) => { ... },
});

<form.AppField name="email">{(field) => <field.TextField label="Email" type="email" />}</form.AppField>
```

## Encryption in Components

- Call `useVault()` to get `getProjectDEK(projectId)` for any read/write of encrypted data
- Encrypt before sending with `encryptBinary(bytes, dek)` → `{ciphertext, iv, authTag}`
- Decrypt after fetching: `await decrypt(data.encryptedValue, data.iv, data.authTag, dek)`
- Decrypt-on-load: `useQuery` keyed on the file id + version (`queryKeys.files.decryptedText`/`versionDiff`) with `gcTime: 0` so plaintext leaves the cache on unmount; see `use-decrypted-text.ts`
- Share links: `encryptForShare(content)` returns the ciphertext and a `fragment`; the link is `shareUrl + '#' + fragment`. The recipient reads the key before consuming the link and strips it from the URL afterwards

## UI (MUI 9)

- Prefer MUI components over raw HTML; import from the barrel — `import { Button } from "@mui/material"`, never deep imports
- All styling via the `sx` prop — system props (`mt`, `alignItems`) are gone in v9. Animations via CSS utility classes in `globals.css`
- Layout with Box/Stack/Grid (`size={{ xs, sm, md }}`, not v5 `item` + `xs`). App shell = persistent sidebar + top app bar
- MUI Table with `SortableHeader` / `PaginationBar` from `@/components/ui/data-display` for sortable grids; Typography with semantic variants

## Testing

- Vitest + React Testing Library; co-locate as `{component}.test.tsx`
- Test utils, hooks, crypto modules (`lib/crypto/*.test.ts`), and component interactions/output
